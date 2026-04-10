import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import type { ObservationItem, InspectionCommentView } from '@nbins/shared';
import { PG_LOGO_B64 } from './pg-logo-b64';

function drawPdfLogo(doc: jsPDF, x: number, y: number, targetHeight: number = 10) {
  const properties = doc.getImageProperties(PG_LOGO_B64);
  const aspectRatio = properties.width / (properties.height || 1);
  const targetWidth = targetHeight * aspectRatio;
  doc.addImage(PG_LOGO_B64, 'JPEG', x, y, targetWidth, targetHeight);
  return { width: targetWidth, height: targetHeight };
}

export function exportObservationsPdf(
  items: ObservationItem[],
  comments: InspectionCommentView[],
  projectName: string,
  mode: "observations" | "inspection-comments"
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  drawPdfLogo(doc, margin, y);
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(mode === "observations" ? 'OBSERVATIONS EXPORT' : 'INSPECTION COMMENTS EXPORT', pageWidth / 2, y + 5, { align: 'center' });

  doc.setFontSize(10);
  doc.text(`Project: ${projectName}`, pageWidth - margin, y + 5, { align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, y + 10, { align: 'right' });

  y += 18;
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  if (mode === "observations") {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVATIONS', margin, y);
    y += 8;

    doc.setFontSize(9);
    if (items.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.text('No observations found.', margin, y);
      y += 10;
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text('#', margin, y);
      doc.text('TYPE', margin + 10, y);
      doc.text('DISC', margin + 30, y);
      doc.text('LOCATION', margin + 52, y);
      doc.text('DATE', margin + 90, y);
      doc.text('CONTENT', margin + 115, y);
      doc.text('STATUS', 268, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      for (const item of items) {
        if (y > pageHeight - 20) { doc.addPage(); y = margin; }

        const contentWidth = pageWidth - margin - 20;
        const contentLines = doc.splitTextToSize(item.content, contentWidth - 115);
        const locationWidth = 35;
        const locationText = doc.splitTextToSize(item.location || '-', locationWidth);

        doc.text(String(item.serialNo), margin, y);
        doc.text(item.type, margin + 10, y);
        doc.text(item.discipline, margin + 30, y);
        doc.text(locationText, margin + 52, y);
        doc.text(item.date, margin + 90, y);
        doc.text(contentLines, margin + 115, y);
        doc.text(item.status.toUpperCase(), 268, y);

        const rowHeight = Math.max(contentLines.length, locationText.length) * 4 + 3;
        y += rowHeight;
      }
    }
  }

  if (mode === "inspection-comments") {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('INSPECTION COMMENTS', margin, y);
    y += 8;

    doc.setFontSize(9);
    if (comments.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.text('No inspection comments found.', margin, y);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text('SHIP', margin, y);
      doc.text('DISC', margin + 25, y);
      doc.text('ITEM', margin + 55, y);
      doc.text('CONTENT', margin + 110, y);
      doc.text('AUTHOR', 250, y);
      doc.text('STATUS', 268, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      for (const cm of comments) {
        if (y > pageHeight - 20) { doc.addPage(); y = margin; }

        const itemWidth = 50;
        const contentWidth = pageWidth - margin - 20;
        const itemLines = doc.splitTextToSize(cm.inspectionItemName, itemWidth);
        const contentLines = doc.splitTextToSize(cm.content, contentWidth - 110);

        doc.text(cm.hullNumber, margin, y);
        doc.text(cm.discipline, margin + 25, y);
        doc.text(itemLines, margin + 55, y);
        doc.text(contentLines, margin + 110, y);
        doc.text(cm.authorName, 250, y);
        doc.text(cm.status.toUpperCase(), 268, y);

        const rowHeight = Math.max(itemLines.length, contentLines.length) * 4 + 3;
        y += rowHeight;
      }
    }
  }

  const prefix = mode === "observations" ? "Observations" : "InspectionComments";
  doc.save(`NBINS_${prefix}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function buildExcelWorkbook(
  sheetName: string,
  headers: string[],
  columnWidths: number[],
  _titleCells: { label: string; colspan: number }[],
  projectName: string,
  dataRows: Record<string, unknown>[],
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  ws.views = [{ showGridLines: false }];

  ws.addTable({
    name: sheetName.replace(/\s+/g, "_"),
    ref: `A1:${String.fromCharCode(64 + headers.length)}${dataRows.length + 2}`,
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium9",
      showColumnStripes: false,
      showRowStripes: false,
    },
    columns: headers.map((h, i) => ({ name: h, width: columnWidths[i] })),
    rows: dataRows.map(row => headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "string") return val;
      if (typeof val === "number") return val;
      return String(val);
    })),
  });

  const TITLE_BG = "0F4D5C";
  const HEADER_BG = "1E4D6B";

  const titleCell = (col: number, value: string, colspan = 1) => {
    const cell = ws.getCell(col, 1);
    cell.value = value;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${TITLE_BG}` } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFFFFFFF" } },
      bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
      left: { style: "thin", color: { argb: "FFFFFFFF" } },
      right: { style: "thin", color: { argb: "FFFFFFFF" } },
    };
    if (colspan > 1) {
      const start = ws.getCell(col, 1).address;
      const end = ws.getCell(col + colspan - 1, 1).address;
      ws.mergeCells(`${start}:${end}`);
    }
  };

  const logoImageId = wb.addImage({
    base64: PG_LOGO_B64,
    extension: "jpeg",
  });

  ws.addImage(logoImageId, {
    tl: { col: 0, row: 0 },
    ext: { width: 44, height: 20 },
    editAs: "absolute",
  });

  const numCols = headers.length;
  titleCell(1, "NBINS", 2);
  titleCell(3, projectName, 2);
  titleCell(5, new Date().toLocaleDateString(), 2);
  titleCell(7, `${dataRows.length} records`, numCols - 6);

  ws.getRow(1).height = 22;

  const headerCell = (col: number, value: string) => {
    const cell = ws.getCell(col, 2);
    cell.value = value;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${HEADER_BG}` } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFFFFFFF" } },
      bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
      left: { style: "thin", color: { argb: "FFFFFFFF" } },
      right: { style: "thin", color: { argb: "FFFFFFFF" } },
    };
  };

  headers.forEach((h, i) => headerCell(i + 1, h));

  ws.getRow(2).height = 18;

  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalDpi: 300,
    verticalDpi: 300,
  };

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 2 }];

  return wb;
}

export async function exportObservationsExcel(
  items: ObservationItem[],
  comments: InspectionCommentView[],
  projectName: string,
  mode: "observations" | "inspection-comments"
): Promise<void> {
  if (mode === "observations") {
    const headers = ["#", "Type", "Discipline", "Location", "Date", "Content", "Remark", "Author", "Status", "Closed At"];
    const columnWidths = [6, 10, 14, 20, 14, 55, 25, 18, 10, 14];
    const obsData = items.map(i => ({
      "#": i.serialNo,
      "Type": i.type,
      "Discipline": i.discipline,
      "Location": i.location || "",
      "Date": i.date,
      "Content": i.content,
      "Remark": i.remark || "",
      "Author": i.authorName || i.authorId,
      "Status": i.status.toUpperCase(),
      "Closed At": i.closedAt ? new Date(i.closedAt).toLocaleDateString() : ""
    }));
    const wb = await buildExcelWorkbook("Observations", headers, columnWidths, [], projectName, obsData);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NBINS_Observations_${projectName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  if (mode === "inspection-comments") {
    const headers = ["Ship", "Discipline", "Inspection Item", "Round", "Content", "Author", "Status", "Closed At"];
    const columnWidths = [14, 16, 45, 8, 60, 20, 10, 14];
    const cmData = comments.map(c => ({
      "Ship": c.hullNumber,
      "Discipline": c.discipline,
      "Inspection Item": c.inspectionItemName,
      "Round": c.roundNumber,
      "Content": c.content,
      "Author": c.authorName || "",
      "Status": c.status.toUpperCase(),
      "Closed At": c.closedAt ? new Date(c.closedAt).toLocaleDateString() : ""
    }));
    const wb = await buildExcelWorkbook("Inspection Comments", headers, columnWidths, [], projectName, cmData);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NBINS_InspectionComments_${projectName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
