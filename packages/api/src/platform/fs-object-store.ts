/**
 * FileSystemObjectStore: the production ObjectStore, a plain directory tree.
 *
 *   <root>/objects/<key>        the object bytes (e.g. objects/media/ship-1/a.jpg)
 *   <root>/meta/<key>.json      its metadata (content type, cache headers, ...)
 *
 * Keeping the bytes under their own key means a backup is a plain copy of the
 * directory, and data downloaded from an S3-compatible bucket (e.g. with
 * `rclone copy`) can be dropped into objects/ as is: an object without a
 * metadata file gets its content type from the file extension.
 *
 * Writes go to a temporary file first and are renamed into place, so a reader
 * never sees half an object. Keys are validated so they cannot leave the root.
 *
 * File-name limits: a path component may be at most 255 bytes (255 UTF-16 units
 * on NTFS, 255 bytes on ext4). Object keys arrive with long, legal basenames
 * (e.g. a 250-byte attachment name), so:
 *   - the temporary file is `.tmp-<uuid>` in the target directory, never
 *     `<basename>.tmp-<pid>-<uuid>` (which used to overflow the limit);
 *   - when `<basename>.json` would not fit, the metadata is kept next to the
 *     object as `.meta-<hash>.json` instead (read/delete look at both names).
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import type {
  ObjectBody,
  ObjectHttpMetadata,
  ObjectListOptions,
  ObjectListResult,
  ObjectPutOptions,
  ObjectStore,
  StoredObject,
  StoredObjectInfo
} from "./object-store.ts";

const META_SUFFIX = ".json";
const DEFAULT_LIST_LIMIT = 1000;
/** Longest file name a filesystem is expected to accept (ext4 bytes, NTFS UTF-16 units). */
const MAX_FILE_NAME_LENGTH = 255;
const MAX_FILE_NAME_BYTES = 255;
/** `<basename>.json` is kept when it fits; otherwise `.meta-<hash>.json` is used. */
const FALLBACK_META_PREFIX = ".meta-";
/**
 * Temporary write files: `<dir>/.tmp-<uuid>` (new form) and the historic
 * `<basename>.tmp-<pid>-<uuid>`. Both must stay out of list() results.
 */
const TMP_FILE_PATTERN = /^(?:\.tmp-[0-9a-f-]{36}|.*\.tmp-\d+-[0-9a-f-]{36})$/;
/** `.meta-<sha256 prefix>.json`, written when `<basename>.json` would be too long. */
const FALLBACK_META_PATTERN = /^\.meta-[0-9a-f]{28,64}\.json$/;

/**
 * ext4 counts bytes, NTFS counts UTF-16 units; a name is safe only if it fits
 * both, so a long Chinese name and a long ASCII name behave the same everywhere.
 */
function fitsFileName(name: string): boolean {
  return name.length <= MAX_FILE_NAME_LENGTH && Buffer.byteLength(name, "utf8") <= MAX_FILE_NAME_BYTES;
}

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".bmp": "image/bmp",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
  ".mp4": "video/mp4"
};

interface MetaFile {
  httpMetadata?: Omit<ObjectHttpMetadata, "cacheExpiry"> & { cacheExpiry?: string };
  customMetadata?: Record<string, string>;
  etag?: string;
}

export function guessContentType(key: string): string | undefined {
  const dot = key.lastIndexOf(".");
  if (dot < 0 || dot < key.lastIndexOf("/")) {
    return undefined;
  }
  return CONTENT_TYPES[key.slice(dot).toLowerCase()];
}

/** Throws for keys that are empty, absolute, contain `.`/`..` segments, backslashes or NUL. */
export function assertSafeObjectKey(key: string): void {
  if (typeof key !== "string" || key.length === 0 || key.length > 1024) {
    throw new Error("OBJECT_KEY_INVALID: key must be a non-empty string up to 1024 characters");
  }
  if (key.startsWith("/") || key.includes("\\") || key.includes("\0")) {
    throw new Error(`OBJECT_KEY_INVALID: ${JSON.stringify(key)}`);
  }
  for (const segment of key.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new Error(`OBJECT_KEY_INVALID: ${JSON.stringify(key)}`);
    }
  }
}

function toBuffer(value: ObjectBody): Buffer {
  if (value === null) {
    return Buffer.alloc(0);
  }
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function isNotFound(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * ENOENT/ENOTDIR, plus ENAMETOOLONG — a file whose name exceeds the file
 * system limit cannot exist, so looking it up is "missing", not an error.
 */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "ENAMETOOLONG";
}

/** Metadata file contents, or null when the file is absent/unreadable as JSON. */
async function readMetaFile(path: string): Promise<MetaFile | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as MetaFile;
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

/** rm that also tolerates names the file system rejects as too long. */
async function removeFile(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
}

export class FileSystemObjectStore implements ObjectStore {
  readonly root: string;
  readonly #objectsDir: string;
  readonly #metaDir: string;

  constructor(root: string) {
    this.root = root;
    this.#objectsDir = join(root, "objects");
    this.#metaDir = join(root, "meta");
  }

  async put(key: string, value: ObjectBody, options: ObjectPutOptions = {}): Promise<StoredObjectInfo> {
    assertSafeObjectKey(key);
    const bytes = toBuffer(value);
    const etag = createHash("md5").update(bytes).digest("hex");
    const meta: MetaFile = {
      etag,
      httpMetadata: options.httpMetadata
        ? {
            ...options.httpMetadata,
            cacheExpiry: options.httpMetadata.cacheExpiry?.toISOString()
          }
        : undefined,
      customMetadata: options.customMetadata
    };

    await this.#writeAtomic(this.#objectPath(key), bytes);
    await this.#writeAtomic(this.#fallbackMetaPath(key) ?? this.#metaPath(key), Buffer.from(JSON.stringify(meta), "utf8"));

    const info = await this.head(key);
    if (!info) {
      throw new Error(`OBJECT_WRITE_FAILED: ${key}`);
    }
    return info;
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    assertSafeObjectKey(key);
    let fileStat;
    try {
      fileStat = await stat(this.#objectPath(key));
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
    if (!fileStat.isFile()) {
      return null;
    }

    const meta = await this.#readMeta(key);
    const etag = meta.etag ?? `${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}`;
    const httpMetadata: ObjectHttpMetadata = {
      ...meta.httpMetadata,
      contentType: meta.httpMetadata?.contentType ?? guessContentType(key),
      cacheExpiry: meta.httpMetadata?.cacheExpiry ? new Date(meta.httpMetadata.cacheExpiry) : undefined
    };

    return {
      key,
      size: fileStat.size,
      etag,
      httpEtag: `"${etag}"`,
      uploaded: fileStat.mtime,
      httpMetadata,
      customMetadata: meta.customMetadata ?? {}
    };
  }

  async get(key: string): Promise<StoredObject | null> {
    const info = await this.head(key);
    if (!info) {
      return null;
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(this.#objectPath(key));
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }

    return {
      ...info,
      async arrayBuffer() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      },
      async text() {
        return bytes.toString("utf8");
      },
      async json<T = unknown>() {
        return JSON.parse(bytes.toString("utf8")) as T;
      }
    };
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      assertSafeObjectKey(key);
      await removeFile(this.#objectPath(key));
      await removeFile(this.#metaPath(key));
      const fallbackMetaPath = this.#fallbackMetaPath(key);
      if (fallbackMetaPath) {
        await removeFile(fallbackMetaPath);
      }
    }
  }

  async list(options: ObjectListOptions = {}): Promise<ObjectListResult> {
    const prefix = options.prefix ?? "";
    const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIST_LIMIT, DEFAULT_LIST_LIMIT));
    const keys = (await this.#walk(this.#objectsDir))
      .filter((key) => key.startsWith(prefix))
      .sort();

    const startIndex = options.cursor ? keys.findIndex((key) => key > options.cursor!) : 0;
    const page = startIndex < 0 ? [] : keys.slice(startIndex, startIndex + limit);
    const truncated = startIndex >= 0 && startIndex + limit < keys.length;
    const objects: StoredObjectInfo[] = [];
    for (const key of page) {
      const info = await this.head(key);
      if (info) {
        objects.push(info);
      }
    }

    return truncated ? { objects, truncated, cursor: page[page.length - 1] } : { objects, truncated: false };
  }

  #objectPath(key: string): string {
    return join(this.#objectsDir, ...key.split("/"));
  }

  #metaPath(key: string): string {
    return join(this.#metaDir, ...key.split("/")) + META_SUFFIX;
  }

  /**
   * `.meta-<hash of key>.json` next to the metadata directory location, used
   * when `<basename>.json` would exceed the file-name limit. Sidecar of the
   * object in meta/, so listing objects/ never sees it either way.
   */
  #fallbackMetaPath(key: string): string | null {
    const primary = this.#metaPath(key);
    if (fitsFileName(basename(primary))) {
      return null;
    }
    const hash = createHash("sha256").update(key).digest("hex").slice(0, 32);
    return join(dirname(primary), `${FALLBACK_META_PREFIX}${hash}${META_SUFFIX}`);
  }

  async #readMeta(key: string): Promise<MetaFile> {
    const primaryPath = this.#metaPath(key);
    const fallbackPath = this.#fallbackMetaPath(key);
    if (fallbackPath) {
      // Long key: `<basename>.json` cannot exist, so a failed lookup is cheap.
      return (await readMetaFile(fallbackPath)) ?? (await readMetaFile(primaryPath)) ?? {};
    }
    return (await readMetaFile(primaryPath)) ?? {};
  }

  async #writeAtomic(path: string, bytes: Buffer): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    // A fixed short name in the target directory instead of `<basename>.tmp-...`:
    // a 250-byte object basename plus a suffix used to exceed the 255-byte limit.
    const tmp = join(dirname(path), `.tmp-${randomUUID()}`);
    try {
      await writeFile(tmp, bytes);
      await rename(tmp, path);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
  }

  async #walk(dir: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }

    const keys: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        keys.push(...(await this.#walk(full)));
      } else if (
        entry.isFile() &&
        !TMP_FILE_PATTERN.test(entry.name) &&
        // Our own long-key metadata must never be listed as an object. Covers the
        // `.json` twin of such an object too, should one ever be copied in.
        !FALLBACK_META_PATTERN.test(entry.name)
      ) {
        keys.push(relative(this.#objectsDir, full).split(sep).join("/"));
      }
    }
    return keys;
  }
}
