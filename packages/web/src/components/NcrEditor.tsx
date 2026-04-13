import React, { useState, useRef, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { PG_LOGO_B64 } from "../utils/pg-logo-b64";
import { compressImageToWebP } from "../utils/image-compression";
import { uploadMedia } from "../api";

interface AttachmentPhoto {
  id: string;
  file: File;
  url: string;
  remark: string;
}

interface NcrEditorProps {
  projectCode: string;
  projectName: string;
  hullNumber: string;
  shipName: string;
  shipId: string;
  authorName: string;
  userDisciplines: string[];
  serialNo: number;
  formattedSerial: string;
  onPublish: (data: { title: string; content: string; rectifyRequest?: string; remark: string; discipline: string; serialNo: number; imageAttachments: string[] }) => Promise<void>;
  onClose: () => void;
}

export function NcrEditor({
  projectCode,
  projectName,
  hullNumber,
  shipName,
  shipId,
  authorName,
  userDisciplines,
  serialNo,
  formattedSerial,
  onPublish,
  onClose
}: NcrEditorProps) {
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [toRecipient, setToRecipient] = useState("");
  const [rectifyRequest, setRectifyRequest] = useState("");
  const [hasAttachment, setHasAttachment] = useState(false);
  const [discipline, setDiscipline] = useState(userDisciplines[0] || "HULL");
  const [isPublishing, setIsPublishing] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentPhoto[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  useEffect(() => {
    return () => attachments.forEach((a) => URL.revokeObjectURL(a.url));
  }, [attachments]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter((f) => f.type.startsWith("image/"));

    setIsPublishing(true);
    try {
      const newAttachments = await Promise.all(
        files.map(async (file) => {
          const compressed = await compressImageToWebP(file, 1600, 0.82);
          return {
            id: crypto.randomUUID(),
            file: compressed,
            url: URL.createObjectURL(compressed),
            remark: ""
          };
        })
      );
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err: any) {
      alert("Failed to compress image");
    } finally {
      setIsPublishing(false);
    }
  };

  const updateAttachmentRemark = (id: string, remark: string) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, remark } : a)));
  };

  const handlePublish = async () => {
    if (!shipId) {
      alert("Please select a ship before creating an NCR.");
      return;
    }
    if (!discipline) {
      alert("Please select a discipline for the NCR.");
      return;
    }
    if (!subject.trim() || !content.trim()) {
      alert("Subject and Description are required.");
      return;
    }

    setIsPublishing(true);
    try {
      const imageKeys: string[] = [];
      if (hasAttachment && attachments.length > 0) {
        for (const attachment of attachments) {
          const result = await uploadMedia(shipId, attachment.file);
          imageKeys.push(result.key);
        }
      }

      await onPublish({
        title: subject.trim(),
        content: content.trim(),
        rectifyRequest: rectifyRequest.trim() || undefined,
        remark: `To: ${toRecipient} | Attachment: ${hasAttachment ? "Yes" : "No"}`,
        discipline,
        serialNo,
        imageAttachments: imageKeys
      });
    } catch (err: any) {
      console.error(err);
      alert(`Submit failed: ${err?.message || String(err)}`);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={modalHeaderStyle}>
        <div style={{ fontWeight: 600 }}>Create Non-Conformance Report</div>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={btnCancelStyle} onClick={onClose} disabled={isPublishing}>Cancel</button>
          <button style={btnPublishStyle} onClick={() => void handlePublish()} disabled={isPublishing}>
            {isPublishing ? <Loader2 size={16} className="animate-spin" /> : "Submit for Manager Review"}
          </button>
        </div>
      </div>
      <div style={modalScrollAreaStyle}>
        <div id="ncr-a4-editor-content" style={a4ContainerStyle} ref={containerRef}>
          {/* Header Section */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #0f172a", paddingBottom: 20, marginBottom: 25 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, color: "#0d9488", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 2 }}>
                PG SHIPMANAGEMENT
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", textTransform: "uppercase", letterSpacing: "-0.05em", margin: 0, lineHeight: 1 }}>
                NON CONFORMITY REPORT
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", color: "#94a3b8", marginBottom: 4, letterSpacing: "0.1em" }}>
                  Report Reference
                </div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#b91c1c", letterSpacing: "0.05em" }}>{formattedSerial}</div>
              </div>
              <img src={PG_LOGO_B64} alt="PG Logo" style={{ height: 60, objectFit: "contain" }} />
            </div>
          </div>

          {/* Metadata Card Section */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginBottom: 25 }}>
            <div style={reportStatCardStyle}>
              <div style={cardHeaderStyle}>VESSEL & PROJECT</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={cardLabelStyle}>PROJECT NAME</div>
                  <div style={cardValueStyle}>{projectName || "-"}</div>
                </div>
                <div>
                  <div style={cardLabelStyle}>HULL NUMBER</div>
                  <div style={cardValueStyle}>{hullNumber || "-"}</div>
                </div>
              </div>
            </div>
            <div style={reportStatCardStyle}>
              <div style={cardHeaderStyle}>REPORT METADATA</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={cardLabelStyle}>ISSUE DATE</div>
                  <div style={cardValueStyle}>{dateStr}</div>
                </div>
                <div>
                  <div style={cardLabelStyle}>NCR STATUS</div>
                  <div style={{ ...cardValueStyle, color: "#d97706" }}>PENDING APPROVAL</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Subject Area */}
            <div style={formSectionStyle}>
              <div style={sectionAccentTitleStyle}>REPORT SUBJECT</div>
              <div style={inputContainerStyle}>
                <input
                  data-html2canvas-ignore="true"
                  style={{ ...premiumInputStyle, fontSize: 16, fontWeight: 800 }}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Summarize the non-conformity briefly..."
                />
                <div style={{ ...premiumInputStyle, fontSize: 16, fontWeight: 800, display: "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }} className="pdf-only-show">
                  {subject}
                </div>
              </div>
            </div>

            {/* Recipient & Discipline */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
              <div style={formSectionStyle}>
                <div style={sectionAccentTitleStyle}>TO (RECIPIENT)</div>
                <div style={inputContainerStyle}>
                  <input
                    data-html2canvas-ignore="true"
                    style={premiumInputStyle}
                    value={toRecipient}
                    onChange={(e) => setToRecipient(e.target.value)}
                    placeholder="Name of recipient or organization..."
                  />
                  <div style={{ ...premiumInputStyle, display: "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }} className="pdf-only-show">
                    {toRecipient}
                  </div>
                </div>
              </div>
              <div style={formSectionStyle}>
                <div style={sectionAccentTitleStyle}>DISCIPLINE</div>
                <div style={inputContainerStyle}>
                  <select
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    style={premiumSelectStyle}
                    data-html2canvas-ignore="false"
                  >
                    {userDisciplines.length > 0 ? (
                      userDisciplines.map((d) => <option key={d} value={d}>{d}</option>)
                    ) : (
                      <option value="HULL">HULL</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div style={{ ...formSectionStyle, flex: 1, minHeight: 220 }}>
              <div style={sectionAccentTitleStyle}>DESCRIPTION OF NON-CONFORMITY</div>
              <div style={{ ...inputContainerStyle, flex: 1, display: "flex", flexDirection: "column" }}>
                <textarea
                  data-html2canvas-ignore="true"
                  style={{ ...premiumTextareaStyle, minHeight: 180 }}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Provide detailed observations, relevant standards, and impact..."
                />
                <div
                  style={{ ...premiumTextareaStyle, display: "none", whiteSpace: "pre-wrap", wordBreak: "break-word", flex: 1 }}
                  className="pdf-only-show"
                >
                  {content}
                </div>
              </div>
            </div>

            {/* Requested Rectify Area */}
            <div style={{ ...formSectionStyle, minHeight: 100 }}>
              <div style={sectionAccentTitleStyle}>REQUESTED RECTIFY</div>
              <div style={{ ...inputContainerStyle, display: "flex", flexDirection: "column" }}>
                <textarea
                  data-html2canvas-ignore="true"
                  style={{ ...premiumTextareaStyle, minHeight: 60 }}
                  value={rectifyRequest}
                  onChange={(e) => setRectifyRequest(e.target.value)}
                  placeholder="Specify the required corrective measures..."
                />
                <div
                  style={{ ...premiumTextareaStyle, display: "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  className="pdf-only-show"
                >
                  {rectifyRequest}
                </div>
              </div>
            </div>

            <div style={{ ...inputContainerStyle, border: "none", background: "transparent", padding: 0 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 15 }}>Required Attachment:</span>
                <label style={{ display: "flex", alignItems: "center", cursor: "pointer", marginRight: 20, fontSize: 11, fontWeight: 700 }}>
                  <input type="radio" checked={hasAttachment} onChange={() => setHasAttachment(true)} style={radioStyle} /> YES
                </label>
                <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                  <input type="radio" checked={!hasAttachment} onChange={() => setHasAttachment(false)} style={radioStyle} /> NO
                </label>

                {hasAttachment && (
                  <div style={{ marginLeft: "auto" }} data-html2canvas-ignore="true">
                    <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleFileSelect} style={{ display: "none" }} />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={pillButtonStyle}
                    >
                      + ADD PHOTOS
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Signature Block */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#e2e8f0", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ background: "#fff", padding: 15 }}>
                <div style={{ fontSize: 8, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Prepared By (Inspector)</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a", marginBottom: 25 }}>{authorName}</div>
                <div style={{ display: "flex", gap: 20 }}>
                  <div style={{ flex: 1, borderTop: "1px solid #e2e8f0", paddingTop: 4, fontSize: 8, fontWeight: 800, color: "#94a3b8" }}>HANDWRITTEN SIGNATURE</div>
                  <div style={{ flex: 0.6, borderTop: "1px solid #e2e8f0", paddingTop: 4, fontSize: 8, fontWeight: 800, color: "#94a3b8" }}>TITLE</div>
                </div>
              </div>
              <div style={{ background: "#fff", padding: 15 }}>
                <div style={{ fontSize: 8, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Approved By (Authorized Manager)</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#94a3b8", marginBottom: 25 }}>Pending manager review</div>
                <div style={{ display: "flex", gap: 20 }}>
                  <div style={{ flex: 1, borderTop: "1px solid #e2e8f0", paddingTop: 4, fontSize: 8, fontWeight: 800, color: "#94a3b8" }}>AUTHORIZED SIGNATURE</div>
                  <div style={{ flex: 0.6, borderTop: "1px solid #e2e8f0", paddingTop: 4, fontSize: 8, fontWeight: 800, color: "#94a3b8" }}>DATE</div>
                </div>
              </div>
            </div>
          </div>

          {/* Page Footer */}
          <div style={{ position: "absolute", bottom: "10mm", left: "15mm", right: "15mm", borderTop: "1px solid #f1f5f9", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 7, fontWeight: 900, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.3em" }}>
              PG SHIPMANAGEMENT • NCR FORM • INTERNAL USE ONLY
            </div>
            <div style={{ fontSize: 8, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase" }}>
              Page 1 of {hasAttachment && attachments.length > 0 ? Math.ceil(attachments.length / 6) + 1 : 1}
            </div>
          </div>
        </div>

        {/* Attachment Pages */}
        {hasAttachment && attachments.length > 0 && Array.from({ length: Math.ceil(attachments.length / 6) }).map((_, pageIndex) => {
          const pageAttachments = attachments.slice(pageIndex * 6, (pageIndex + 1) * 6);
          const totalPages = Math.ceil(attachments.length / 6) + 1;
          const slots = Array.from({ length: 6 });

          return (
            <div key={pageIndex} id={`ncr-a4-editor-page-${pageIndex + 1}`} style={{ ...a4ContainerStyle, marginTop: 40, padding: "12mm 15mm" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #0f172a", paddingBottom: 15, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 900, color: "#0d9488", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 2 }}>
                    PG SHIPMANAGEMENT
                  </div>
                  <h1 style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", textTransform: "uppercase", margin: 0 }}>
                    PHOTO ATTACHMENTS
                  </h1>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", color: "#94a3b8", marginBottom: 2 }}>REFERENCE</div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#0f172a" }}>{formattedSerial}</div>
                </div>
              </div>

              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(3, 1fr)", gap: "8mm", marginBottom: 20 }}>
                {slots.map((_, slotIndex) => {
                  const attachment = pageAttachments[slotIndex];
                  return (
                    <div key={slotIndex} style={{ display: "flex", flexDirection: "column", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ flex: 1, position: "relative" }}>
                        {attachment ? (
                          <img src={attachment.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="Attachment" />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1" }}>
                            <Loader2 size={24} strokeWidth={1} style={{ opacity: 0.5 }} />
                          </div>
                        )}
                        {attachment && (
                          <div data-html2canvas-ignore="true" style={{ position: "absolute", top: 8, right: 8 }}>
                            <button
                              onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))}
                              style={{ width: 24, height: 24, border: "none", background: "#fff", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}
                            >
                              <X size={14} color="#ef4444" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: "8px 12px", background: "#fff", borderTop: "1px solid #e2e8f0" }}>
                        <input
                          style={{ width: "100%", border: "none", outline: "none", fontSize: 10, fontWeight: 600, color: "#334155" }}
                          placeholder={attachment ? "Type photo remark..." : "Empty Slot"}
                          value={attachment?.remark || ""}
                          onChange={(e) => attachment && updateAttachmentRemark(attachment.id, e.target.value)}
                          disabled={!attachment}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ position: "absolute", bottom: "10mm", left: "15mm", right: "15mm", borderTop: "1px solid #f1f5f9", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 7, fontWeight: 900, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.3em" }}>
                  PG SHIPMANAGEMENT • ATTACHMENT • {hullNumber}
                </div>
                <div style={{ fontSize: 8, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase" }}>
                  Page {pageIndex + 2} of {totalPages}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----- STYLES -----
const modalOverlayStyle: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: "rgba(15, 23, 42, 0.8)",
  zIndex: 9999, display: "flex", flexDirection: "column"
};

const modalHeaderStyle: React.CSSProperties = {
  height: 60, backgroundColor: "#fff", borderBottom: "1px solid #e2e8f0",
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "0 24px", flexShrink: 0,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
};

const modalScrollAreaStyle: React.CSSProperties = {
  flex: 1, overflowY: "auto", padding: "40px 20px", display: "flex", justifyContent: "center"
};

const a4ContainerStyle: React.CSSProperties = {
  width: "210mm", height: "297mm", backgroundColor: "#fff",
  boxShadow: "0 10px 30px rgba(0,0,0,0.3)", padding: "18mm 15mm",
  display: "flex", flexDirection: "column", boxSizing: "border-box",
  position: "relative",
  color: "#191c1d",
  fontFamily: "Inter, sans-serif"
};

const reportStatCardStyle: React.CSSProperties = {
  background: "#f8fafc",
  padding: "16px 20px",
  borderRadius: "16px",
  border: "2px solid #f1f5f9"
};

const cardHeaderStyle: React.CSSProperties = {
  fontSize: 8, fontWeight: 900, color: "#0d9488", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10
};

const cardLabelStyle: React.CSSProperties = {
  fontSize: 7, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2
};

const cardValueStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 900, color: "#1e293b", textTransform: "uppercase"
};

const formSectionStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column"
};

const sectionAccentTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 900, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
  borderLeft: "3px solid #0d9488", paddingLeft: 10
};

const inputContainerStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "10px 14px"
};

const premiumInputStyle: React.CSSProperties = {
  width: "100%", border: "none", outline: "none", fontSize: 13, fontWeight: 600, color: "#0f172a", background: "transparent"
};

const premiumTextareaStyle: React.CSSProperties = {
  ...premiumInputStyle, minHeight: 280, resize: "none", lineHeight: 1.5, fontFamily: "inherit"
};

const premiumSelectStyle: React.CSSProperties = {
  ...premiumInputStyle, cursor: "pointer"
};

const radioStyle: React.CSSProperties = {
  accentColor: "#0d9488", marginRight: 8
};

const pillButtonStyle: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 20, background: "#0f172a", color: "#fff", fontSize: 9, fontWeight: 900, cursor: "pointer", border: "none", letterSpacing: "0.05em"
};

const btnBase: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", border: "none"
};

const btnCancelStyle: React.CSSProperties = {
  ...btnBase, backgroundColor: "#f1f5f9", color: "#334155"
};
const btnPublishStyle: React.CSSProperties = {
  ...btnBase, backgroundColor: "#0f172a", color: "#fff"
};
