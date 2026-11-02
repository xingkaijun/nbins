import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMediaFilename,
  getMediaObjectKey,
  getNcrFileObjectKey,
  getNcrFileObjectKeyForUpload,
  getObjectFilename,
  isPhysicalObjectKeySafe,
  resolveMediaUploadObjectKey,
  sanitizeExtension,
  sanitizeFilename
} from "./ncr-storage.ts";

// Object keys must stay within what a file system accepts for one path
// component: 255 bytes (ext4) / 255 UTF-16 units (NTFS). These builders turn
// user-supplied file names into the stored name.

const MAX_UPLOAD_NAME = `${"a".repeat(251)}.pdf`; // exactly 255 bytes
const REPORTED_NAME = `${"a".repeat(180)}.pdf`;
const LONG_CJK_NAME = `${"检".repeat(83)}.pdf`; // 253 bytes

function mediaKey(fileName, { variant = null, baseId = "", originalName = fileName } = {}) {
  return resolveMediaUploadObjectKey({ shipId: "ship-A1", baseId, originalName, variant, fileName });
}

test("every generated key fits a directory entry", () => {
  const names = [MAX_UPLOAD_NAME, REPORTED_NAME, LONG_CJK_NAME, `${"x".repeat(400)}.pdf`, "x.png", "noext"];
  for (const name of names) {
    for (const variant of [null, "original", "medium", "thumb"]) {
      for (const baseId of ["", "0f0e1d2c-0000-4000-8000-000000000000"]) {
        const key = mediaKey(name, { variant, baseId });
        assert.ok(isPhysicalObjectKeySafe(key), key);
      }
    }
    assert.ok(isPhysicalObjectKeySafe(getNcrFileObjectKeyForUpload("s", "n", "11111111-2222-4333-8444-555555555555", name)));
  }
});

test("short names keep their historic key shape", () => {
  // NCR / FAT editor attachments: `<uuid>-<name>` under media/<ship>/.
  assert.match(mediaKey("deck.png"), /^media\/ship-A1\/[0-9a-f-]{36}-deck\.png$/);
  assert.match(
    mediaKey("deck.png", { variant: "thumb" }),
    /^media\/ship-A1\/[0-9a-f-]{36}-deck_thumb\.png$/
  );

  // Image uploader: `<baseId>-<name>[_variant].webp`, which the gallery derives from.
  const baseId = "0f0e1d2c-0000-4000-8000-000000000000";
  assert.equal(mediaKey("deck.png", { baseId, variant: "original" }), `media/ship-A1/${baseId}-deck.webp`);
  assert.equal(mediaKey("deck.png", { baseId, variant: "thumb" }), `media/ship-A1/${baseId}-deck_thumb.webp`);
  assert.equal(
    buildMediaFilename(baseId, "deck.png"),
    `${baseId}-deck.webp`
  );

  // NCR attachments: `<fileId>-<name>`, unchanged for ordinary names.
  assert.equal(
    getNcrFileObjectKeyForUpload("ship-A1", "ncr-1", "file-1", "report.pdf"),
    "ncr-files/ship-A1/ncr-1/file-1-report.pdf"
  );
});

test("a 255-byte upload name falls back to a short key", () => {
  // `<uuid>-<255-byte name>` is 292 units: not a legal directory entry.
  const key = mediaKey(MAX_UPLOAD_NAME);
  assert.match(key, /^media\/ship-A1\/[0-9a-f]{32}\.pdf$/);

  // A 180-byte name still fits `media/ship-A1/` + uuid + name (old reports).
  const reported = mediaKey(REPORTED_NAME);
  assert.match(reported, /^media\/ship-A1\/[0-9a-f-]{36}-a+\.pdf$/);
  assert.ok(isPhysicalObjectKeySafe(reported));
});

test("long names keep their extension and variant marker", () => {
  const fileId = "11111111-2222-4333-8444-555555555555";
  // `<fileId>-` is 37 bytes, so a 184-byte name still fits one entry: unchanged shape.
  const reported = getNcrFileObjectKeyForUpload("ship-A1", "ncr-1", fileId, REPORTED_NAME);
  assert.equal(reported, `ncr-files/ship-A1/ncr-1/${fileId}-${REPORTED_NAME}`);
  assert.equal(isPhysicalObjectKeySafe(reported), true);

  // 253-byte Chinese and 255-byte names do not fit with the id; the id and the
  // extension survive, the name is kept by the record.
  for (const name of [LONG_CJK_NAME, MAX_UPLOAD_NAME]) {
    const key = getNcrFileObjectKeyForUpload("ship-A1", "ncr-1", fileId, name);
    assert.equal(key, `ncr-files/ship-A1/ncr-1/${fileId.replace(/-/g, "")}.pdf`, name);
    assert.equal(isPhysicalObjectKeySafe(key), true);
  }

  // Image uploader: the `<base>[_thumb|_medium].webp` pair stays derivable for
  // long names, because the gallery requests the variant name, not the record.
  const baseId = "0f0e1d2c-0000-4000-8000-000000000000";
  for (const name of [MAX_UPLOAD_NAME, LONG_CJK_NAME]) {
    for (const variant of ["original", "medium", "thumb"]) {
      const key = mediaKey(name, { baseId, variant });
      const suffix = variant === "original" ? "" : `_${variant}`;
      assert.equal(key, `media/ship-A1/${baseId}${suffix}.webp`, variant);
    }
  }
  // A legal 184-byte name keeps the described key.
  assert.equal(mediaKey(REPORTED_NAME, { baseId, variant: "thumb" }), `media/ship-A1/${baseId}-${REPORTED_NAME.replace(/\.pdf$/, "")}_thumb.webp`);
});

test("dangerous names never become a path", () => {
  assert.equal(sanitizeFilename("  a  b  "), "a-b");
  assert.equal(sanitizeExtension("file.PDF"), ".pdf");
  assert.equal(sanitizeExtension("file.verylongextension"), "");
  assert.equal(sanitizeExtension("noext"), "");
  for (const name of ["../etc/passwd", "..", "a\0b.png", "a/b.png", "a\\b.png"]) {
    const key = mediaKey(name);
    assert.ok(isPhysicalObjectKeySafe(key), key);
    assert.equal(key.split("/").length, 3, key);
  }
});

test("the old key builder is unchanged for ordinary names (stored records still resolve)", () => {
  const key = getNcrFileObjectKey("ship-A1", "ncr-1", "file-1", "report.pdf");
  assert.equal(key, "ncr-files/ship-A1/ncr-1/file-1-report.pdf");
  assert.equal(getObjectFilename(key), "file-1-report.pdf");
  assert.equal(getObjectFilename(getMediaObjectKey("ship-A1", "abc-deck.png")), "abc-deck.png");
});
