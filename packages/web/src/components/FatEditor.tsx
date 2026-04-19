import React, { useState, useRef, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { PG_LOGO_B64 } from "../utils/pg-logo-b64";
import { compressImageToWebP } from "../utils/image-compression";
import { uploadMedia } from "../api";
import { DISCIPLINES } from "@nbins/shared";
import type { FatComment } from "@nbins/shared";

interface AttachmentPhoto {
  id: string;
  file: File;
  url: string;
  remark: string;
}

interface FatEditorProps {
  projectCode: string;
  projectName: string;
  hullNumber: string;
  shipName: string;
  shipId: string;
  authorName: string;
  userDisciplines: string[];
  serialNo: number;
  formattedSerial: string;
  projectOwner?: string | null;
  projectShipyard?: string | null;
  onSubmit: (data: {
    title: string;
    content: string;
    result: string;
    comments: FatComment[];
    discipline: string;
    serialNo: number;
    imageAttachments: string[];
    maker: string;
  }) => Promise<void>;
  onClose: () => void;
}

export function FatEditor({
  projectName,
  hullNumber,
  shipId,
  authorName,
  userDisciplines,
  serialNo,
  formattedSerial,
  projectOwner,
  projectShipyard,
  onSubmit,
  onClose
}: FatEditorProps) {
  const [subject, setSubject] = useState("");
  const [maker, setMaker] = useState("");
  const [content, setContent] = useState("");
  const [commentsText, setCommentsText] = useState("");
  const [discipline, setDiscipline] = useState(userDisciplines[0] || "HULL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentPhoto[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  // Auto-compute result based on comments text
  const commentLines = commentsText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const openCount = commentLines.length;
  const computedResult = openCount > 0 ? "COMMENTS" : "PASS";

  useEffect(() => {
    return () => attachments.forEach((a) => URL.revokeObjectURL(a.url));
  }, [attachments]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter((f) => f.type.startsWith("image/"));

    setIsSubmitting(true);
    try {
      const newAttachments = await Promise.all(
        files.map(async (file) => {
          const compressed = await compressImageToWebP(file, 800, 0.82);
          return {
            id: crypto.randomUUID(),
            file: compressed,
            url: URL.createObjectURL(compressed),
            remark: ""
          };
        })
      );
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch {
      alert("Failed to compress image");
    } finally {
      setIsSubmitting(false);
    }
  };

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleSubmit = async () => {
    if (!shipId) {
      alert("Please select a ship before creating a FAT.");
      return;
    }
    if (!discipline) {
      alert("Please select a discipline for the FAT.");
      return;
    }
    if (!subject.trim() || !content.trim()) {
      alert("Subject and Content are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const imageKeys: string[] = [];
      if (attachments.length > 0) {
        for (const attachment of attachments) {
          const uploadResult = await uploadMedia(shipId, attachment.file);
          imageKeys.push(uploadResult.key);
        }
      }

      // Generate comments from textarea: split by newline, filter empty
      const generatedComments: FatComment[] = commentsText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => ({
          id: crypto.randomUUID(),
          content: line,
          status: "open" as const,
          createdAt: new Date().toISOString()
        }));

      await onSubmit({
        title: subject.trim(),
        content: content.trim(),
        result: generatedComments.some((c) => c.status === "open") ? "COMMENTS" : "PASS",
        comments: generatedComments,
        discipline,
        serialNo,
        imageAttachments: imageKeys,
        maker: maker.trim()
      });
    } catch (err: any) {
      console.error(err);
      alert(`Submit failed: ${err?.message || String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={modalHeaderStyle}>
        <div style={{ fontWeight: 600 }}>Create Factory Acceptance Test</div>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={btnCancelStyle} onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button style={btnSubmitStyle} onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Submit FAT"}
          </button>
        </div>
      </div>
      <div style={modalScrollAreaStyle}>
        <div style={a4ContainerStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #0f172a", paddingBottom: 20, marginBottom: 25 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src={PG_LOGO_B64} alt="PG Logo" style={{ height: 48, width: 48, objectFit: "contain" }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>PG Newbuilding</div>
                <div style={{ fontSize: 9, fontWeight: 400, color: "#94a3b8" }}>Technical Intelligence System</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", textTransform: "uppercase", lineHeight: 1 }}>FACTORY ACCEPTANCE TEST</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>REF: {formattedSerial}</div>
            </div>
          </div>

          {/* Info Grid */}
          <div style={{
            background: "#f8fafc",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            padding: "14px 18px",
            marginBottom: 25,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "16px 12px"
          }}>
            {[
              { label: "PROJECT", value: projectName || "-" },
              { label: "HULL NUMBER", value: hullNumber || "-" },
              { label: "OWNER", value: projectOwner || "-" },
              { label: "SHIPYARD", value: projectShipyard || "-" },
              { label: "ISSUE DATE", value: dateStr },
              { label: "DISCIPLINE", value: discipline }
            ].map((item) => (
              <div key={item.label}>
                <div style={{ fontSize: 7, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: item.label === "DISCIPLINE" ? "#0d9488" : "#0f172a" }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Discipline */}
            <div style={formSectionStyle}>
              <div style={sectionAccentTitleStyle}>DISCIPLINE</div>
              <div style={inputContainerStyle}>
                <select
                  value={discipline}
                  onChange={(e) => setDiscipline(e.target.value)}
                  style={premiumSelectStyle}
                >
                  {(DISCIPLINES as readonly string[]).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            {/* Equipment & Maker - same row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={formSectionStyle}>
                <div style={sectionAccentTitleStyle}>EQUIPMENT</div>
                <div style={inputContainerStyle}>
                  <input
                    style={{ ...premiumInputStyle, fontSize: 16, fontWeight: 800 }}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Enter equipment name..."
                  />
                </div>
              </div>
              <div style={formSectionStyle}>
                <div style={sectionAccentTitleStyle}>MAKER</div>
                <div style={inputContainerStyle}>
                  <input
                    style={{ ...premiumInputStyle, fontSize: 14, fontWeight: 600 }}
                    value={maker}
                    onChange={(e) => setMaker(e.target.value)}
                    placeholder="Enter maker/manufacturer..."
                  />
                </div>
              </div>
            </div>

            {/* Content */}
            <div style={formSectionStyle}>
              <div style={sectionAccentTitleStyle}>TEST DESCRIPTION</div>
              <div style={inputContainerStyle}>
                <textarea
                  style={{ ...premiumTextareaStyle, minHeight: 72, resize: "none", overflow: "hidden" }}
                  value={content}
                  onChange={(e) => { setContent(e.target.value); autoResizeTextarea(e.target); }}
                  ref={(el) => { if (el) autoResizeTextarea(el); }}
                  placeholder="Describe the test procedure and observations..."
                />
              </div>
            </div>

            {/* Result - auto computed */}
            <div style={formSectionStyle}>
              <div style={{ ...sectionAccentTitleStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>RESULT</span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: computedResult === "PASS" ? "#dcfce7" : computedResult === "COMMENTS" ? "#fef3c7" : "#fef2f2",
                  color: computedResult === "PASS" ? "#16a34a" : computedResult === "COMMENTS" ? "#d97706" : "#dc2626"
                }}>
                  {computedResult}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#64748b", fontStyle: "italic", padding: "4px 0" }}>
                Result is auto-computed: {openCount > 0 ? `${openCount} comment${openCount > 1 ? "s" : ""} → COMMENTS` : "No comments → PASS"}
              </div>
            </div>

            {/* Comments - textarea input, newline separated */}
            <div style={formSectionStyle}>
              <div style={sectionAccentTitleStyle}>COMMENTS</div>
              <label style={{
                display: "grid",
                gap: 4,
              }}>
                <span style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em"
                }}>
                  NEW COMMENTS (ONE PER LINE)
                </span>
                <textarea
                  value={commentsText}
                  onChange={(e) => { setCommentsText(e.target.value); autoResizeTextarea(e.target); }}
                  ref={(el) => { if (el) autoResizeTextarea(el); }}
                  placeholder={"Enter comments, one per line...\n\n1st comment here\n2nd comment here\n3rd comment here"}
                  style={{
                    width: "100%",
                    border: "1px solid rgba(148, 163, 184, 0.4)",
                    borderRadius: 8,
                    background: "#ffffff",
                    padding: "8px 12px",
                    color: "#0f172a",
                    font: "inherit",
                    fontSize: 12,
                    lineHeight: 1.6,
                    minHeight: 80,
                    resize: "none",
                    overflow: "hidden",
                    outline: "none"
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#0d9488";
                    e.target.style.boxShadow = "0 0 0 2px rgba(13, 148, 136, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(148, 163, 184, 0.4)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </label>
              {commentLines.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#0d9488", fontWeight: 600 }}>
                  {commentLines.length} comment{commentLines.length > 1 ? "s" : ""} will be generated on submit
                </div>
              )}
            </div>

            {/* Attachments */}
            <div style={formSectionStyle}>
              <div style={{ ...sectionAccentTitleStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>ATTACHMENTS{attachments.length > 0 ? ` (${attachments.length} photo${attachments.length > 1 ? "s" : ""})` : ""}</span>
                <button onClick={() => fileInputRef.current?.click()} style={pillButtonStyle}>+ ADD PHOTOS</button>
              </div>
              <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleFileSelect} style={{ display: "none" }} />
              {attachments.length === 0 && (
                <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", padding: "8px 0" }}>No photos attached. Click "+ ADD PHOTOS" to browse files.</div>
              )}
            </div>

            {/* Signature Block */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 1, background: "#e2e8f0", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ background: "#fff", padding: 15 }}>
                <div style={{ fontSize: 8, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Prepared By</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>{authorName}</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ position: "absolute", bottom: "10mm", left: "15mm", right: "15mm", borderTop: "1px solid #f1f5f9", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 7, fontWeight: 900, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.3em" }}>
              PG NEWBUILDING • FAT FORM • OFFICIAL DOCUMENT
            </div>
            <div style={{ fontSize: 8, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase" }}>Page 1 of {attachments.length > 0 ? Math.ceil(attachments.length / 6) + 1 : 1}</div>
          </div>
        </div>

        {/* Attachment Pages */}
        {attachments.length > 0 && Array.from({ length: Math.ceil(attachments.length / 6) }).map((_, pageIndex) => {
          const pageAttachments = attachments.slice(pageIndex * 6, (pageIndex + 1) * 6);
          const totalPages = Math.ceil(attachments.length / 6) + 1;
          const slots = Array.from({ length: 6 });

          return (
            <div key={pageIndex} style={{ ...a4ContainerStyle, marginTop: 40, padding: "12mm 15mm" }}>
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
                          <div style={{ position: "absolute", top: 8, right: 8 }}>
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
                          onChange={(e) => attachment && setAttachments((prev) => prev.map((a) => a.id === attachment.id ? { ...a, remark: e.target.value } : a))}
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
  flex: 1, overflowY: "auto", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center"
};

const a4ContainerStyle: React.CSSProperties = {
  width: "210mm", minHeight: "297mm", backgroundColor: "#fff",
  boxShadow: "0 10px 30px rgba(0,0,0,0.3)", padding: "18mm 15mm",
  display: "flex", flexDirection: "column", boxSizing: "border-box",
  position: "relative",
  color: "#191c1d",
  fontFamily: "Inter, sans-serif"
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

const btnSubmitStyle: React.CSSProperties = {
  ...btnBase, backgroundColor: "#0f766e", color: "#fff"
};
