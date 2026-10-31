import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
