import { Hono } from "hono";
import { createRequireAuth } from "../auth.ts";
import type { AuthContextVariables } from "../auth.ts";
import type { Bindings } from "../env.ts";
import type { NcrPdfMeta } from "@nbins/shared";
import {
  assertBucket,
  getNcrPdfObjectKey,
  hasProjectAccess,
  readStoredNcrById,
  type StoredNcrRecord,
  upsertNcrIndex,
  writeStoredNcr
} from "../services/ncr-storage.ts";

type NcrPdfRouteEnv = { Bindings: Bindings; Variables: AuthContextVariables };

function hasNonAscii(value: string): boolean {
  return /[^\x00-\x7F]/.test(value);
}

function escapePdfLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function toUtf16BEHex(value: string): string {
  const codes: string[] = ["FEFF"];
  for (let i = 0; i < value.length; i++) {
    const cp = value.codePointAt(i)!;
    if (cp > 0xFFFF) {
      // surrogate pair
      const hi = 0xD800 + ((cp - 0x10000) >> 10);
      const lo = 0xDC00 + ((cp - 0x10000) & 0x3FF);
      codes.push(hi.toString(16).toUpperCase().padStart(4, "0"));
      codes.push(lo.toString(16).toUpperCase().padStart(4, "0"));
      i++; // skip surrogate pair
    } else {
      codes.push(cp.toString(16).toUpperCase().padStart(4, "0"));
    }
  }
  return codes.join("");
}

function pdfTextOperator(value: string): string {
  if (hasNonAscii(value)) {
    return `<${toUtf16BEHex(value)}> Tj`;
  }
  return `(${escapePdfLiteral(value)}) Tj`;
}

function wrapText(value: string, maxLength = 60): string[] {
  const normalized = value.replace(/\r/g, "");
  const lines = normalized.split("\n");
  const wrapped: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      wrapped.push("");
      continue;
    }

    let remaining = line.trim();
    while (remaining.length > maxLength) {
      wrapped.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    }
    wrapped.push(remaining);
  }

  return wrapped;
}

function buildCidFontObjects(startObjNum: number): { objects: string[]; fontRef: string } {
  // CIDFont with Identity-H encoding for full Unicode support
  const cidFontObjNum = startObjNum;
  const fontDescObjNum = startObjNum + 1;
  const compositeObjNum = startObjNum + 2;

  const fontDescriptor = [
    `<< /Type /FontDescriptor /FontName /STSong-Light`,
    `/Flags 6 /ItalicAngle 0 /Ascent 859 /Descent -141`,
    `/CapHeight 683 /StemV 91`,
    `/FontBBox [-134 -254 1001 905] >>`
  ].join(" ");

  const cidFont = [
    `<< /Type /Font /Subtype /CIDFontType0`,
    `/BaseFont /STSong-Light`,
    `/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >>`,
    `/FontDescriptor ${fontDescObjNum} 0 R`,
    `/DW 1000 >>`
  ].join(" ");

  const compositeFont = [
    `<< /Type /Font /Subtype /Type0`,
    `/BaseFont /STSong-Light`,
    `/Encoding /Identity-H`,
    `/DescendantFonts [${cidFontObjNum} 0 R] >>`
  ].join(" ");

  return {
    objects: [cidFont, fontDescriptor, compositeFont],
    fontRef: `${compositeObjNum} 0 R`
  };
}

function buildSimplePdf(record: StoredNcrRecord): Uint8Array {
  const pageWidth = 595;
  const pageHeight = 842;
  const lineHeight = 16;
  const marginLeft = 50;
  const marginTop = 780;
  const maxLinesPerPage = 42;
  const lines = [
    `NBINS NCR REPORT`,
    `NCR ID: ${record.id}`,
    `Project ID: ${record.projectId}`,
    `Ship ID: ${record.shipId}`,
    `Status: ${record.status}`,
    `Created At: ${record.createdAt}`,
    `Updated At: ${record.updatedAt}`,
    `Author: ${record.authorId}`,
    `Approved By: ${record.approvedBy ?? "-"}`,
    `Approved At: ${record.approvedAt ?? "-"}`,
    `Remark: ${record.remark ?? "-"}`,
    ``,
    `Title:`,
    ...wrapText(record.title),
    ``,
    `Content:`,
    ...wrapText(record.content),
    ``,
    `Image Attachments: ${record.imageAttachments.length}`,
    ...record.imageAttachments.flatMap((item) => wrapText(`- ${item}`)),
    ``,
    `Related Files: ${record.relatedFiles.length}`,
    ...record.relatedFiles.flatMap((file) => wrapText(`- ${file.name} (${file.contentType}, ${file.size} bytes)`))
  ];

  const needsCjk = lines.some(hasNonAscii);

  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += maxLinesPerPage) {
    pages.push(lines.slice(index, index + maxLinesPerPage));
  }

  const objects: string[] = [];
  const pageRefs: number[] = [];

  // Reserve object slots: 1=Catalog, 2=Pages, then 2*pages for Page+Stream
  const afterPagesObjNum = pages.length * 2 + 3;

  let helveticaObjNum = afterPagesObjNum;
  let cjkFontRef = "";
  let fontDictEntries = `/F1 ${helveticaObjNum} 0 R`;
  const extraObjects: string[] = ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];

  if (needsCjk) {
    const cjkStartObjNum = helveticaObjNum + 1;
    const cjk = buildCidFontObjects(cjkStartObjNum);
    cjkFontRef = cjk.fontRef;
    fontDictEntries += ` /F2 ${cjkFontRef}`;
    extraObjects.push(...cjk.objects);
  }

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [] /Count 0 >>");

  pages.forEach((pageLines, pageIndex) => {
    const pageObjectNumber = pageIndex * 2 + 3;
    const contentObjectNumber = pageIndex * 2 + 4;
    pageRefs.push(pageObjectNumber);

    const contentParts: string[] = ["BT"];

    for (let lineIndex = 0; lineIndex < pageLines.length; lineIndex++) {
      const line = pageLines[lineIndex];
      const useCjk = needsCjk && hasNonAscii(line);

      if (lineIndex === 0) {
        contentParts.push(useCjk ? "/F2 11 Tf" : "/F1 11 Tf");
        contentParts.push(`${marginLeft} ${marginTop} Td`);
      } else {
        contentParts.push(`0 -${lineHeight} Td`);
        contentParts.push(useCjk ? "/F2 11 Tf" : "/F1 11 Tf");
      }
      contentParts.push(pdfTextOperator(line));
    }

    contentParts.push("ET");
    const content = contentParts.join("\n");

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << ${fontDictEntries} >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;
  objects.push(...extraObjects);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export async function generateNcrPdfForRecord(env: Bindings, record: StoredNcrRecord): Promise<StoredNcrRecord> {
  const bucket = assertBucket(env);
  const objectKey = getNcrPdfObjectKey(record.shipId, record.id);
  const pdfBytes = buildSimplePdf(record);
  const generatedAt = new Date().toISOString();
  const nextMeta: NcrPdfMeta = {
    objectKey,
    generatedAt,
    version: (record.pdf?.version ?? 0) + 1
  };

  await bucket.put(objectKey, pdfBytes, {
    httpMetadata: {
      contentType: "application/pdf",
      contentDisposition: `attachment; filename="NCR-${record.id}.pdf"`
    }
  });

  const nextRecord: StoredNcrRecord = {
    ...record,
    pdf: nextMeta
  };

  await writeStoredNcr(env, nextRecord);
  await upsertNcrIndex(env, nextRecord);
  return nextRecord;
}


export function createNcrPdfRoutes(): Hono<NcrPdfRouteEnv> {
  const routes = new Hono<NcrPdfRouteEnv>();
  routes.use("*", createRequireAuth());

  routes.post("/:id/pdf", async (c) => {
    try {
      const authUser = c.get("authUser");
      const record = await readStoredNcrById(c.env, c.req.param("id"));
      if (!record) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, record.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      if (record.status !== "approved") {
        return c.json({ ok: false, error: "NCR must be published before generating the official PDF" }, 409);
      }

      const nextRecord = await generateNcrPdfForRecord(c.env, record);
      return c.json({ ok: true, data: nextRecord.pdf! });

    } catch (error) {
      console.error("POST /ncrs/:id/pdf error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.get("/:id/pdf", async (c) => {
    try {
      const authUser = c.get("authUser");
      let record = await readStoredNcrById(c.env, c.req.param("id"));
      if (!record) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, record.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      if (!record.pdf?.objectKey) {
        if (record.status !== "approved") {
          return c.json({ ok: false, error: "NCR must be published before downloading the official PDF" }, 409);
        }

        record = await generateNcrPdfForRecord(c.env, record);
      }


      const bucket = assertBucket(c.env);
      const object = await bucket.get(record.pdf!.objectKey);
      if (!object) {
        return c.json({ ok: false, error: "PDF object missing" }, 404);
      }

      const headers = new Headers();
      headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/pdf");
      headers.set("Content-Disposition", `attachment; filename="NCR-${record.id}.pdf"`);
      headers.set("ETag", object.httpEtag);
      return new Response(await object.arrayBuffer(), { status: 200, headers });

    } catch (error) {
      console.error("GET /ncrs/:id/pdf error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  return routes;
}
