import React, { useEffect, useState, useCallback } from "react";
import type { ObservationItem, ObservationType, Discipline } from "@nbins/shared";
import { DISCIPLINES, DEFAULT_OBSERVATION_TYPES } from "@nbins/shared";
import {
  fetchObservations,
  fetchObservationTypes,
  createObservation,
  createObservationType,
  closeObservation
} from "../api";

// 默认使用第一条船做演示
const DEMO_SHIP_ID = "ship-h2748";

export function Observations() {
  const [items, setItems] = useState<ObservationItem[]>([]);
  const [types, setTypes] = useState<ObservationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 筛选状态
  const [filterType, setFilterType] = useState("");
  const [filterDiscipline, setFilterDiscipline] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // 新增表单
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState("");
  const [formDiscipline, setFormDiscipline] = useState<string>("HULL");
  const [formDate, setFormDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [formContent, setFormContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 新增类型弹窗
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [newTypeCode, setNewTypeCode] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState("");

  // 加载意见类型列表
  const loadTypes = useCallback(async () => {
    try {
      const data = await fetchObservationTypes();
      if (data.length > 0) {
        setTypes(data);
      } else {
        // 如果后台还没有类型，显示预置的默认项
        setTypes(
          DEFAULT_OBSERVATION_TYPES.map((t, i) => ({
            id: `default-${t.code}`,
            code: t.code,
            label: t.label,
            sortOrder: i,
            createdAt: "",
            updatedAt: ""
          }))
        );
      }
    } catch {
      // API 不可用时使用默认类型
      setTypes(
        DEFAULT_OBSERVATION_TYPES.map((t, i) => ({
          id: `default-${t.code}`,
          code: t.code,
          label: t.label,
          sortOrder: i,
          createdAt: "",
          updatedAt: ""
        }))
      );
    }
  }, []);

  // 加载意见列表
  const loadObservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, string> = {};
      if (filterType) filters.type = filterType;
      if (filterDiscipline) filters.discipline = filterDiscipline;
      if (filterStatus) filters.status = filterStatus;
      const data = await fetchObservations(DEMO_SHIP_ID, filters);
      setItems(data);
    } catch (e: any) {
      setError(e.message || "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterDiscipline, filterStatus]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    void loadObservations();
  }, [loadObservations]);

  // 提交新意见
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formType || !formContent.trim()) return;
    setSubmitting(true);
    try {
      await createObservation(DEMO_SHIP_ID, {
        type: formType,
        discipline: formDiscipline,
        authorId: "sys-user",
        date: formDate,
        content: formContent.trim()
      });
      setFormContent("");
      setShowForm(false);
      void loadObservations();
    } catch (e: any) {
      alert("提交失败: " + (e.message || "未知错误"));
    } finally {
      setSubmitting(false);
    }
  };

  // 关闭意见
  const handleClose = async (id: string) => {
    try {
      await closeObservation(id, "sys-user");
      void loadObservations();
    } catch (e: any) {
      alert("关闭失败: " + (e.message || "未知错误"));
    }
  };

  // 新增自定义类型
  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeCode.trim() || !newTypeLabel.trim()) return;
    try {
      await createObservationType({
        code: newTypeCode.trim().toLowerCase().replace(/\s+/g, "_"),
        label: newTypeLabel.trim(),
        sortOrder: types.length
      });
      setNewTypeCode("");
      setNewTypeLabel("");
      setShowTypeForm(false);
      void loadTypes();
    } catch (e: any) {
      alert("新增类型失败: " + (e.message || "未知错误"));
    }
  };

  const getTypeLabel = (code: string) => {
    const found = types.find((t) => t.code === code);
    return found?.label ?? code;
  };

  return (
    <main className="observations-page" style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* 页面标题 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--nb-text)" }}>
            巡检 / 试航意见
          </h1>
          <p style={{ fontSize: 13, color: "var(--nb-text-muted)", margin: "4px 0 0" }}>
            OBSERVATION MANAGEMENT · Ship: {DEMO_SHIP_ID}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="nb-btn nb-btn-secondary"
            onClick={() => setShowTypeForm(!showTypeForm)}
            style={btnStyle("secondary")}
          >
            + 自定义类型
          </button>
          <button
            className="nb-btn nb-btn-primary"
            onClick={() => setShowForm(!showForm)}
            style={btnStyle("primary")}
          >
            + 新增意见
          </button>
        </div>
      </div>

      {/* 新增类型表单 */}
      {showTypeForm && (
        <form onSubmit={handleAddType} style={formBoxStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>新增意见类型</h3>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <label style={labelStyle}>
              <span>编码 (英文)</span>
              <input
                type="text"
                value={newTypeCode}
                onChange={(e) => setNewTypeCode(e.target.value)}
                placeholder="如 hatch_cover"
                style={inputStyle}
                required
              />
            </label>
            <label style={labelStyle}>
              <span>显示名称</span>
              <input
                type="text"
                value={newTypeLabel}
                onChange={(e) => setNewTypeLabel(e.target.value)}
                placeholder="如 舱盖检查"
                style={inputStyle}
                required
              />
            </label>
            <button type="submit" style={btnStyle("primary")}>确认添加</button>
            <button type="button" onClick={() => setShowTypeForm(false)} style={btnStyle("secondary")}>取消</button>
          </div>
        </form>
      )}

      {/* 新增意见表单 */}
      {showForm && (
        <form onSubmit={handleSubmit} style={formBoxStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>新增巡检/试航意见</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={labelStyle}>
              <span>类型</span>
              <select value={formType} onChange={(e) => setFormType(e.target.value)} style={inputStyle} required>
                <option value="">-- 选择类型 --</option>
                {types.map((t) => (
                  <option key={t.code} value={t.code}>{t.label} ({t.code})</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              <span>专业</span>
              <select
                value={formDiscipline}
                onChange={(e) => setFormDiscipline(e.target.value)}
                style={inputStyle}
              >
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              <span>日期</span>
              <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={inputStyle} required />
            </label>
          </div>
          <label style={{ ...labelStyle, marginTop: 12, display: "block" }}>
            <span>意见内容</span>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="描述具体的观察意见..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical", width: "100%" }}
              required
            />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={submitting} style={btnStyle("primary")}>
              {submitting ? "提交中..." : "提交"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={btnStyle("secondary")}>取消</button>
          </div>
        </form>
      )}

      {/* 筛选栏 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={filterSelectStyle}>
          <option value="">全部类型</option>
          {types.map((t) => (
            <option key={t.code} value={t.code}>{t.label}</option>
          ))}
        </select>
        <select value={filterDiscipline} onChange={(e) => setFilterDiscipline(e.target.value)} style={filterSelectStyle}>
          <option value="">全部专业</option>
          {DISCIPLINES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={filterSelectStyle}>
          <option value="">全部状态</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <span style={{ fontSize: 13, color: "var(--nb-text-muted)", alignSelf: "center" }}>
          共 {items.length} 条记录
        </span>
      </div>

      {/* 列表 */}
      {loading ? (
        <p style={{ color: "var(--nb-text-muted)", textAlign: "center", padding: 40 }}>加载中...</p>
      ) : error ? (
        <p style={{ color: "#ef4444", textAlign: "center", padding: 40 }}>{error}</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--nb-text-muted)" }}>
          <p style={{ fontSize: 15 }}>暂无观察意见记录</p>
          <p style={{ fontSize: 13 }}>点击「+ 新增意见」开始添加</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: "var(--nb-surface)",
                border: "1px solid var(--nb-border)",
                borderRadius: 10,
                padding: "14px 18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={tagStyle(item.status === "open" ? "#f59e0b" : "#22c55e")}>
                    {item.status === "open" ? "OPEN" : "CLOSED"}
                  </span>
                  <span style={tagStyle("#6366f1")}>{getTypeLabel(item.type)}</span>
                  <span style={tagStyle("#0ea5e9")}>{item.discipline}</span>
                  <span style={{ fontSize: 12, color: "var(--nb-text-muted)" }}>{item.date}</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--nb-text)" }}>
                  {item.content}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--nb-text-muted)" }}>
                  by {item.authorName ?? item.authorId}
                  {item.closedAt && ` · closed ${item.closedAt.slice(0, 10)}`}
                </p>
              </div>
              {item.status === "open" && (
                <button
                  onClick={() => handleClose(item.id)}
                  style={{ ...btnStyle("secondary"), fontSize: 12, padding: "4px 10px", whiteSpace: "nowrap" }}
                >
                  关闭
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

// ---- 内联样式 helpers ----

function btnStyle(variant: "primary" | "secondary"): React.CSSProperties {
  const base: React.CSSProperties = {
    border: "none",
    borderRadius: 6,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s"
  };
  if (variant === "primary") {
    return { ...base, background: "var(--nb-accent, #0f766e)", color: "#fff" };
  }
  return {
    ...base,
    background: "var(--nb-surface, #f1f5f9)",
    color: "var(--nb-text, #334155)",
    border: "1px solid var(--nb-border, #e2e8f0)"
  };
}

const formBoxStyle: React.CSSProperties = {
  background: "var(--nb-surface)",
  border: "1px solid var(--nb-border)",
  borderRadius: 10,
  padding: "16px 20px",
  marginBottom: 16
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "var(--nb-text-muted)",
  fontWeight: 500
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--nb-border, #e2e8f0)",
  fontSize: 13,
  background: "var(--nb-bg, #fff)",
  color: "var(--nb-text, #334155)",
  minWidth: 140
};

const filterSelectStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--nb-border, #e2e8f0)",
  fontSize: 13,
  background: "var(--nb-surface, #f8fafc)",
  color: "var(--nb-text, #334155)"
};

function tagStyle(color: string): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 4,
    background: `${color}18`,
    color: color,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const
  };
}
