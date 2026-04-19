import React, { useState, useRef, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { PG_LOGO_B64 } from "../utils/pg-logo-b64";
import { compressImageToWebP } from "../utils/image-compression";
import { uploadMedia } from "../api";
import { DISCIPLINES } from "@nbins/shared";

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
  onSubmit: (data: { title: string; content: string; result: string; remark: string; discipline: string; serialNo: number; imageAttachments: string[] }) => Promise<void>;
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
  const [content, setContent] = useState("");
  const [result, setResult] = useState("PASS");
  const [remark, setRemark] = useState("");
  const [discipline, setDiscipline] = useState(userDisciplines[0] || "HULL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentPhoto[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

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

  const updateAttachmentRemark = (id: string, remark: string) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, remark } : a)));
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

      await onSubmit({
        title: subject.trim(),
        content: content.trim(),
        result,
        remark: remark.trim(),
        discipline,
        serialNo,
        imageAttachments: imageKeys
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

            {/* Subject */}
            <div style={formSectionStyle}>
              <div style={sectionAccentTitleStyle}>TEST SUBJECT</div>
              <div style={inputContainerStyle}>
                <input
                  style={{ ...premiumInputStyle, fontSize: 16, fontWeight: 800 }}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Summarize the FAT item briefly..."
                />
              </div>
            </div>

            {/* Content */}
            <div style={{ ...formSectionStyle, flex: 1, minHeight: 180 }}>
              <div style={sectionAccentTitleStyle}>TEST DESCRIPTION</div>
              <div style={{ ...inputContainerStyle, flex: 1, display: "flex", flexDirection: "column" }}>
                <textarea
                  style={{ ...premiumTextareaStyle, minHeight: 140 }}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Describe the test procedure and observations..."
                />
              </div>
            </div>

            {/* Result */}
            <div style={formSectionStyle}>
              <div style={sectionAccentTitleStyle}>RESULT</div>
              <div style={{ ...inputContainerStyle, display: "flex", gap: 20, alignItems: "center", padding: "12px 14px" }}>
                <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                  <input type="radio" checked={result === "PASS"} onChange={() => setResult("PASS")} style={radioStyle} />
                  <span style={{ color: "#16a34a" }}>PASS</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                  <input type="radio" checked={result === "FAIL"} onChange={() => setResult("FAIL")} style={radioStyle} />
                  <span style={{ color: "#dc2626" }}>FAIL</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                  <input type="radio" checked={result === "CONDITIONAL"} onChange={() => setResult("CONDITIONAL")} style={radioStyle} />
                  <span style={{ color: "#d97706" }}>CONDITIONAL</span>
                </label>
              </div>
            </div>

            {/* Remark */}
            <div style={formSectionStyle}>
              <div style={sectionAccentTitleStyle}>REMARK</div>
              <div style={inputContainerStyle}>
                <textarea
                  style={{ ...premiumTextareaStyle, minHeight: 60 }}
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Optional remarks..."
                />
              </div>
            </div>

            {/* Attachments */}
            <div style={formSectionStyle}>
              <div style={{ ...sectionAccentTitleStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>ATTACHMENTS</span>
                <button onClick={() => fileInputRef.current?.click()} style={pillButtonStyle}>+ ADD PHOTOS</button>
              </div>
              <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleFileSelect} style={{ display: "none" }} />
              {attachments.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  {attachments.map((a) => (
                    <div key={a.id} style={{ position: "relative", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                      <img src={a.url} style={{ width: "100%", height: 120, objectFit: "cover" }} alt="Attachment" />
                      <div style={{ padding: "6px 10px", background: "#fff", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          style={{ flex: 1, border: "none", outline: "none", fontSize: 10, fontWeight: 600, color: "#334155" }}
                          placeholder="Photo remark..."
                          value={a.remark}
                          onChange={(e) => updateAttachmentRemark(a.id, e.target.value)}
                        />
                        <button
                          onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
                        >
                          <X size={14} color="#ef4444" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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
            <div style={{ fontSize: 8, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase" }}>Page 1</div>
          </div>
        </div>
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

const btnSubmitStyle: React.CSSProperties = {
  ...btnBase, backgroundColor: "#0f766e", color: "#fff"
};
