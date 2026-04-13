import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export async function buildNcrReportDoc(
  elementIds: string[],
  fileName: string
): Promise<{ doc: jsPDF; fileName: string }> {
  if (elementIds.length === 0) {
    throw new Error("No element IDs provided for PDF generation");
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  for (let i = 0; i < elementIds.length; i++) {
    const elementId = elementIds[i];
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element with id ${elementId} not found, skipping relative page.`);
      continue;
    }

    // Use high scale for better quality
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    if (i > 0) {
      doc.addPage();
    }
    
    doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
  }

  return { doc, fileName };
}
