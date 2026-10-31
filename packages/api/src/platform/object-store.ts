/**
 * The object (file) store contract the API code is written against: NCR / FAT
 * JSON records, media uploads, NCR attachments and generated PDFs.
 *
 * It is the subset of the put/get/delete/list surface the code has always used
 * (originally modelled on Cloudflare R2), now owned by this repository. The
 * production implementation is FileSystemObjectStore (./fs-object-store.ts).
 */

export interface ObjectHttpMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

export interface ObjectPutOptions {
  httpMetadata?: ObjectHttpMetadata;
  customMetadata?: Record<string, string>;
}

export interface StoredObjectInfo {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: ObjectHttpMetadata;
  customMetadata?: Record<string, string>;
}

export interface StoredObject extends StoredObjectInfo {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export interface ObjectListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
}

export interface ObjectListResult {
  objects: StoredObjectInfo[];
  truncated: boolean;
  cursor?: string;
}

export type ObjectBody = string | ArrayBuffer | ArrayBufferView | null;

export interface ObjectStore {
  put(key: string, value: ObjectBody, options?: ObjectPutOptions): Promise<StoredObjectInfo>;
  get(key: string): Promise<StoredObject | null>;
  head(key: string): Promise<StoredObjectInfo | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: ObjectListOptions): Promise<ObjectListResult>;
}
