import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { PG_LOGO_B64 } from "./pg-logo-b64";
import type { NcrItemResponse } from "@nbins/shared";

/**
 * 这是一个纯前端的 PDF 导出方案，能够保证“所见即所得”。
 * 它会渲染一个与 NcrEditor 预览完全相同的布局并导出为 A4 格式。
 */
export async function exportNcrToPdf(ncr: NcrItemResponse) {
  // 1. 创建一个临时的、屏幕外渲染的容器
  const doc = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4"
  });

  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "210mm";
  // 不要限制高度，允许内容自然延伸
  container.style.backgroundColor = "#fff";
  container.style.fontFamily = "'Inter', sans-serif";
  container.style.color = "#1e293b";
  
  // 注入样式
  const style = document.createElement("style");
  style.textContent = `
    .pdf-page {
      width: 210mm;
      min-height: 297mm;
      padding: 18mm 15mm;
      box-sizing: border-box;
      background: white;
      position: relative;
    }
    .pdf-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 15px;
      margin-bottom: 25px;
    }
    .pdf-meta-card {
      background: #f8fafc;
      padding: 14px 18px;
      border-radius: 12px;
      border: 1px solid #f1f5f9;
      margin-bottom: 20px;
    }
    .pdf-section {
      margin-bottom: 20px;
    }
    .pdf-section-title {
      font-size: 10px;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
      border-left: 3px solid #0d9488;
      padding-left: 10px;
    }
    .pdf-content-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      min-height: 40px;
    }
    .pdf-subject-text {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }
    .pdf-signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: #e2e8f0;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      margin-top: 25px;
    }
    .pdf-sig-cell {
      background: white;
      padding: 12px 15px;
    }
    .pdf-sig-label {
      font-size: 8px;
      font-weight: 900;
      color: #94a3b8;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .pdf-sig-value {
      font-size: 13px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 18px;
    }
    .pdf-footer {
       border-top: 1px solid #f1f5f9;
       padding-top: 10px;
       display: flex;
       justify-content: space-between;
       font-size: 7px;
       font-weight: 900;
       color: #cbd5e1;
       margin-top: auto;
    }
    .photo-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 10px;
    }
    .photo-item {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }
    .photo-img {
      width: 100%;
      height: 140px;
      object-fit: cover;
    }
    .photo-remark {
      padding: 6px;
      font-size: 9px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(container);

  const dateStr = new Date(ncr.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const publishedDate = ncr.approvedAt ? new Date(ncr.approvedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

  // 2. 构造 HTML 内容 (Page 1: Main Report)
  const page1 = document.createElement("div");
  page1.className = "pdf-page";
  page1.innerHTML = `
    <div class="pdf-header">
      <div>
        <div style="font-size: 9px; font-weight: 900; color: #0d9488; letter-spacing: 0.2em; margin-bottom: 2px;">PG SHIPMANAGEMENT</div>
        <h1 style="font-size: 26px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1; text-transform: uppercase;">NON CONFORMITY REPORT</h1>
      </div>
      <div style="display: flex; align-items: center; gap: 20px;">
        <div style="text-align: right;">
          <div style="font-size: 8px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Report Reference</div>
          <div style="font-size: 13px; font-weight: 900; color: #b91c1c;">${ncr.formattedSerial || ncr.serialNo}</div>
        </div>
        <img src="${PG_LOGO_B64}" style="height: 60px;" />
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px;">
      <div class="pdf-meta-card">
        <div style="font-size: 8px; font-weight: 900; color: #0d9488; margin-bottom: 8px;">VESSEL & PROJECT</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div><div style="font-size: 7px; color: #94a3b8;">PROJECT NAME</div><div style="font-size: 10px; font-weight: 900;">${ncr.projectName || "-"}</div></div>
          <div><div style="font-size: 7px; color: #94a3b8;">HULL NUMBER</div><div style="font-size: 10px; font-weight: 900;">${ncr.hullNumber || "-"}</div></div>
        </div>
      </div>
      <div class="pdf-meta-card">
        <div style="font-size: 8px; font-weight: 900; color: #0d9488; margin-bottom: 8px;">REPORT METADATA</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div><div style="font-size: 7px; color: #94a3b8;">ISSUE DATE</div><div style="font-size: 10px; font-weight: 900;">${dateStr}</div></div>
          <div><div style="font-size: 7px; color: #94a3b8;">STATUS</div><div style="font-size: 10px; font-weight: 900; color: #16a34a;">${ncr.status.toUpperCase()}</div></div>
        </div>
      </div>
    </div>

    <div class="pdf-section">
      <div class="pdf-section-title">Report Subject</div>
      <div class="pdf-content-box pdf-subject-text">${ncr.title}</div>
    </div>

    <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; margin-bottom: 15px;">
      <div class="pdf-section">
        <div class="pdf-section-title">To (Recipient)</div>
        <div class="pdf-content-box" style="font-weight: 700;">${ncr.remark?.match(/To: (.*?) \|/)?.[1] || "-"}</div>
      </div>
      <div class="pdf-section">
        <div class="pdf-section-title">Discipline</div>
        <div class="pdf-content-box" style="font-weight: 700;">${ncr.discipline}</div>
      </div>
    </div>

    <div class="pdf-section">
      <div class="pdf-section-title">Description of Non-Conformity</div>
      <div class="pdf-content-box" style="min-height: 120px;">${ncr.content}</div>
    </div>

    <div class="pdf-section">
      <div class="pdf-section-title">Requested Rectify</div>
      <div class="pdf-content-box" style="min-height: 60px;">${ncr.rectifyRequest || "-"}</div>
    </div>

    <div class="pdf-signature-grid">
      <div class="pdf-sig-cell">
        <div class="pdf-sig-label">Prepared By (Inspector)</div>
        <div class="pdf-sig-value">${ncr.authorName || ncr.authorId}</div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 4px; font-size: 8px; color: #94a3b8;">HANDWRITTEN SIGNATURE & TITLE</div>
      </div>
      <div class="pdf-sig-cell">
        <div class="pdf-sig-label">Approved By (Manager)</div>
        <div class="pdf-sig-value">${ncr.approvedByName || (ncr.status === 'approved' ? 'Verified' : 'Pending Review')}</div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 4px; font-size: 8px; color: #94a3b8;">AUTHORIZED SIGNATURE & DATE (${publishedDate})</div>
      </div>
    </div>

    <div class="pdf-footer">
      <div>PG SHIPMANAGEMENT • NCR FORM • OFFICIAL DOCUMENT</div>
      <div>Page 1</div>
    </div>
  `;
  container.appendChild(page1);

  // 3. 渲染页面到 Canvas 并添加到 PDF
  const canvas1 = await html2canvas(page1, { scale: 2, useCORS: true, backgroundColor: "#fff" });
  const imgData1 = canvas1.toDataURL("image/jpeg", 0.95);
  doc.addImage(imgData1, "JPEG", 0, 0, 210, 297);

  // 4. Page 2+: Photo Attachments (if exists)
  if (ncr.imageAttachments && ncr.imageAttachments.length > 0) {
    const imagesPerRow = 2;
    const imagesPerPage = 6;
    const totalPages = Math.ceil(ncr.imageAttachments.length / imagesPerPage);

    for (let p = 0; p < totalPages; p++) {
      doc.addPage();
      const pageX = document.createElement("div");
      pageX.className = "pdf-page";
      
      const currentImages = ncr.imageAttachments.slice(p * imagesPerPage, (p + 1) * imagesPerPage);
      
      pageX.innerHTML = `
        <div class="pdf-header">
           <div>
            <div style="font-size: 9px; font-weight: 900; color: #0d9488; letter-spacing: 0.2em; margin-bottom: 2px;">PG SHIPMANAGEMENT</div>
            <h1 style="font-size: 22px; font-weight: 900; color: #0f172a; margin: 0;">PHOTO ATTACHMENTS</h1>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 8px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Reference</div>
            <div style="font-size: 13px; font-weight: 900; color: #1e293b;">${ncr.formattedSerial || ncr.serialNo}</div>
          </div>
        </div>
        
        <div class="photo-grid">
          ${currentImages.map((imgUrl, i) => `
            <div class="photo-item">
              <img src="${imgUrl}" class="photo-img" />
              <div class="photo-remark">Attachment Photo ${p * imagesPerPage + i + 1}</div>
            </div>
          `).join("")}
        </div>

        <div class="pdf-footer" style="position: absolute; bottom: 15mm; left: 15mm; right: 15mm;">
          <div>PG SHIPMANAGEMENT • ATTACHMENT • ${ncr.hullNumber || '-'}</div>
          <div>Page ${p + 2}</div>
        </div>
      `;
      
      container.innerHTML = "";
      container.appendChild(pageX);
      const canvasX = await html2canvas(pageX, { scale: 2, useCORS: true, backgroundColor: "#fff" });
      const imgDataX = canvasX.toDataURL("image/jpeg", 0.95);
      doc.addImage(imgDataX, "JPEG", 0, 0, 210, 297);
    }
  }

  // 5. 保存并清理
  doc.save(`NCR-${ncr.formattedSerial || ncr.id}.pdf`);
  document.body.removeChild(container);
  style.remove();
}
