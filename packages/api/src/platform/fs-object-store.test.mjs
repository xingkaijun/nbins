import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertSafeObjectKey, FileSystemObjectStore, guessContentType } from "./fs-object-store.ts";

function withStore(fn) {
  const dir = mkdtempSync(join(tmpdir(), "nbins-store-"));
  return Promise.resolve()
    .then(() => fn(new FileSystemObjectStore(dir), dir))
    .finally(() => rmSync(dir, { recursive: true, force: true }));
}

test("put/get round-trips text and binary with metadata", () =>
  withStore(async (store, dir) => {
    const info = await store.put("ncrs/ncr-1.json", JSON.stringify({ id: "ncr-1" }), {
      httpMetadata: { contentType: "application/json" }
    });
    assert.equal(info.key, "ncrs/ncr-1.json");
    assert.ok(info.size > 0);
    assert.match(info.httpEtag, /^".+"$/);

    const json = await store.get("ncrs/ncr-1.json");
    assert.deepEqual(JSON.parse(await json.text()), { id: "ncr-1" });
    assert.deepEqual(await json.json(), { id: "ncr-1" });
    assert.equal(json.httpMetadata.contentType, "application/json");

    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    await store.put("media/ship-1/a.png", bytes.buffer, {
      httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=31536000" }
    });
    const image = await store.get("media/ship-1/a.png");
    assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes);
    assert.equal(image.httpMetadata.cacheControl, "private, max-age=31536000");
    assert.equal(image.size, 5);

    // Bytes are stored under their key, metadata separately.
    assert.ok(existsSync(join(dir, "objects", "media", "ship-1", "a.png")));
    assert.ok(existsSync(join(dir, "meta", "media", "ship-1", "a.png.json")));

    // Overwrite replaces content and metadata.
    await store.put("ncrs/ncr-1.json", "{}", { httpMetadata: { contentType: "text/plain" } });
    const replaced = await store.get("ncrs/ncr-1.json");
    assert.equal(await replaced.text(), "{}");
    assert.equal(replaced.httpMetadata.contentType, "text/plain");

    // No temp files are left behind.
    assert.deepEqual(readdirSync(join(dir, "objects", "ncrs")), ["ncr-1.json"]);
  }));

test("missing objects return null and delete is idempotent", () =>
  withStore(async (store) => {
    assert.equal(await store.get("nope/x.json"), null);
    assert.equal(await store.head("nope/x.json"), null);
    await store.put("a/b.txt", "x");
    await store.delete("a/b.txt");
    await store.delete(["a/b.txt", "a/c.txt"]);
    assert.equal(await store.get("a/b.txt"), null);
  }));

test("list filters by prefix, sorts keys and pages with a cursor", () =>
  withStore(async (store) => {
    for (const key of ["media/s1/c.jpg", "media/s1/a.jpg", "media/s2/z.jpg", "ncrs/1.json", "media/s1/b.jpg"]) {
      await store.put(key, key);
    }

    const all = await store.list({ prefix: "media/s1/" });
    assert.deepEqual(all.objects.map((o) => o.key), ["media/s1/a.jpg", "media/s1/b.jpg", "media/s1/c.jpg"]);
    assert.equal(all.truncated, false);

    const first = await store.list({ prefix: "media/", limit: 2 });
    assert.deepEqual(first.objects.map((o) => o.key), ["media/s1/a.jpg", "media/s1/b.jpg"]);
    assert.equal(first.truncated, true);
    const second = await store.list({ prefix: "media/", limit: 2, cursor: first.cursor });
    assert.deepEqual(second.objects.map((o) => o.key), ["media/s1/c.jpg", "media/s2/z.jpg"]);
    assert.equal(second.truncated, false);

    assert.deepEqual((await store.list({ prefix: "empty/" })).objects, []);
  }));

test("keys that could escape the store are rejected", () =>
  withStore(async (store) => {
    for (const key of ["", "/etc/passwd", "../x", "a/../../x", "a//b", "a/./b", "a\\b", "a\0b"]) {
      assert.throws(() => assertSafeObjectKey(key), /OBJECT_KEY_INVALID/, `key ${JSON.stringify(key)}`);
      await assert.rejects(store.put(key, "x"), /OBJECT_KEY_INVALID/);
      await assert.rejects(store.get(key), /OBJECT_KEY_INVALID/);
    }
    assert.doesNotThrow(() => assertSafeObjectKey("media/ship-A1/abc-photo.v2.jpg"));
  }));

test("files copied in without metadata (bucket import) are served with a guessed content type", () =>
  withStore(async (store, dir) => {
    mkdirSync(join(dir, "objects", "media", "ship-9"), { recursive: true });
    writeFileSync(join(dir, "objects", "media", "ship-9", "photo.JPG"), "jpegbytes");

    const object = await store.get("media/ship-9/photo.JPG");
    assert.equal(await object.text(), "jpegbytes");
    assert.equal(object.httpMetadata.contentType, "image/jpeg");
    assert.deepEqual((await store.list({ prefix: "media/ship-9/" })).objects.map((o) => o.key), ["media/ship-9/photo.JPG"]);
    assert.equal(guessContentType("ncrs/x.pdf"), "application/pdf");
    assert.equal(guessContentType("noext"), undefined);
  }));

// --- long but legal file names --------------------------------------------------
// A path component may be 255 bytes (ext4) / 255 UTF-16 units (NTFS). Uploads
// used to fail with ENAMETOOLONG because the temporary file appended
// `.tmp-<pid>-<uuid>` to the full basename and because the metadata is stored as
// `<basename>.json`. These tests use the real file system.

/** 250 "a" + ".pdf": 254 bytes, the shape of the reported long upload basename. */
const LONG_ASCII = `${"a".repeat(250)}.pdf`;
/** 83 Chinese characters (249 bytes) + ".pdf" -> 253 bytes, still a legal basename. */
const LONG_CJK = `${"检".repeat(83)}.pdf`;
/** 251 "b" + ".pdf" -> 255 bytes: as long as a legal basename gets. */
const MAX_ASCII = `${"b".repeat(251)}.pdf`;

const META_FALLBACK = /^\.meta-[0-9a-f]{32}\.json$/;

function namesIn(...segments) {
  return readdirSync(join(...segments)).sort();
}

function utf8Length(value) {
  return Buffer.byteLength(value, "utf8");
}

test("put/get/head/delete round-trip a long ASCII basename with fallback metadata", () =>
  withStore(async (store, dir) => {
    const key = `ncr-files/ship-1/ncr-1/${LONG_ASCII}`;
    assert.ok(utf8Length(LONG_ASCII) < 255);
    assert.ok(utf8Length(`${LONG_ASCII}.json`) > 255, "the <basename>.json name cannot fit");

    const info = await store.put(key, "pdf-bytes", {
      httpMetadata: { contentType: "application/pdf", cacheControl: "private, max-age=60" },
      customMetadata: { uploadedBy: "user-1" }
    });
    assert.equal(info.key, key);
    assert.equal(info.size, "pdf-bytes".length);
    assert.equal(info.httpMetadata.contentType, "application/pdf");
    assert.deepEqual(info.customMetadata, { uploadedBy: "user-1" });

    const object = await store.get(key);
    assert.equal(await object.text(), "pdf-bytes");
    assert.equal((await store.head(key)).etag, info.etag);

    // Bytes keep their own name; metadata moved to the hashed short name.
    assert.deepEqual(namesIn(dir, "objects", "ncr-files", "ship-1", "ncr-1"), [LONG_ASCII]);
    const metaNames = namesIn(dir, "meta", "ncr-files", "ship-1", "ncr-1");
    assert.equal(metaNames.length, 1);
    assert.match(metaNames[0], META_FALLBACK);

    // Listing shows the object, never the temporary or metadata files.
    const listed = await store.list({ prefix: "ncr-files/ship-1/" });
    assert.deepEqual(listed.objects.map((entry) => entry.key), [key]);

    await store.delete(key);
    assert.equal(await store.get(key), null);
    assert.deepEqual(namesIn(dir, "meta", "ncr-files", "ship-1", "ncr-1"), []);
  }));

test("a basename at the 255-byte limit stores, reads, lists and deletes", () =>
  withStore(async (store, dir) => {
    const key = `media/ship-1/${MAX_ASCII}`;
    assert.equal(utf8Length(MAX_ASCII), 255);

    await store.put(key, new Uint8Array([1, 2, 3]));
    assert.deepEqual(new Uint8Array(await (await store.get(key)).arrayBuffer()), new Uint8Array([1, 2, 3]));
    assert.deepEqual(namesIn(dir, "objects", "media", "ship-1"), [MAX_ASCII]);
    assert.match(namesIn(dir, "meta", "media", "ship-1")[0], META_FALLBACK);
    assert.deepEqual((await store.list({ prefix: "media/ship-1/" })).objects.map((entry) => entry.key), [key]);

    await store.delete(key);
    assert.equal(await store.head(key), null);
    assert.deepEqual((await store.list({ prefix: "media/ship-1/" })).objects, []);
    assert.deepEqual(namesIn(dir, "meta", "media", "ship-1"), []);
  }));

test("long Chinese basenames round-trip and keep their content type", () =>
  withStore(async (store, dir) => {
    const key = `ncr-files/ship-1/ncr-1/${LONG_CJK}`;
    assert.ok(utf8Length(LONG_CJK) < 255);
    assert.ok(utf8Length(`${LONG_CJK}.json`) > 255, "the <basename>.json name cannot fit");

    await store.put(key, "cjk", { httpMetadata: { contentType: "application/pdf", cacheControl: "private" } });
    const object = await store.head(key);
    assert.equal(object.httpMetadata.contentType, "application/pdf");
    assert.equal(object.httpMetadata.cacheControl, "private");
    assert.equal(await (await store.get(key)).text(), "cjk");

    assert.deepEqual(namesIn(dir, "objects", "ncr-files", "ship-1", "ncr-1"), [LONG_CJK]);
    assert.match(namesIn(dir, "meta", "ncr-files", "ship-1", "ncr-1")[0], META_FALLBACK);
    assert.deepEqual((await store.list({ prefix: "ncr-files/" })).objects.map((entry) => entry.key), [key]);

    await store.delete(key);
    assert.equal(await store.get(key), null);
  }));

test("the metadata name switches only when <basename>.json no longer fits", () =>
  withStore(async (store, dir) => {
    // 245 "c" + ".json" = 250 bytes, so the meta name is exactly 255: normal name.
    const fits = `media/ship-1/${"c".repeat(245)}.json`;
    await store.put(fits, "{}", { httpMetadata: { contentType: "application/json" } });
    assert.deepEqual(namesIn(dir, "meta", "media", "ship-1"), [`${"c".repeat(245)}.json.json`]);
    assert.equal((await store.head(fits)).httpMetadata.contentType, "application/json");

    // 250 "d" + ".json" = 255 bytes, so the meta name would be 260: fallback name.
    const overflows = `media/ship-1/${"d".repeat(250)}.json`;
    await store.put(overflows, "{}");
    const names = namesIn(dir, "meta", "media", "ship-1");
    assert.equal(names.length, 2);
    assert.equal(names.filter((name) => name.startsWith(".meta-")).length, 1);
    assert.ok(names.every((name) => utf8Length(name) <= 255));
    assert.deepEqual(
      (await store.list({ prefix: "media/ship-1/" })).objects.map((entry) => entry.key),
      [fits, overflows]
    );

    await store.delete([fits, overflows]);
    assert.deepEqual(namesIn(dir, "meta", "media", "ship-1"), []);
  }));

test("metadata under the ordinary <basename>.json name still loads", () =>
  withStore(async (store, dir) => {
    const name = `${"e".repeat(240)}.pdf`; // 244 bytes; `.json` gives 249 -> normal meta name
    const key = `media/ship-1/${name}`;
    await store.put(key, "body", { httpMetadata: { contentType: "application/pdf" } });
    assert.deepEqual(namesIn(dir, "meta", "media", "ship-1"), [`${name}.json`]);

    // Hand-copied object + metadata (bucket import): the .json is read as before.
    const imported = `media/ship-1/imported-${"f".repeat(240)}.pdf`;
    mkdirSync(join(dir, "objects", "media", "ship-1"), { recursive: true });
    writeFileSync(join(dir, "objects", "media", "ship-1", `imported-${"f".repeat(240)}.pdf`), "imported");
    const info = await store.head(imported);
    assert.equal(info.httpMetadata.contentType, "application/pdf");
    assert.ok(info.etag);
    assert.deepEqual((await store.list({ prefix: "media/" })).objects.map((entry) => entry.key), [key, imported]);
  }));

test("temporary write files are never listed, including the historic `.tmp-<pid>-<uuid>` names", () =>
  withStore(async (store, dir) => {
    const uploads = join(dir, "objects", "media", "ship-1");
    mkdirSync(uploads, { recursive: true });
    writeFileSync(join(uploads, "real.png"), "real");
    // Old naming scheme: `<object name>.tmp-<pid>-<uuid>` left behind by a crash.
    writeFileSync(join(uploads, "real.png.tmp-4242-3f1b7c0e-5a2d-4c1b-9e6f-123456789abc"), "partial");
    // New naming scheme: `.tmp-<uuid>`.
    writeFileSync(join(uploads, ".tmp-3f1b7c0e-5a2d-4c1b-9e6f-123456789abc"), "partial");

    assert.deepEqual(namesIn(dir, "objects", "media", "ship-1"), [
      ".tmp-3f1b7c0e-5a2d-4c1b-9e6f-123456789abc",
      "real.png",
      "real.png.tmp-4242-3f1b7c0e-5a2d-4c1b-9e6f-123456789abc"
    ]);
    assert.deepEqual(
      (await store.list({ prefix: "media/ship-1/" })).objects.map((entry) => entry.key),
      ["media/ship-1/real.png"]
    );
    assert.deepEqual((await store.list({ prefix: "media/" })).objects.map((entry) => entry.key), ["media/ship-1/real.png"]);
  }));

test("a failed write leaves no temporary file behind", () =>
  withStore(async (store, dir) => {
    const key = `media/ship-1/${LONG_ASCII}`;
    const invalid = `media/ship-1/${LONG_ASCII.slice(0, 10)}\0${LONG_ASCII.slice(11)}`;
    await assert.rejects(store.put(invalid, "x"), /OBJECT_KEY_INVALID/);

    // A directory where the object file should go: the temp write succeeds and
    // the rename fails, so the cleanup path runs.
    const store2 = new FileSystemObjectStore(join(dir, "blocked"));
    const target = join(dir, "blocked", "objects", "media", "ship-1", LONG_ASCII);
    mkdirSync(target, { recursive: true });
    await assert.rejects(store2.put(key, "x"));
    assert.deepEqual(namesIn(dir, "blocked", "objects", "media", "ship-1"), [LONG_ASCII]);
    assert.ok(statSync(target).isDirectory());
  }));
