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
  shipInfo?: string,
  ownerInfo?: { owner?: string; shipyard?: string; classification?: string }
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(mode === "observations" ? "Observations" : "Inspection Comments");

  // ===== 页面设置 =====
  ws.views = [{ showGridLines: false }];
  wb.creator = "NBINS System";
  wb.created = new Date();
  
  // 设置默认字体
  ws.properties.defaultRowHeight = 15;
  ws.properties.defaultColWidth = 10;

  // 页面打印设置
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  // ===== Logo 插入 (A1:B3) =====
  const logoImageId = wb.addImage({
    base64: PG_LOGO_B64,
    extension: "jpeg",
  });
  ws.addImage(logoImageId, {
    tl: { col: 0, row: 0 },
    br: { col: 2, row: 3 },
    editAs: "absolute",
  });

  // ===== 大标题 (Row 1-3, C1:G3) =====
  ws.mergeCells("C1:G3");
  const titleCell = ws.getCell("C1");
  titleCell.value = "OBSERVATIONS REPORT";
  titleCell.font = { 
    name: "Calibri", 
    size: 20, 
    bold: true, 
    color: { argb: "FF1F4E78" } 
  };
  titleCell.alignment = { 
    vertical: "middle", 
    horizontal: "center", 
    wrapText: false 
  };
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 20;

  // ===== 信息盒 (Row 1-3, H1:J3) =====
  // Owner (船东) - H1:J1
  ws.mergeCells("H1:J1");
  const ownerCell = ws.getCell("H1");
  ownerCell.value = `Owner: ${ownerInfo?.owner || "N/A"}`;
  ownerCell.font = { name: "Calibri", size: 9, bold: true };
  ownerCell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
  ownerCell.border = {
    top: { style: "thin", color: { argb: "FF1F4E78" } },
    left: { style: "thin", color: { argb: "FF1F4E78" } },
    right: { style: "thin", color: { argb: "FF1F4E78" } },
    bottom: { style: "thin", color: { argb: "FFD1D5DB" } }
  };

  // Shipyard (船厂) - H2:J2
  ws.mergeCells("H2:J2");
  const shipyardCell = ws.getCell("H2");
  shipyardCell.value = `Shipyard: ${ownerInfo?.shipyard || "N/A"}`;
  shipyardCell.font = { name: "Calibri", size: 9, bold: true };
  shipyardCell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
  shipyardCell.border = {
    top: { style: "thin", color: { argb: "FFD1D5DB" } },
    left: { style: "thin", color: { argb: "FF1F4E78" } },
    right: { style: "thin", color: { argb: "FF1F4E78" } },
    bottom: { style: "thin", color: { argb: "FFD1D5DB" } }
  };

  // Class (船级社) - H3:J3
  ws.mergeCells("H3:J3");
  const classCell = ws.getCell("H3");
  classCell.value = `Class: ${ownerInfo?.classification || "N/A"}`;
  classCell.font = { name: "Calibri", size: 9, bold: true };
  classCell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
  classCell.border = {
    top: { style: "thin", color: { argb: "FFD1D5DB" } },
    left: { style: "thin", color: { argb: "FF1F4E78" } },
    right: { style: "thin", color: { argb: "FF1F4E78" } },
    bottom: { style: "thin", color: { argb: "FF1F4E78" } }
  };

  // ===== 项目详情 (Row 4-5) =====
  // Project (A4:E5)
  ws.mergeCells("A4:E5");
  const projectCell = ws.getCell("A4");
  projectCell.value = `Project: ${projectName || "N/A"}`;
  projectCell.font = { 
    name: "Calibri", 
    size: 11, 
    bold: true 
  };
  projectCell.alignment = { 
    vertical: "middle", 
    horizontal: "left", 
    wrapText: false 
  };

  // Ship (F4:J5)
  ws.mergeCells("F4:J5");
  const shipCell = ws.getCell("F4");
  shipCell.value = `Ship: ${shipInfo || "All Ships"}`;
  shipCell.font = { 
    name: "Calibri", 
    size: 11 
  };
  shipCell.alignment = { 
    vertical: "middle", 
    horizontal: "left", 
    wrapText: false 
  };
  
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 18;

  // ===== 统计摘要 (Row 6, A6:J6) =====
  const totalCount = mode === "observations" ? items.length : comments.length;
  const openCount = mode === "observations" 
    ? items.filter(i => i.status === "open").length 
    : comments.filter(c => c.status === "open").length;
  const closedCount = totalCount - openCount;

  ws.mergeCells("A6:J6");
  const summaryCell = ws.getCell("A6");
  summaryCell.value = `Summary: Total ${totalCount} records | Open ${openCount} | Closed ${closedCount}`;
  summaryCell.font = { 
    name: "Calibri", 
    size: 11, 
    bold: true 
  };
  summaryCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEBF1F8" }
  };
  summaryCell.alignment = { 
    vertical: "middle", 
    horizontal: "left", 
    wrapText: false 
  };
  ws.getRow(6).height = 20;

  // ===== 导出元数据 (Row 7, J7) =====
  const metaCell = ws.getCell("J7");
  metaCell.value = `Export Date: ${new Date().toLocaleDateString()}`;
  metaCell.font = { 
    name: "Calibri", 
    size: 9, 
    color: { argb: "FF808080" } 
  };
  metaCell.alignment = { 
    vertical: "middle", 
    horizontal: "right", 
    wrapText: false 
  };
  ws.getRow(7).height = 15;

  // ===== 数据表格区 (Row 8 起) =====
  const headerRow = 8;
  
  if (mode === "observations") {
    const headers = ["#", "Type", "Discipline", "Location", "Date", "Content", "Remark", "Author", "Status", "Closed At"];
    
    // 表头样式
    headers.forEach((header, idx) => {
      const cell = ws.getCell(headerRow, idx + 1);
      cell.value = header;
      cell.font = { 
        name: "Calibri", 
        size: 11, 
        bold: true, 
        color: { argb: "FFFFFFFF" } 
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E78" }
      };
      cell.alignment = { 
        vertical: "middle", 
        horizontal: "center", 
        wrapText: true 
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFFFFFFF" } },
        bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
        left: { style: "thin", color: { argb: "FFFFFFFF" } },
        right: { style: "thin", color: { argb: "FFFFFFFF" } }
      };
    });
    ws.getRow(headerRow).height = 25;
    
    // 数据行
    items.forEach((item, idx) => {
      const rowNum = headerRow + idx + 1;
      const rowData = [
        item.serialNo ?? "",
        item.type ?? "",
        item.discipline ?? "",
        item.location ?? "",
        item.date ?? "",
        item.content ?? "",
        item.remark ?? "",
        item.authorName || item.authorId || "",
        item.status ? item.status.toUpperCase() : "",
        item.closedAt ? new Date(item.closedAt).toLocaleDateString() : ""
      ];
      
      rowData.forEach((value, colIdx) => {
        const cell = ws.getCell(rowNum, colIdx + 1);
        cell.value = String(value);
        cell.font = { name: "Calibri", size: 10 };
        
        // Content 和 Remark 列启用自动换行
        if (colIdx === 5 || colIdx === 6) {
          cell.alignment = { 
            vertical: "top", 
            horizontal: "left", 
            wrapText: true 
          };
        } else {
          cell.alignment = { 
            vertical: "middle", 
            horizontal: "left", 
            wrapText: false 
          };
        }
        
        cell.border = {
          top: { style: "thin", color: { argb: "FFD1D5DB" } },
          bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
          left: { style: "thin", color: { argb: "FFD1D5DB" } },
          right: { style: "thin", color: { argb: "FFD1D5DB" } }
        };
        
        // 条件格式化 - Status 列 (第9列, colIdx = 8)
        if (colIdx === 8) {
          const status = String(value).toUpperCase();
          if (status === "OPEN") {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFC7CE" }
            };
            cell.font = { 
              name: "Calibri", 
              size: 10, 
              color: { argb: "FF9C0006" } 
            };
          } else if (status === "CLOSED") {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFC6EFCE" }
            };
            cell.font = { 
              name: "Calibri", 
              size: 10, 
              color: { argb: "FF006100" } 
            };
          }
        }
      });
    });
    
    // 设置列宽
    ws.getColumn(1).width = 5;   // #
    ws.getColumn(2).width = 12;  // Type
    ws.getColumn(3).width = 12;  // Discipline
    ws.getColumn(4).width = 15;  // Location
    ws.getColumn(5).width = 15;  // Date
    ws.getColumn(6).width = 55;  // Content
    ws.getColumn(7).width = 20;  // Remark
    ws.getColumn(8).width = 15;  // Author
    ws.getColumn(9).width = 12;  // Status
    ws.getColumn(10).width = 15; // Closed At
    
    // 添加自动筛选
    const lastRow = headerRow + items.length;
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: lastRow, column: 10 }
    };
    
  } else {
    // Inspection Comments 模式
    const headers = ["#", "Ship", "Discipline", "Inspection Item", "Round", "Content", "Author", "Status", "Closed At"];
    
    // 表头样式
    headers.forEach((header, idx) => {
      const cell = ws.getCell(headerRow, idx + 1);
      cell.value = header;
      cell.font = { 
        name: "Calibri", 
        size: 11, 
        bold: true, 
        color: { argb: "FFFFFFFF" } 
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E78" }
      };
      cell.alignment = { 
        vertical: "middle", 
        horizontal: "center", 
        wrapText: true 
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFFFFFFF" } },
        bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
        left: { style: "thin", color: { argb: "FFFFFFFF" } },
        right: { style: "thin", color: { argb: "FFFFFFFF" } }
      };
    });
    ws.getRow(headerRow).height = 25;
    
    // 数据行
    comments.forEach((comment, idx) => {
      const rowNum = headerRow + idx + 1;
      const rowData = [
        (idx + 1).toString(),
        comment.hullNumber ?? "",
        comment.discipline ?? "",
        comment.inspectionItemName ?? "",
        comment.roundNumber ? `R${comment.roundNumber}` : "",
        comment.content ?? "",
        comment.authorName ?? "",
        comment.status ? comment.status.toUpperCase() : "",
        comment.closedAt ? new Date(comment.closedAt).toLocaleDateString() : ""
      ];
      
      rowData.forEach((value, colIdx) => {
        const cell = ws.getCell(rowNum, colIdx + 1);
        cell.value = String(value);
        cell.font = { name: "Calibri", size: 10 };
        
        // Content 列启用自动换行
        if (colIdx === 5) {
          cell.alignment = { 
            vertical: "top", 
            horizontal: "left", 
            wrapText: true 
          };
        } else {
          cell.alignment = { 
            vertical: "middle", 
            horizontal: "left", 
            wrapText: false 
          };
        }
        
        cell.border = {
          top: { style: "thin", color: { argb: "FFD1D5DB" } },
          bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
          left: { style: "thin", color: { argb: "FFD1D5DB" } },
          right: { style: "thin", color: { argb: "FFD1D5DB" } }
        };
        
        // 条件格式化 - Status 列 (第8列, colIdx = 7)
        if (colIdx === 7) {
          const status = String(value).toUpperCase();
          if (status === "OPEN") {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFC7CE" }
            };
            cell.font = { 
              name: "Calibri", 
              size: 10, 
              color: { argb: "FF9C0006" } 
            };
          } else if (status === "CLOSED") {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFC6EFCE" }
            };
            cell.font = { 
              name: "Calibri", 
              size: 10, 
              color: { argb: "FF006100" } 
            };
          }
        }
      });
    });
    
    // 设置列宽
    ws.getColumn(1).width = 5;   // #
    ws.getColumn(2).width = 12;  // Ship
    ws.getColumn(3).width = 12;  // Discipline
    ws.getColumn(4).width = 30;  // Inspection Item
    ws.getColumn(5).width = 8;   // Round
    ws.getColumn(6).width = 55;  // Content
    ws.getColumn(7).width = 15;  // Author
    ws.getColumn(8).width = 12;  // Status
    ws.getColumn(9).width = 15;  // Closed At
    
    // 添加自动筛选
    const lastRow = headerRow + comments.length;
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: lastRow, column: 9 }
    };
  }

  // ===== 冻结前 8 行 =====
  ws.views = [{ 
    state: 'frozen',
    xSplit: 0,
    ySplit: 8,
    showGridLines: false
  }];

  // ===== 导出文件 =====
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
