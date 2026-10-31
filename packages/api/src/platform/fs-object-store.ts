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
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
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
const TMP_FILE_PATTERN = /\.tmp-\d+-[0-9a-f-]{36}$/;

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
    await this.#writeAtomic(this.#metaPath(key), Buffer.from(JSON.stringify(meta), "utf8"));

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
      await rm(this.#objectPath(key), { force: true });
      await rm(this.#metaPath(key), { force: true });
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

  async #readMeta(key: string): Promise<MetaFile> {
    try {
      return JSON.parse(await readFile(this.#metaPath(key), "utf8")) as MetaFile;
    } catch (error) {
      if (isNotFound(error) || error instanceof SyntaxError) {
        return {};
      }
      throw error;
    }
  }

  async #writeAtomic(path: string, bytes: Buffer): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
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
      } else if (entry.isFile() && !TMP_FILE_PATTERN.test(entry.name)) {
        keys.push(relative(this.#objectsDir, full).split(sep).join("/"));
      }
    }
    return keys;
  }
}
