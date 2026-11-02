import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileSystemObjectStore } from "../platform/fs-object-store.ts";
import {
  getNcrFileObjectKey,
  getNcrFileObjectKeyForUpload,
  isPhysicalObjectKeySafe,
  resolveMediaUploadObjectKey
} from "../services/ncr-storage.ts";

// The upload routes build their key with resolveMediaUploadObjectKey /
// getNcrFileObjectKeyForUpload and write it through the real
// FileSystemObjectStore. These tests drive that exact sequence (the route
// wiring itself needs `hono`, which this checkout does not install), so long
// but legal upload names are exercised against the real file system.
const MAX_UPLOAD_NAME = `${"a".repeat(251)}.pdf`; // exactly 255 bytes
const REPORTED_NAME = `${"a".repeat(180)}.pdf`;
const LONG_CJK_NAME = `${"检".repeat(83)}.pdf`; // 253 bytes
const BASE_ID = "0f0e1d2c-1111-4222-8333-444455556666";
const FILE_ID = "11111111-2222-4333-8444-555555555555";

function withStore(fn) {
  const dir = mkdtempSync(join(tmpdir(), "nbins-keys-"));
  return Promise.resolve()
    .then(() => fn(new FileSystemObjectStore(dir), dir))
    .finally(() => rmSync(dir, { recursive: true, force: true }));
}

function mediaKey(fileName, { variant = null, baseId = "", originalName = fileName } = {}) {
  return resolveMediaUploadObjectKey({ shipId: "ship-A1", baseId, originalName, variant, fileName });
}

/** Every directory entry written under `dir` fits a file system. */
function oversizedEntries(dir) {
  return readdirSync(dir).filter((name) => name.length > 255 || Buffer.byteLength(name, "utf8") > 255);
}

test("media upload of a 255-byte name falls back to a short key and reads back", () =>
  withStore(async (store, dir) => {
    // `<uuid>-<255-byte name>` is 292 units: not a legal directory entry.
    const key = mediaKey(MAX_UPLOAD_NAME);
    assert.match(key, /^media\/ship-A1\/[0-9a-f]{32}\.pdf$/);

    await store.put(key, "img", { httpMetadata: { contentType: "image/png" } });
    const object = await store.get(key);
    assert.equal(await object.text(), "img");
    assert.equal(object.httpMetadata.contentType, "image/png");

    assert.deepEqual((await store.list({ prefix: "media/ship-A1/" })).objects.map((entry) => entry.key), [key]);
    assert.deepEqual(oversizedEntries(join(dir, "objects", "media", "ship-A1")), []);

    await store.delete(key);
    assert.equal(await store.head(key), null);
    assert.deepEqual((await store.list({ prefix: "media/ship-A1/" })).objects, []);
  }));

test("a 180-byte name (the reported upload) keeps the uuid-name key shape", () =>
  withStore(async (store) => {
    // 180 + ".pdf" + uuid prefix fits (230 units), so old-style keys keep working.
    const key = mediaKey(REPORTED_NAME);
    assert.match(key, /^media\/ship-A1\/[0-9a-f-]{36}-a+\.pdf$/);
    await store.put(key, "report");
    assert.equal(await (await store.get(key)).text(), "report");
    assert.deepEqual((await store.list({ prefix: "media/ship-A1/" })).objects.map((entry) => entry.key), [key]);
  }));

test("image variants of a 255-byte name stay derivable as <base>[_variant].webp", () =>
  withStore(async (store) => {
    for (const variant of ["original", "medium", "thumb"]) {
      const key = mediaKey(MAX_UPLOAD_NAME, { variant, baseId: BASE_ID });
      const suffix = variant === "original" ? "" : `_${variant}`;
      assert.equal(key, `media/ship-A1/${BASE_ID}${suffix}.webp`, variant);
      await store.put(key, variant, { httpMetadata: { contentType: "image/webp" } });
      assert.equal(await (await store.get(key)).text(), variant);
    }
    assert.equal((await store.list({ prefix: "media/ship-A1/" })).objects.length, 3);
  }));

test("media upload with a normal name keeps the existing key shape", () =>
  withStore(async (store) => {
    // NCR/FAT editor attachments: `<uuid>-<name>`; the gallery and exports
    // download by this stored file name.
    const key = mediaKey("deck.png");
    assert.match(key, /^media\/ship-A1\/[0-9a-f-]{36}-deck\.png$/);

    // Image uploader: `<baseId>-<name>_thumb.webp` for the derived variant.
    const labelled = mediaKey("deck.png", { variant: "thumb", baseId: BASE_ID });
    assert.equal(labelled, `media/ship-A1/${BASE_ID}-deck_thumb.webp`);

    await store.put(key, "png");
    assert.equal(await (await store.get(key)).text(), "png");
  }));

test("a long original name switches the whole variant group to the short key", () => {
  // 255 bytes: the original *could* keep its name, but medium (+7) cannot, so
  // all three variants must use the same shape or the gallery's derived keys
  // would point at objects that were never written.
  const keys = ["original", "medium", "thumb"].map((variant) =>
    mediaKey(MAX_UPLOAD_NAME, { variant, baseId: BASE_ID })
  );
  assert.deepEqual(keys, [
    `media/ship-A1/${BASE_ID}.webp`,
    `media/ship-A1/${BASE_ID}_medium.webp`,
    `media/ship-A1/${BASE_ID}_thumb.webp`
  ]);
  for (const key of keys) {
    assert.ok(isPhysicalObjectKeySafe(key), key);
    assert.match(key, /^media\/ship-A1\/[0-9a-f-]{36}(?:_medium|_thumb)?\.webp$/);
  }
});

test("an oversized base id is shortened to a stable key", () => {
  const longId = "ab".repeat(200); // 400 units: cannot head an entry even alone
  const first = mediaKey(MAX_UPLOAD_NAME, { variant: "thumb", baseId: longId });
  const second = mediaKey(MAX_UPLOAD_NAME, { variant: "thumb", baseId: longId });
  assert.equal(first, second); // hash, not a fresh random id
  assert.ok(isPhysicalObjectKeySafe(first), first);
  assert.match(first, /^media\/ship-A1\/(?:ab)+-[0-9a-f]{10}_thumb\.webp$/);

  // Ordinary UUIDs are untouched.
  assert.equal(mediaKey("deck.png", { variant: "thumb", baseId: BASE_ID }), `media/ship-A1/${BASE_ID}-deck_thumb.webp`);
});

// 83 Chinese characters are 253 bytes but 87 UTF-16 units, so the unit-based
// limit accepts them; Linux stores them as 253 bytes, Windows as 87 units.
const WIDE_LONG_NAME = `${"检".repeat(180)}.pdf`; // 544 bytes and 184 units

test("long Chinese upload names work for media and NCR attachments", () =>
  withStore(async (store) => {
    const mediaKeyCjk = mediaKey(LONG_CJK_NAME);
    assert.ok(isPhysicalObjectKeySafe(mediaKeyCjk), mediaKeyCjk);
    await store.put(mediaKeyCjk, "media-cjk");
    assert.equal(await (await store.get(mediaKeyCjk)).text(), "media-cjk");

    // Far past both limits (544 bytes) on either file system: short form.
    const ncrKey = getNcrFileObjectKeyForUpload("ship-A1", "ncr-1", FILE_ID, WIDE_LONG_NAME);
    assert.equal(ncrKey, `ncr-files/ship-A1/ncr-1/${FILE_ID.replace(/-/g, "")}.pdf`);
    await store.put(ncrKey, "ncr-cjk");
    assert.equal(await (await store.get(ncrKey)).text(), "ncr-cjk");

    const wideMediaKey = mediaKey(WIDE_LONG_NAME);
    assert.match(wideMediaKey, /^media\/ship-A1\/[0-9a-f]{32}\.pdf$/);
    await store.put(wideMediaKey, "media-wide");
    assert.equal(await (await store.get(wideMediaKey)).text(), "media-wide");
  }));

test("NCR attachment upload keys stay safe across name lengths", () =>
  withStore(async (store) => {
    const cases = [
      ["report.pdf", `ncr-files/ship-A1/ncr-1/${FILE_ID}-report.pdf`],
      // 37-byte id + 184-byte name = 221: still one directory entry.
      [REPORTED_NAME, `ncr-files/ship-A1/ncr-1/${FILE_ID}-${REPORTED_NAME}`],
      // 292 / 544 bytes with the id: falls back to id + extension.
      [MAX_UPLOAD_NAME, `ncr-files/ship-A1/ncr-1/${FILE_ID.replace(/-/g, "")}.pdf`],
      [WIDE_LONG_NAME, `ncr-files/ship-A1/ncr-1/${FILE_ID.replace(/-/g, "")}.pdf`]
    ];
    for (const [name, expected] of cases) {
      const key = getNcrFileObjectKeyForUpload("ship-A1", "ncr-1", FILE_ID, name);
      assert.equal(key, expected, name);
      assert.equal(isPhysicalObjectKeySafe(key), true);
      await store.put(key, name);
      assert.equal(await (await store.get(key)).text(), name);
      await store.delete(key);
      assert.equal(await store.head(key), null);
    }
  }));

test("attachments saved before the fix keep their keys and still download", () =>
  withStore(async (store) => {
    // Ordinary names were always stored verbatim; that builder is unchanged.
    const key = getNcrFileObjectKey("ship-A1", "ncr-1", "file-1", "report.pdf");
    assert.equal(key, "ncr-files/ship-A1/ncr-1/file-1-report.pdf");
    await store.put(key, "legacy");
    assert.equal(await (await store.get(key)).text(), "legacy");

    // A 180-byte name's key fits and is stored under exactly that old shape.
    const legacyLong = getNcrFileObjectKey("ship-A1", "ncr-1", "file-1", REPORTED_NAME);
    await store.put(legacyLong, "legacy-long");
    assert.equal(await (await store.get(legacyLong)).text(), "legacy-long");
    assert.deepEqual(
      (await store.list({ prefix: "ncr-files/ship-A1/ncr-1/" })).objects.map((entry) => entry.key).sort(),
      [key, legacyLong].sort()
    );
  }));
