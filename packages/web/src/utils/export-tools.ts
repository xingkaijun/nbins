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
  mode: "observations" | "inspection-comments",
  shipInfo?: string
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
  if (shipInfo) {
    doc.text(`Ship: ${shipInfo}`, pageWidth - margin, y + 10, { align: 'right' });
    doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, y + 15, { align: 'right' });
    y += 3; // 增加额外的垂直空间
  } else {
    doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, y + 10, { align: 'right' });
  }

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
      doc.text('DISC', margin + 28, y);
      doc.text('LOCATION', margin + 48, y);
      doc.text('DATE', margin + 71, y);
      doc.text('CONTENT', margin + 96, y);
      doc.text('AUTHOR', 229, y); // 从 235 移到 229，靠近 content 6mm
      doc.text('STATUS', 268, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      for (const item of items) {
        if (y > pageHeight - 20) { doc.addPage(); y = margin; }

        const locationWidth = 20;
        const contentWidth = 111; // content 列宽从 105 增加到 111 (增加 6mm)
        const locationText = doc.splitTextToSize(item.location || '-', locationWidth);
        const contentLines = doc.splitTextToSize(item.content, contentWidth);
        const authorText = doc.splitTextToSize(item.authorName || item.authorId || '-', 40);

        doc.text(String(item.serialNo), margin, y);
        doc.text(item.type, margin + 10, y);
        doc.text(item.discipline, margin + 28, y);
        doc.text(locationText, margin + 48, y);
        doc.text(item.date, margin + 71, y);
        doc.text(contentLines, margin + 96, y);
        doc.text(authorText, 229, y); // 从 235 移到 229
        doc.text(item.status.toUpperCase(), 268, y);

        const rowHeight = Math.max(contentLines.length, locationText.length, authorText.length) * 4 + 3;
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
  mode: "observations" | "inspection-comments",
  shipInfo?: string
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(mode === "observations" ? "Observations" : "Inspection Comments");

  // 设置页面
  ws.views = [{ showGridLines: true }];
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  let currentRow = 1;

  // ===== 页眉部分 =====
  // 第一行：标题 (居中)
  ws.mergeCells(`C${currentRow}:H${currentRow}`);
  const titleCell = ws.getCell(`C${currentRow}`);
  titleCell.value = mode === "observations" ? "OBSERVATIONS EXPORT" : "INSPECTION COMMENTS EXPORT";
  titleCell.font = { bold: true, size: 18, color: { argb: "FF1E3A8A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
  ws.getRow(currentRow).height = 28;
  currentRow++;

  // 第二行：项目信息 (右侧)
  ws.mergeCells(`D${currentRow}:H${currentRow}`);
  const projectCell = ws.getCell(`D${currentRow}`);
  projectCell.value = `Project: ${projectName}`;
  projectCell.font = { bold: true, size: 12, color: { argb: "FF374151" } };
  projectCell.alignment = { vertical: "middle", horizontal: "right", wrapText: false };
  ws.getRow(currentRow).height = 22;
  currentRow++;

  // 第三行：船舶信息 (右侧)
  const thirdRowNum = currentRow;
  if (shipInfo) {
    ws.mergeCells(`D${currentRow}:H${currentRow}`);
    const shipCell = ws.getCell(`D${currentRow}`);
    shipCell.value = `Ship: ${shipInfo}`;
    shipCell.font = { bold: true, size: 12, color: { argb: "FF374151" } };
    shipCell.alignment = { vertical: "middle", horizontal: "right", wrapText: false };
    ws.getRow(currentRow).height = 22;
    currentRow++;
  } else {
    ws.getRow(currentRow).height = 22;
    currentRow++;
  }

  // Logo - 自动缩放使底部与第三行底部平齐
  // 第1-3行总高度: 28 + 22 + 22 = 72 点
  // 转换为像素 (1点 ≈ 1.33像素): 72 * 1.33 ≈ 96 像素
  // Logo 原始比例约为 16:7.4，保持比例
  const logoHeight = 96;
  const logoWidth = logoHeight * (16 / 7.4); // 约 207 像素
  const logoImageId = wb.addImage({
    base64: PG_LOGO_B64,
    extension: "jpeg",
  });
  ws.addImage(logoImageId, {
    tl: { col: 0, row: 0 },
    ext: { width: logoWidth, height: logoHeight },
    editAs: "absolute",
  });

  // 统计信息行
  const totalCount = mode === "observations" ? items.length : comments.length;
  const openCount = mode === "observations" 
    ? items.filter(i => i.status === "open").length 
    : comments.filter(c => c.status === "open").length;
  
  ws.mergeCells(`A${currentRow}:D${currentRow}`);
  const statsCell = ws.getCell(`A${currentRow}`);
  statsCell.value = `Total: ${totalCount}  |  Open: ${openCount}  |  Closed: ${totalCount - openCount}`;
  statsCell.font = { bold: true, size: 11, color: { argb: "FF059669" } };
  statsCell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
  
  ws.mergeCells(`F${currentRow}:H${currentRow}`);
  const dateCell = ws.getCell(`F${currentRow}`);
  dateCell.value = `Export Date: ${new Date().toLocaleDateString()}`;
  dateCell.font = { size: 10, color: { argb: "FF6B7280" } };
  dateCell.alignment = { vertical: "middle", horizontal: "right", wrapText: false };
  
  ws.getRow(currentRow).height = 20;
  currentRow++;

  // 空行
  currentRow++;

  // ===== 表格部分 =====
  const headerRow = currentRow;
  
  if (mode === "observations") {
    const headers = ["#", "Type", "Discipline", "Location", "Date", "Content", "Remark", "Author", "Status", "Closed At"];
    
    // 表头
    headers.forEach((header, idx) => {
      const cell = ws.getCell(headerRow, idx + 1);
      cell.value = header;
      cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E4D6B" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      };
    });
    ws.getRow(headerRow).height = 20;
    
    // 数据行
    items.forEach((item, idx) => {
      const rowNum = headerRow + idx + 1;
      const rowData = [
        item.serialNo,
        item.type,
        item.discipline,
        item.location || "",
        item.date,
        item.content,
        item.remark || "",
        item.authorName || item.authorId,
        item.status.toUpperCase(),
        item.closedAt ? new Date(item.closedAt).toLocaleDateString() : ""
      ];
      
      rowData.forEach((value, colIdx) => {
        const cell = ws.getCell(rowNum, colIdx + 1);
        cell.value = value;
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD1D5DB" } },
          bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
          left: { style: "thin", color: { argb: "FFD1D5DB" } },
          right: { style: "thin", color: { argb: "FFD1D5DB" } }
        };
      });
    });
    
    // 设置列宽 - Content 列固定宽度，其他自适应
    ws.getColumn(1).width = 6;   // #
    ws.getColumn(2).width = 12;  // Type
    ws.getColumn(3).width = 15;  // Discipline
    ws.getColumn(4).width = 20;  // Location
    ws.getColumn(5).width = 12;  // Date
    ws.getColumn(6).width = 60;  // Content - 50个字符宽度
    ws.getColumn(7).width = 25;  // Remark
    ws.getColumn(8).width = 20;  // Author
    ws.getColumn(9).width = 10;  // Status
    ws.getColumn(10).width = 14; // Closed At
    
    // 添加自动筛选 - Type, Discipline, Author, Status 列
    const lastRow = headerRow + items.length;
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: lastRow, column: 10 }
    };
    
  } else {
    const headers = ["Ship", "Discipline", "Inspection Item", "Round", "Content", "Author", "Status", "Closed At"];
    
    // 表头
    headers.forEach((header, idx) => {
      const cell = ws.getCell(headerRow, idx + 1);
      cell.value = header;
      cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E4D6B" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      };
    });
    ws.getRow(headerRow).height = 20;
    
    // 数据行
    comments.forEach((comment, idx) => {
      const rowNum = headerRow + idx + 1;
      const rowData = [
        comment.hullNumber,
        comment.discipline,
        comment.inspectionItemName,
        `R${comment.roundNumber}`,
        comment.content,
        comment.authorName || "",
        comment.status.toUpperCase(),
        comment.closedAt ? new Date(comment.closedAt).toLocaleDateString() : ""
      ];
      
      rowData.forEach((value, colIdx) => {
        const cell = ws.getCell(rowNum, colIdx + 1);
        cell.value = value;
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD1D5DB" } },
          bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
          left: { style: "thin", color: { argb: "FFD1D5DB" } },
          right: { style: "thin", color: { argb: "FFD1D5DB" } }
        };
      });
    });
    
    // 设置列宽
    ws.getColumn(1).width = 14;  // Ship
    ws.getColumn(2).width = 16;  // Discipline
    ws.getColumn(3).width = 35;  // Inspection Item
    ws.getColumn(4).width = 8;   // Round
    ws.getColumn(5).width = 60;  // Content - 50个字符宽度
    ws.getColumn(6).width = 20;  // Author
    ws.getColumn(7).width = 10;  // Status
    ws.getColumn(8).width = 14;  // Closed At
    
    // 添加自动筛选 - Discipline, Author, Status 列
    const lastRow = headerRow + comments.length;
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: lastRow, column: 8 }
    };
  }

  // 自动调整行高
  const totalRows = mode === "observations" ? items.length : comments.length;
  for (let i = 1; i <= totalRows; i++) {
    const row = ws.getRow(headerRow + i);
    // 根据内容自动调整行高，最小18，最大150
    row.height = undefined; // 让 Excel 自动计算
  }

  // 导出文件
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fileName = mode === "observations" 
    ? `NBINS_Observations_${projectName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`
    : `NBINS_InspectionComments_${projectName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
