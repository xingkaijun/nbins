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

export function splitTextToLength(text: string, maxLength: number): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if (currentLine.length + word.length + (currentLine ? 1 : 0) <= maxLength) {
      if (currentLine) currentLine += " ";
      currentLine += word;
    } else {
      if (currentLine) lines.push(currentLine);
      if (word.length > maxLength) {
         let w = word;
         while(w.length > maxLength) {
           lines.push(w.slice(0, maxLength));
           w = w.slice(maxLength);
         }
         currentLine = w;
      } else {
         currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  if (lines.length === 0) return [""];
  return lines;
}

export function padRight(text: string, length: number) {
  return (text || "").substring(0, length).padEnd(length, " ");
}

export function buildAsciiRow(cells: {text: string, width: number}[]): string[] {
   const columnLines = cells.map(c => splitTextToLength(c.text, c.width - 2)); 
   let maxLines = 1;
   for (const c of columnLines) {
     if (c.length > maxLines) maxLines = c.length;
   }
   const outLines: string[] = [];
   for (let i = 0; i < maxLines; i++) {
     let line = "|";
     for (let j = 0; j < cells.length; j++) {
       const textPart = columnLines[j][i] || "";
       line += " " + padRight(textPart, cells[j].width - 2) + " |";
     }
     outLines.push(line);
   }
   return outLines;
}

export function exportObservationsAsciiPdf(
  items: ObservationItem[],
  comments: InspectionCommentView[],
  projectName: string,
  mode: "observations" | "inspection-comments",
  shipInfo?: string,
  ownerInfo?: { owner?: string; shipyard?: string; classification?: string }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 15;
  
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);

  const linesPerPage = 82; 
  let currentLineIdx = 0;
  let pageNum = 1;
  const lineHeight = 3.2; 
  
  const addPageHeader = () => {
    if (currentLineIdx > 0) {
      doc.addPage();
      pageNum++;
    }
    currentLineIdx = 0;
    const title = mode === "observations" ? 'SITE PUNCH LIST REPORT' : 'SITE INSPECTION REPORT';
    const topBorder = "=".repeat(103);
    doc.text(topBorder, margin, margin + (currentLineIdx++ * lineHeight));
    doc.text(title.padStart(51 + title.length/2, " "), margin, margin + (currentLineIdx++ * lineHeight));
    doc.text(topBorder, margin, margin + (currentLineIdx++ * lineHeight));
    
    doc.text(`Project : ${padRight(projectName || '-', 30)} Ship : ${padRight(shipInfo ? shipInfo.split('(')[0].trim() : '-', 30)}`, margin, margin + (currentLineIdx++ * lineHeight));
    doc.text(`Hull No : ${padRight(shipInfo ? shipInfo.split('(')[1]?.replace(')', '') || '-' : '-', 30)} Date : ${padRight(new Date().toLocaleDateString(), 30)}`, margin, margin + (currentLineIdx++ * lineHeight));
    doc.text("-".repeat(103), margin, margin + (currentLineIdx++ * lineHeight));
    
    const totalCount = mode === "observations" ? items.length : comments.length;
    const openCount = mode === "observations" ? items.filter(i => i.status === "open").length : comments.filter(c => c.status === "open").length;
    const closedCount = totalCount - openCount;
    doc.text(`Summary: Total ${totalCount} | Open ${openCount} | Closed ${closedCount}`, margin, margin + (currentLineIdx++ * lineHeight));
    doc.text(topBorder, margin, margin + (currentLineIdx++ * lineHeight));
    doc.text("", margin, margin + (currentLineIdx++ * lineHeight)); 
  };

  const printLine = (text: string) => {
    if (currentLineIdx >= linesPerPage) {
      addPageHeader();
    }
    doc.text(text, margin, margin + (currentLineIdx * lineHeight));
    currentLineIdx++;
  };

  addPageHeader();

  if (mode === "observations") {
    const headBorder = "+-----+------+------------+------------+-----------------------------------------------------+--------+";
    printLine(headBorder);
    printLine(buildAsciiRow([ {text: "S/N", width: 5}, {text: "Type", width: 6}, {text: "Discipline", width: 12}, {text: "Location", width: 12}, {text: "Content", width: 53}, {text: "Status", width: 8} ])[0]);
    printLine(headBorder);

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const serialText = item.discipline ? `${item.discipline.substring(0, 3).toUpperCase()}-${item.serialNo}` : String(item.serialNo || '-');
      const cells = [
        {text: serialText, width: 5},
        {text: item.type || '-', width: 6},
        {text: item.discipline || '-', width: 12},
        {text: item.location || '-', width: 12},
        {text: item.content || '-', width: 53},
        {text: (item.status || 'open').toUpperCase(), width: 8}
      ];
      
      const lines = buildAsciiRow(cells);
      if (currentLineIdx + lines.length > linesPerPage) {
        addPageHeader();
        printLine(headBorder);
        printLine(buildAsciiRow([ {text: "S/N", width: 5}, {text: "Type", width: 6}, {text: "Discipline", width: 12}, {text: "Location", width: 12}, {text: "Content", width: 53}, {text: "Status", width: 8} ])[0]);
        printLine(headBorder);
      }
      for (const line of lines) { printLine(line); }
      printLine(headBorder);
    }
  } else {
    const headBorder = "+-----+------------+--------------+----------------------------------------------------------+--------+";
    printLine(headBorder);
    printLine(buildAsciiRow([ {text: "S/N", width: 5}, {text: "Ship", width: 12}, {text: "Discipline", width: 14}, {text: "Content", width: 58}, {text: "Status", width: 8} ])[0]);
    printLine(headBorder);

    for (let idx = 0; idx < comments.length; idx++) {
      const cm = comments[idx];
      const cells = [
        {text: String(cm.localId || '-'), width: 5},
        {text: cm.hullNumber || '-', width: 12},
        {text: cm.discipline || '-', width: 14},
        {text: `${cm.inspectionItemName ? '['+cm.inspectionItemName+'] ' : ''}${cm.content || '-'}`, width: 58},
        {text: (cm.status || 'open').toUpperCase(), width: 8}
      ];
      
      const lines = buildAsciiRow(cells);
      if (currentLineIdx + lines.length > linesPerPage) {
        addPageHeader();
        printLine(headBorder);
        printLine(buildAsciiRow([ {text: "S/N", width: 5}, {text: "Ship", width: 12}, {text: "Discipline", width: 14}, {text: "Content", width: 58}, {text: "Status", width: 8} ])[0]);
        printLine(headBorder);
      }
      for (const line of lines) { printLine(line); }
      printLine(headBorder);
    }
  }

  // Draw footer page numbers
  const totalPages = pageNum;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${totalPages}`, doc.internal.pageSize.getWidth() - margin - 20, doc.internal.pageSize.getHeight() - margin);
  }
  
  const prefix = mode === "observations" ? "PunchList" : "InspectionComments";
  doc.save(`NBINS_${prefix}_ASCII_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportObservationsPdf(
  items: ObservationItem[],
  comments: InspectionCommentView[],
  projectName: string,
  mode: "observations" | "inspection-comments",
  shipInfo?: string,
  ownerInfo?: { owner?: string; shipyard?: string; classification?: string },
  filters?: { shipId?: string; discipline?: string; hullNumber?: string }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usableWidth = pageWidth - margin * 2;
  const headerRowHeight = 7;
  const bodyRowHeight = 6;
  const footerY = pageHeight - 7;

  const colors = {
    primary: [0, 89, 97] as [number, number, number],
    primaryLight: [230, 243, 245] as [number, number, number],
    secondary: [80, 96, 111] as [number, number, number],
    tertiary: [117, 68, 30] as [number, number, number],
    surfaceLow: [242, 244, 244] as [number, number, number],
    outline: [191, 200, 202] as [number, number, number],
    textMain: [25, 28, 29] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
  };

  // Generate 16-character hash
  const hashText = `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`.substring(0, 16);
  const reportTitle = mode === "observations" ? 'PUNCH LIST' : 'INSPECTION COMMENTS';
  const totalCount = mode === "observations" ? items.length : comments.length;
  const openCount = mode === "observations"
    ? items.filter((item) => item.status === 'open').length
    : comments.filter((comment) => comment.status === 'open').length;
  const closedCount = totalCount - openCount;

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    return value.length >= 10 ? value.slice(0, 10) : value;
  };

  const fitText = (text: string | null | undefined, maxWidth: number) => {
    const normalized = (text ?? '-').replace(/\s+/g, ' ').trim() || '-';
    if (doc.getTextWidth(normalized) <= maxWidth) return normalized;
    let output = normalized;
    while (output.length > 0 && doc.getTextWidth(`${output}...`) > maxWidth) {
      output = output.slice(0, -1);
    }
    return output ? `${output}...` : '...';
  };

  const drawStatusIcon = (x: number, y: number, isClosed: boolean) => {
    if (isClosed) {
      doc.setDrawColor(0, 97, 0);
      doc.setLineWidth(0.3);
      doc.circle(x, y, 1.8, 'S');
      doc.line(x - 1.0, y + 0.1, x - 0.2, y + 0.9);
      doc.line(x - 0.2, y + 0.9, x + 1.2, y - 0.8);
      return;
    }
    doc.setDrawColor(156, 0, 6);
    doc.setLineWidth(0.3);
    doc.circle(x, y, 1.8, 'S');
    doc.line(x - 0.8, y - 0.8, x + 0.8, y + 0.8);
    doc.line(x - 0.8, y + 0.8, x + 0.8, y - 0.8);
  };

  const observationColumns = [
    { key: 'no', label: 'NO.', width: 14 },
    { key: 'date', label: 'DATE', width: 22 },
    { key: 'author', label: 'AUTHOR', width: 28 },
    { key: 'location', label: 'LOCATION', width: 34 },
    { key: 'type', label: 'TYPE', width: 20 },
    { key: 'content', label: 'CONTENT', width: 140 },
    { key: 'status', label: 'ST', width: 15 },
  ];

  const commentColumns = [
    { key: 'no', label: 'NO.', width: 14 },
    { key: 'date', label: 'DATE', width: 22 },
    { key: 'author', label: 'AUTHOR', width: 28 },
    { key: 'ship', label: 'HULL', width: 22 },
    { key: 'item', label: 'ITEM', width: 42 },
    { key: 'content', label: 'CONTENT', width: 115 },
    { key: 'status', label: 'ST', width: 15 },
  ];

  const columns = mode === 'observations' ? observationColumns : commentColumns;

  const getColumnX = (columnIndex: number) => {
    let x = margin;
    for (let i = 0; i < columnIndex; i += 1) x += columns[i].width;
    return x;
  };

  const drawHeader = () => {
    let y = margin;
    // PG logo 1.5x size (original 11, now 16.5)
    drawPdfLogo(doc, margin, y - 3, 16.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...colors.primary);
    doc.text(reportTitle, margin + 40, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...colors.secondary);
    doc.text(`Project: ${projectName || '-'}`, pageWidth - margin, y + 1, { align: 'right' });
    doc.text(`Ship: ${shipInfo || '-'}`, pageWidth - margin, y + 5, { align: 'right' });

    y += 13.5;
    doc.setDrawColor(...colors.primary);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);

    y += 4;
    doc.setFillColor(...colors.primaryLight);
    doc.roundedRect(margin, y, usableWidth, 8, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...colors.primary);
    doc.text(`TOTAL ${totalCount}`, margin + 4, y + 5.3);

    doc.setTextColor(156, 0, 6);
    doc.text(`OPEN ${openCount}`, margin + 34, y + 5.3);
    doc.setTextColor(0, 97, 0);
    doc.text(`CLOSED ${closedCount}`, margin + 58, y + 5.3);

    doc.setTextColor(...colors.secondary);
    doc.setFont('helvetica', 'normal');
    doc.text(`OWNER ${ownerInfo?.owner || '-'}`, margin + 88, y + 5.3);
    doc.text(`SHIPYARD ${ownerInfo?.shipyard || '-'}`, margin + 150, y + 5.3);
    doc.text(`GENERATED ${new Date().toLocaleDateString()}`, pageWidth - margin, y + 5.3, { align: 'right' });

    y += 11;

    doc.setFillColor(...colors.primary);
    doc.rect(margin, y, usableWidth, headerRowHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...colors.white);

    columns.forEach((column, index) => {
      const cellX = getColumnX(index);
      doc.text(column.label, cellX + 2, y + 4.5);
    });

    return y + headerRowHeight;
  };

  const drawFooter = (pageNumber: number, totalPages: number) => {
    doc.setPage(pageNumber);
    doc.setDrawColor(...colors.outline);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...colors.secondary);
    doc.text(`HASH: ${hashText}`, margin, footerY);
    doc.text(`PAGE ${pageNumber}/${totalPages}`, pageWidth / 2, footerY, { align: 'center' });
    doc.text('PG newbuilding', pageWidth - margin, footerY, { align: 'right' });
  };

  let y = drawHeader();

  // Helper function to wrap text within a given width
  const wrapText = (text: string, maxWidth: number): string[] => {
    const normalized = (text || '-').replace(/\s+/g, ' ').trim() || '-';
    
    // Set font before measuring text width
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    
    if (doc.getTextWidth(normalized) <= maxWidth) return [normalized];
    
    const words = normalized.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (doc.getTextWidth(testLine) <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        // Handle very long words that exceed maxWidth
        if (doc.getTextWidth(word) > maxWidth) {
          let remainingWord = word;
          while (doc.getTextWidth(remainingWord) > maxWidth) {
            let splitPoint = remainingWord.length;
            while (splitPoint > 0 && doc.getTextWidth(remainingWord.substring(0, splitPoint)) > maxWidth) {
              splitPoint--;
            }
            if (splitPoint > 0) {
              lines.push(remainingWord.substring(0, splitPoint));
              remainingWord = remainingWord.substring(splitPoint);
            } else {
              break;
            }
          }
          currentLine = remainingWord;
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : ['-'];
  };

  const renderObservationRow = (item: ObservationItem, idx: number) => {
    // Calculate required height based on content
    const contentWidth = columns[5].width - 4;
    const contentLines = wrapText(item.content || '-', contentWidth);
    const requiredHeight = Math.max(bodyRowHeight, contentLines.length * 3.5 + 2);

    if (y + requiredHeight > pageHeight - 14) {
      doc.addPage();
      y = drawHeader();
    }

    if (idx % 2 === 0) {
      doc.setFillColor(...colors.surfaceLow);
      doc.rect(margin, y, usableWidth, requiredHeight, 'F');
    }

    doc.setDrawColor(...colors.outline);
    doc.setLineWidth(0.15);
    doc.line(margin, y + requiredHeight, pageWidth - margin, y + requiredHeight);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    doc.setTextColor(...colors.textMain);

    const serialText = item.discipline
      ? `${item.discipline.substring(0, 3).toUpperCase()}-${item.serialNo}`
      : String(item.serialNo || idx + 1);

    const values = [
      serialText,
      formatDate(item.date),
      item.authorName || '-',
      item.location || '-',
      item.type || '-',
    ];

    // Draw non-content columns
    values.forEach((value, index) => {
      const cellX = getColumnX(index);
      const text = fitText(value, columns[index].width - 4);
      doc.text(text, cellX + 2, y + 4.2);
    });

    // Draw content with wrapping
    const contentX = getColumnX(5);
    contentLines.forEach((line, lineIdx) => {
      doc.text(line, contentX + 2, y + 4.2 + lineIdx * 3.5);
    });

    // Draw status as text instead of icon
    const statusX = getColumnX(6);
    const statusText = (item.status || 'open').toUpperCase();
    if (statusText === 'OPEN') {
      doc.setTextColor(156, 0, 6);
    } else {
      doc.setTextColor(0, 97, 0);
    }
    doc.text(statusText, statusX + 2, y + 4.2);
    doc.setTextColor(...colors.textMain);

    y += requiredHeight;
  };

  const renderCommentRow = (comment: InspectionCommentView, idx: number) => {
    // Calculate required height based on content
    const contentWidth = columns[5].width - 4;
    const contentLines = wrapText(comment.content || '-', contentWidth);
    const requiredHeight = Math.max(bodyRowHeight, contentLines.length * 3.5 + 2);

    if (y + requiredHeight > pageHeight - 14) {
      doc.addPage();
      y = drawHeader();
    }

    if (idx % 2 === 0) {
      doc.setFillColor(...colors.surfaceLow);
      doc.rect(margin, y, usableWidth, requiredHeight, 'F');
    }

    doc.setDrawColor(...colors.outline);
    doc.setLineWidth(0.15);
    doc.line(margin, y + requiredHeight, pageWidth - margin, y + requiredHeight);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    doc.setTextColor(...colors.textMain);

    const values = [
      String(comment.localId || idx + 1).padStart(2, '0'),
      formatDate(comment.createdAt),
      comment.authorName || '-',
      comment.hullNumber || '-',
      comment.inspectionItemName || '-',
    ];

    values.forEach((value, index) => {
      const cellX = getColumnX(index);
      const text = fitText(value, columns[index].width - 4);
      doc.text(text, cellX + 2, y + 4.2);
    });

    // Draw content with wrapping
    const contentX = getColumnX(5);
    contentLines.forEach((line, lineIdx) => {
      doc.text(line, contentX + 2, y + 4.2 + lineIdx * 3.5);
    });

    // Draw status as text instead of icon
    const statusX = getColumnX(6);
    const statusText = (comment.status || 'open').toUpperCase();
    if (statusText === 'OPEN') {
      doc.setTextColor(156, 0, 6);
    } else {
      doc.setTextColor(0, 97, 0);
    }
    doc.text(statusText, statusX + 2, y + 4.2);
    doc.setTextColor(...colors.textMain);

    y += requiredHeight;
  };

  if (mode === 'observations') {
    items.forEach(renderObservationRow);
  } else {
    comments.forEach(renderCommentRow);
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    drawFooter(i, totalPages);
  }

  // Build filename with ship number and discipline if filtered
  let fileName = `NBINS_PunchList`;
  if (filters?.hullNumber) {
    fileName += `_${filters.hullNumber}`;
  }
  if (filters?.discipline) {
    fileName += `_${filters.discipline}`;
  }
  fileName += `_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
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
  const ws = wb.addWorksheet(mode === "observations" ? "Punch List" : "Inspection Comments");

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
    tl: { col: 0, row: 0 } as any,
    br: { col: 2, row: 3 } as any,
    editAs: "absolute",
  } as any);

  // ===== 大标题 (Row 1-3, C1:G3) =====
  ws.mergeCells("C1:G3");
  const titleCell = ws.getCell("C1");
  titleCell.value = mode === "observations" ? "PUNCH LIST REPORT" : "INSPECTION COMMENTS REPORT";
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
    const headers = ["S/N", "Type", "Discipline", "Location", "Date", "Content", "Remark", "Author", "Status", "Closed At"];
    
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
        item.discipline ? `${item.discipline.substring(0, 3).toUpperCase()}-${item.serialNo}` : (item.serialNo ?? ""),
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
    ws.getColumn(1).width = 5;   // S/N
    ws.getColumn(2).width = 12;  // Type
    ws.getColumn(3).width = 15;  // Location
    ws.getColumn(4).width = 15;  // Date
    ws.getColumn(5).width = 67;  // Content
    ws.getColumn(6).width = 20;  // Remark
    ws.getColumn(7).width = 15;  // Author
    ws.getColumn(8).width = 12;  // Status
    ws.getColumn(9).width = 15;  // Closed At
    
    // 添加自动筛选
    const lastRow = headerRow + items.length;
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: lastRow, column: 9 }
    };
    
  } else {
    // Inspection Comments 模式
    const headers = ["S/N", "Ship", "Discipline", "Inspection Item", "Round", "Content", "Author", "Status", "Closed At"];
    
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
    ws.getColumn(1).width = 5;   // S/N
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
    ? `NBINS_PunchList_${projectName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`
    : `NBINS_InspectionComments_${projectName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
