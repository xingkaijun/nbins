import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import {

  batchImportInspections,
  closeObservation,
  createObservation,
  createObservationType,
  createProject,
  createShip,
  createUser,
  fetchInspectionDetail,
  fetchInspectionList,
  fetchObservations,
  fetchObservationTypes,
  fetchProjects,
  fetchShips,
  fetchUsers,
  resolveInspectionComment,
  submitInspectionResult,
  updateInspectionCommentAdmin,
  updateInspectionCurrentRoundAdmin,
  updateInspectionItemAdmin,
  updateObservation,
  updateObservationType,
  updateProject,
  updateShip,
  updateUser,
  updateUserPassword,
  createInspectionCommentAdmin,
  deleteInspectionCommentAdmin,
  type ProjectRecord,
  type ShipRecord,
  type UserRecord,
} from "../api";
import {
  DISCIPLINES,
  INSPECTION_RESULTS,
  ROLES,
  WORKFLOW_STATUSES,
  type Discipline,
  type InspectionItemDetailResponse,
  type InspectionListItem,
  type ObservationItem,
  type ObservationType,
  type Role,
  type WorkflowStatus,
} from "@nbins/shared";

/* ───────── constants ───────── */

type TableKey = "projects" | "ships" | "disciplines" | "users" | "obsTypes" | "inspections" | "observations";

const SIDEBAR_ITEMS: { key: TableKey; label: string; group: "base" | "data" }[] = [
  { key: "projects", label: "Projects", group: "base" },
  { key: "ships", label: "Ships", group: "base" },
  { key: "disciplines", label: "Disciplines", group: "base" },
  { key: "users", label: "Users", group: "base" },
  { key: "obsTypes", label: "Observation Types", group: "base" },
  { key: "inspections", label: "Inspections", group: "data" },
  { key: "observations", label: "Observations", group: "data" },
];

const PAGE_SIZE = 30;

const LAZY_TABLES: TableKey[] = ["inspections", "observations"];

function errMsg(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

function empty(v: string): string | null {
  const x = v.trim();
  return x || null;
}

/* ───────── main component ───────── */

export function Admin() {
  const { session } = useAuth();

  /* ── global state ── */

  const [activeTable, setActiveTable] = useState<TableKey>("projects");
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [working, setWorking] = useState(false);

  /* ── data stores ── */
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [ships, setShips] = useState<ShipRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [obsTypes, setObsTypes] = useState<ObservationType[]>([]);
  const [inspectionList, setInspectionList] = useState<InspectionListItem[]>([]);
  const [observations, setObservations] = useState<ObservationItem[]>([]);
  const [inspectionDetail, setInspectionDetail] = useState<InspectionItemDetailResponse | null>(null);
  
  /* ── disciplines state ── */
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  /* ── filters ── */
  const [projStatusFilter, setProjStatusFilter] = useState("");
  const [projSearch, setProjSearch] = useState("");
  const [shipProjFilter, setShipProjFilter] = useState("");
  const [shipStatusFilter, setShipStatusFilter] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userActiveFilter, setUserActiveFilter] = useState("");

  const [inspProjFilter, setInspProjFilter] = useState("");
  const [inspShipFilter, setInspShipFilter] = useState("");
  const [inspDiscFilter, setInspDiscFilter] = useState("");
  const [inspStatusFilter, setInspStatusFilter] = useState("");
  const [inspSearch, setInspSearch] = useState("");
  const [inspLoaded, setInspLoaded] = useState(false);

  const [obsShipFilter, setObsShipFilter] = useState("");
  const [obsTypeFilter, setObsTypeFilter] = useState("");
  const [obsDiscFilter, setObsDiscFilter] = useState("");
  const [obsStatusFilter, setObsStatusFilter] = useState("");
  const [obsDateFrom, setObsDateFrom] = useState("");
  const [obsDateTo, setObsDateTo] = useState("");
  const [obsLoaded, setObsLoaded] = useState(false);

  /* ── pagination ── */
  const [page, setPage] = useState(1);

  /* ── modal state ── */
  const [modalMode, setModalMode] = useState<"closed" | "new" | "edit">("closed");
  const [modalData, setModalData] = useState<Record<string, any>>({});
  const [inspModalTab, setInspModalTab] = useState<"item" | "round" | "comments">("item");
  const [editingCommentId, setEditingCommentId] = useState("");
  const [commentForm, setCommentForm] = useState({ content: "", status: "open" as "open" | "closed", closedBy: "", closedAt: "" });
  const [newCommentDraft, setNewCommentDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");

  /* ── auto-clear toast ── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── initial load ── */
  useEffect(() => { void loadBase(); }, []);

  async function loadBase() {
    try {
      const [p, s, u, o] = await Promise.all([fetchProjects(), fetchShips(), fetchUsers(), fetchObservationTypes()]);
      setProjects(p); setShips(s); setUsers(u); setObsTypes(o);
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to load base data") }); }
  }

  /* ── table switch handler ── */
  function switchTable(key: TableKey) {
    setActiveTable(key);
    setPage(1);
    setModalMode("closed");
    if (key === "inspections") { if (!inspLoaded) setInspectionList([]); }
    if (key === "observations") { if (!obsLoaded) setObservations([]); }
  }

  /* ── lazy loaders ── */
  async function doSearchInspections() {
    setWorking(true);
    try {
      const data = await fetchInspectionList();
      setInspectionList(data.items);
      setInspLoaded(true);
      setPage(1);
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to load inspections") }); }
    finally { setWorking(false); }
  }

  async function doSearchObservations() {
    if (!obsShipFilter) { setToast({ type: "err", text: "Please select a ship first" }); return; }
    setWorking(true);
    try {
      const data = await fetchObservations({
        shipId: obsShipFilter,
        type: obsTypeFilter || undefined,
        discipline: obsDiscFilter || undefined,
        status: obsStatusFilter || undefined,
      });
      const filteredByDate = data.filter((item) =>
        (!obsDateFrom || item.date >= obsDateFrom) &&
        (!obsDateTo || item.date <= obsDateTo)
      );
      setObservations(filteredByDate);
      setObsLoaded(true);
      setPage(1);
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to load observations") }); }
    finally { setWorking(false); }
  }

  /* ── filtered data ── */
  const filteredProjects = useMemo(() => projects.filter(p =>
    (!projStatusFilter || p.status === projStatusFilter) &&
    (!projSearch || `${p.name} ${p.code}`.toLowerCase().includes(projSearch.toLowerCase()))
  ), [projects, projStatusFilter, projSearch]);

  const filteredShips = useMemo(() => ships.filter(s =>
    (!shipProjFilter || s.projectId === shipProjFilter) &&
    (!shipStatusFilter || s.status === shipStatusFilter)
  ), [ships, shipProjFilter, shipStatusFilter]);

  const filteredUsers = useMemo(() => users.filter(u =>
    (!userRoleFilter || u.role === userRoleFilter) &&
    (userActiveFilter === "" || (userActiveFilter === "1" ? u.isActive === 1 : u.isActive === 0))
  ), [users, userRoleFilter, userActiveFilter]);

  const inspShipChoices = useMemo(() => ships.filter(s => !inspProjFilter || s.projectId === inspProjFilter), [ships, inspProjFilter]);

  const filteredInspections = useMemo(() => {
    if (!inspLoaded) return [];
    return inspectionList.filter(x =>
      (!inspProjFilter || x.projectCode === projects.find(p => p.id === inspProjFilter)?.code) &&
      (!inspShipFilter || `${x.hullNumber}` === ships.find(s => s.id === inspShipFilter)?.hullNumber) &&
      (!inspDiscFilter || x.discipline === inspDiscFilter) &&
      (!inspStatusFilter || x.workflowStatus === inspStatusFilter) &&
      (!inspSearch || x.itemName.toLowerCase().includes(inspSearch.toLowerCase()))
    );
  }, [inspectionList, inspLoaded, inspProjFilter, inspShipFilter, inspDiscFilter, inspStatusFilter, inspSearch, projects, ships]);

  /* ── current page data ── */
  function getRows(): unknown[] {
    switch (activeTable) {
      case "projects": return filteredProjects;
      case "ships": return filteredShips;
      case "disciplines": return []; // Disciplines uses custom rendering
      case "users": return filteredUsers;
      case "obsTypes": return obsTypes;
      case "inspections": return filteredInspections;
      case "observations": return observations;
      default: return [];
    }
  }

  const allRows = getRows();
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const pageRows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── sidebar counts ── */
  function getCount(key: TableKey): number {
    switch (key) {
      case "projects": return filteredProjects.length;
      case "ships": return filteredShips.length;
      case "disciplines": return projects.length; // Show project count for disciplines
      case "users": return filteredUsers.length;
      case "obsTypes": return obsTypes.length;
      case "inspections": return inspLoaded ? filteredInspections.length : 0;
      case "observations": return obsLoaded ? observations.length : 0;
    }
  }

  /* ── open modal ── */
  function openNew() {
    if (activeTable === "inspections") {
      // For inspections, use batch import approach - open a simple form
      setModalData({ projectId: inspProjFilter || projects[0]?.id || "", shipId: "", itemName: "", discipline: "HULL", plannedDate: new Date().toISOString().slice(0, 10), yardQc: "", startAtRound: "1" });

      setModalMode("new");
      return;
    }
    if (activeTable === "observations") {
      setModalData({ shipId: obsShipFilter || "", type: obsTypes[0]?.code || "", discipline: "HULL", authorId: session?.user.id ?? "", date: new Date().toISOString().slice(0, 10), content: "", status: "open" });
      setModalMode("new");
      return;
    }

    const defaults: Record<TableKey, Record<string, string>> = {
      projects: { code: "", name: "", status: "active", owner: "", shipyard: "", class: "", disciplines: "[]", reportRecipients: "", ncrRecipients: "" },
      ships: { projectId: shipProjFilter || projects[0]?.id || "", hullNumber: "", shipName: "", shipType: "", status: "building" },
      users: { username: "", displayName: "", password: "", role: "inspector", disciplines: "[]", accessibleProjectIds: "[]", isActive: "true" },
      obsTypes: { code: "", label: "", sortOrder: "0" },
      inspections: {},
      observations: {},
    };
    setModalData(defaults[activeTable]);
    setModalMode("new");
    setPasswordDraft("");
  }

  function openEdit(row: Record<string, unknown>) {
    if (activeTable === "inspections") {
      // Load full detail and open inspection modal
      const id = row.id as string;
      void loadInspDetail(id);
      return;
    }
    const data: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "isActive" && (v === 1 || v === 0)) data[k] = v === 1 ? "true" : "false";
      else data[k] = v == null ? "" : v;
    }
    setModalData(data);
    setModalMode("edit");
    setPasswordDraft("");
  }

  async function loadInspDetail(id: string) {
    setWorking(true);
    try {
      const d = await fetchInspectionDetail(id);
      setInspectionDetail(d);
      setInspModalTab("item");
      setEditingCommentId("");
      setModalMode("edit");
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to load detail") }); }
    finally { setWorking(false); }
  }

  /* ── save handlers ── */
  async function handleSave() {
    setWorking(true);
    try {
      switch (activeTable) {
        case "projects": await saveProject(); break;
        case "ships": await saveShip(); break;
        case "users": await saveUser(); break;
        case "obsTypes": await saveObsType(); break;
        case "inspections": await saveNewInspection(); break;
        case "observations": await saveObservation(); break;
      }
      setModalMode("closed");
      setToast({ type: "ok", text: "Saved successfully" });
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Save failed") }); }
    finally { setWorking(false); }
  }

  async function saveProject() {
    const d = modalData;
    const discs = Array.isArray(d.disciplines) ? d.disciplines : [];
    const payload = {
      name: d.name, code: d.code, status: d.status as "active" | "archived",
      owner: empty(d.owner ?? "") ?? undefined, shipyard: empty(d.shipyard ?? "") ?? undefined, class: empty(d.class ?? "") ?? undefined,
      disciplines: discs,
      reportRecipients: Array.isArray(d.reportRecipients) ? d.reportRecipients : (d.reportRecipients || "").split(",").map((x: string) => x.trim()).filter(Boolean),
      ncrRecipients: Array.isArray(d.ncrRecipients) ? d.ncrRecipients : (d.ncrRecipients || "").split(",").map((x: string) => x.trim()).filter(Boolean),
    };
    if (modalMode === "edit" && d.id) await updateProject(d.id, payload);
    else await createProject(payload);
    setProjects(await fetchProjects());
  }

  /** Get effective disciplines for a given project (empty = all presets) */
  function getProjectDisciplines(projectId: string): readonly string[] {
    const proj = projects.find(p => p.id === projectId);
    return proj && proj.disciplines && proj.disciplines.length > 0 ? proj.disciplines : DISCIPLINES;
  }

  async function saveShip() {
    const d = modalData;
    if (modalMode === "edit" && d.id) {
      await updateShip(d.id, { 
        projectId: d.projectId,
        hullNumber: d.hullNumber, 
        shipName: d.shipName, 
        shipType: empty(d.shipType ?? "") ?? undefined, 
        status: d.status as "building" | "delivered" 
      });
    } else {
      await createShip({ projectId: d.projectId, hullNumber: d.hullNumber, shipName: d.shipName, shipType: empty(d.shipType ?? "") ?? undefined });
    }
    setShips(await fetchShips());
  }

  async function saveUser() {
    const d = modalData;
    const discs = Array.isArray(d.disciplines) ? (d.disciplines as Discipline[]) : [];
    const projIds = Array.isArray(d.accessibleProjectIds) ? (d.accessibleProjectIds as string[]) : [];
    if (modalMode === "edit" && d.id) {
      await updateUser(d.id, { username: d.username, displayName: d.displayName, role: d.role as Role, disciplines: discs, accessibleProjectIds: projIds, isActive: d.isActive === "true" });
    } else {
      await createUser({ username: d.username, displayName: d.displayName, password: d.password || "changeme", role: d.role as Role, disciplines: discs, accessibleProjectIds: projIds });
    }
    setUsers(await fetchUsers());
  }

  async function saveObsType() {
    const d = modalData;
    if (modalMode === "edit" && d.id) {
      await updateObservationType(d.id, { label: d.label, sortOrder: Number(d.sortOrder || 0) });
    } else {
      await createObservationType({ code: d.code, label: d.label, sortOrder: Number(d.sortOrder || 0) });
    }
    setObsTypes(await fetchObservationTypes());
  }

  async function saveNewInspection() {
    const d = modalData;
    await batchImportInspections({
      projectId: d.projectId,
      shipId: d.shipId,
      items: [{ itemName: d.itemName, discipline: d.discipline, plannedDate: d.plannedDate, yardQc: d.yardQc || "", startAtRound: [1, 2, 3].includes(Number(d.startAtRound)) ? Number(d.startAtRound) : 1 }],

    });
    if (inspLoaded) await doSearchInspections();
  }

  async function saveObservation() {
    const d = modalData;
    if (modalMode === "edit" && d.id) {
      await updateObservation(d.id, { shipId: d.shipId, type: d.type, discipline: d.discipline as Discipline, date: d.date, content: d.content, status: d.status as "open" | "closed", closedBy: empty(d.closedBy ?? ""), closedAt: empty(d.closedAt ?? "") });
    } else {
      await createObservation(d.shipId || obsShipFilter, { type: d.type, discipline: d.discipline, date: d.date, content: d.content });
    }

    if (obsLoaded && obsShipFilter) await doSearchObservations();
  }

  /* ── inspection admin saves ── */
  async function saveInspectionItem() {
    if (!inspectionDetail) return;
    setWorking(true);
    try {
      const d = modalData;
      await updateInspectionItemAdmin(inspectionDetail.id, {
        shipId: d.shipId || undefined,
        itemName: d.itemName,
        discipline: d.discipline as Discipline,
        workflowStatus: d.workflowStatus,
        lastRoundResult: empty(d.lastRoundResult ?? ""),
        resolvedResult: empty(d.resolvedResult ?? ""),
        currentRound: Number(d.currentRound || 1),
        source: d.source as "manual" | "n8n",
      });
      await loadInspDetail(inspectionDetail.id);
      if (inspLoaded) { const data = await fetchInspectionList(); setInspectionList(data.items); }
      setToast({ type: "ok", text: "Item updated" });
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to save item") }); }
    finally { setWorking(false); }
  }

  async function saveInspectionRound() {
    if (!inspectionDetail) return;
    setWorking(true);
    try {
      const d = modalData;
      await updateInspectionCurrentRoundAdmin(inspectionDetail.id, {
        rawItemName: d.roundRawItemName,
        plannedDate: empty(d.roundPlannedDate ?? ""),
        actualDate: empty(d.roundActualDate ?? ""),
        yardQc: empty(d.roundYardQc ?? ""),
        result: empty(d.roundResult ?? ""),
        inspectedBy: empty(d.roundInspectedBy ?? ""),
        notes: empty(d.roundNotes ?? ""),
        source: d.roundSource as "manual" | "n8n",
      });
      await loadInspDetail(inspectionDetail.id);
      if (inspLoaded) { const data = await fetchInspectionList(); setInspectionList(data.items); }
      setToast({ type: "ok", text: "Round updated" });
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to save round") }); }
    finally { setWorking(false); }
  }

  async function handleResolveComment(commentId: string) {
    if (!inspectionDetail || !session?.user.id) return;
    setWorking(true);
    try {
      await resolveInspectionComment(inspectionDetail.id, commentId, { resolvedBy: session.user.id, expectedVersion: inspectionDetail.version });

      await loadInspDetail(inspectionDetail.id);
      if (inspLoaded) { const data = await fetchInspectionList(); setInspectionList(data.items); }
      setToast({ type: "ok", text: "Comment resolved" });
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to resolve") }); }
    finally { setWorking(false); }
  }

  async function handleSaveComment() {
    if (!inspectionDetail || !editingCommentId) return;
    setWorking(true);
    try {
      await updateInspectionCommentAdmin(inspectionDetail.id, editingCommentId, {
        content: commentForm.content,
        status: commentForm.status,
        closedBy: empty(commentForm.closedBy),
        closedAt: empty(commentForm.closedAt),
      });
      await loadInspDetail(inspectionDetail.id);
      setEditingCommentId("");
      setToast({ type: "ok", text: "Comment updated" });
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to save comment") }); }
    finally { setWorking(false); }
  }

  async function handleAddComment() {
    if (!inspectionDetail || !newCommentDraft.trim() || !session?.user.id) return;
    setWorking(true);
    try {
      await createInspectionCommentAdmin(inspectionDetail.id, {
        content: newCommentDraft.trim(),
        authorId: session.user.id
      });

      await loadInspDetail(inspectionDetail.id);
      setNewCommentDraft("");
      setToast({ type: "ok", text: "Comment added" });
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to add comment") }); }
    finally { setWorking(false); }
  }

  async function handleDeleteComment(commentId: string) {
    if (!inspectionDetail) return;
    if (!confirm("Are you sure you want to delete this comment?")) return;
    setWorking(true);
    try {
      await deleteInspectionCommentAdmin(inspectionDetail.id, commentId);
      await loadInspDetail(inspectionDetail.id);
      setToast({ type: "ok", text: "Comment deleted" });
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to delete comment") }); }
    finally { setWorking(false); }
  }

  async function handleDeleteUser(id: string, username: string) {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    setWorking(true);
    try {
      const { deleteUser } = await import("../api");
      await deleteUser(id);
      setUsers(await fetchUsers());
      setToast({ type: "ok", text: "User deleted." });
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to delete user") }); }
    finally { setWorking(false); }
  }

  async function handleCloseObs(id: string) {
    if (!session?.user.id) return;
    setWorking(true);
    try {
      await closeObservation(id);

      if (obsLoaded && obsShipFilter) await doSearchObservations();
      setToast({ type: "ok", text: "Observation closed" });
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to close") }); }
    finally { setWorking(false); }
  }

  async function handleResetPassword() {
    if (!modalData.id || !passwordDraft) return;
    setWorking(true);
    try {
      await updateUserPassword(modalData.id, passwordDraft);
      setPasswordDraft("");
      setToast({ type: "ok", text: "Password updated" });
    } catch (e) { setToast({ type: "err", text: errMsg(e, "Failed to reset password") }); }
    finally { setWorking(false); }
  }

  /* ── populate modal data when opening inspection detail ── */
  useEffect(() => {
    if (!inspectionDetail || modalMode === "closed") return;
    if (activeTable !== "inspections") return;
    const d = inspectionDetail;
    const shipMatch = ships.find(s => s.hullNumber === d.hullNumber && s.shipName === d.shipName);
    const currentRound = d.roundHistory.find(r => r.roundNumber === d.currentRound);
    setModalData({
      id: d.id,
      shipId: shipMatch?.id || "",
      itemName: d.itemName,
      discipline: d.discipline,
      workflowStatus: d.workflowStatus,
      lastRoundResult: d.lastRoundResult || "",
      resolvedResult: d.resolvedResult || "",
      currentRound: String(d.currentRound),
      source: d.source,
      roundRawItemName: d.itemName,
      roundPlannedDate: d.plannedDate || "",
      roundActualDate: d.actualDate || "",
      roundYardQc: d.yardQc || "",
      roundResult: d.lastRoundResult || "",
      roundInspectedBy: currentRound?.submittedBy || "",
      roundNotes: currentRound?.notes || "",
      roundSource: d.source,
    });
  }, [inspectionDetail]);

  /* ── field updater ── */
  function setField(key: string, val: string) {
    setModalData(prev => ({ ...prev, [key]: val }));
  }

  /* ── toggle for JSON arrays (disciplines, project ids) ── */
  function toggleJsonArray(key: string, val: string) {
    setModalData(prev => {
      const arr = Array.isArray(prev[key]) ? prev[key] : [];
      const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
      return { ...prev, [key]: next };
    });
  }

  /* ── toggle project expansion in disciplines view ── */
  function toggleProjectExpansion(projectId: string) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  /* ── render disciplines custom view ── */
  function renderDisciplinesView(): React.ReactNode {
    return (
      <div style={{ padding: '0 16px' }}>
        {projects.map(project => {
          const isExpanded = expandedProjects.has(project.id);
          const projectDisciplines = project.disciplines && project.disciplines.length > 0 ? project.disciplines : DISCIPLINES;
          
          return (
            <div key={project.id} style={{ marginBottom: 12, border: '1px solid var(--nb-border)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Project Header Button */}
              <button
                onClick={() => toggleProjectExpansion(project.id)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: isExpanded ? '#f1f5f9' : '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#1e293b',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.05em' }}>{project.code}</span>
                  <span>{project.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {projectDisciplines.length} {projectDisciplines.length === DISCIPLINES.length ? 'disciplines (all)' : 'disciplines'}
                  </span>
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ background: '#fafafa', borderTop: '1px solid var(--nb-border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#475569', letterSpacing: '0.05em', width: '25%' }}>DISCIPLINE</th>
                        <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#475569', letterSpacing: '0.05em', width: '15%' }}>ASSIGNED USERS</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#475569', letterSpacing: '0.05em', width: '60%' }}>USER NAMES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DISCIPLINES.map(discipline => {
                        const isSelected = projectDisciplines.includes(discipline);
                        const usersInDiscipline = users.filter(u => 
                          u.disciplines.includes(discipline as Discipline) &&
                          (u.accessibleProjectIds.length === 0 || u.accessibleProjectIds.includes(project.id))
                        );
                        
                        return (
                          <tr 
                            key={discipline}
                            style={{ 
                              background: isSelected ? '#dbeafe' : '#fff',
                              borderBottom: '1px solid #e2e8f0'
                            }}
                          >
                            <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: isSelected ? 600 : 400, color: isSelected ? '#1e40af' : '#64748b' }}>
                              {isSelected && <span style={{ marginRight: 6 }}>✓</span>}
                              {discipline}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#475569' }}>
                              {usersInDiscipline.length}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: 11, color: '#475569' }}>
                              {usersInDiscipline.length === 0 ? (
                                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No users assigned</span>
                              ) : (
                                usersInDiscipline.map(u => u.displayName || u.username).join(', ')
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  /* ───────── RENDER ───────── */

  return (
    <div className="admin-layout">
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">ADMIN CONSOLE</div>

        <div className="admin-sidebar-group">
          <div className="admin-sidebar-group-label">Base Data</div>
          {SIDEBAR_ITEMS.filter(i => i.group === "base").map(i => (
            <div key={i.key} className={`admin-sidebar-item${activeTable === i.key ? " active" : ""}`} onClick={() => switchTable(i.key)}>
              {i.label}
              <span className="admin-sidebar-badge">{getCount(i.key)}</span>
            </div>
          ))}
        </div>

        <div className="admin-sidebar-divider" />

        <div className="admin-sidebar-group">
          <div className="admin-sidebar-group-label">Business Data</div>
          {SIDEBAR_ITEMS.filter(i => i.group === "data").map(i => (
            <div key={i.key} className={`admin-sidebar-item${activeTable === i.key ? " active" : ""}`} onClick={() => switchTable(i.key)}>
              {i.label}
              <span className="admin-sidebar-badge">{getCount(i.key)}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--nb-border)" }}>
          <button className="admin-btn" style={{ width: "100%" }} onClick={() => void loadBase()}>↻ Refresh All</button>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="admin-content">
        {/* Toast */}
        {toast && <div className={`alert ${toast.type === "ok" ? "success" : "error"}`} style={{ marginBottom: 10 }}>{toast.text}</div>}

        {/* Header */}
        <div className="admin-content-header">
          <h2>{SIDEBAR_ITEMS.find(i => i.key === activeTable)?.label ?? activeTable}</h2>
          <div className="admin-content-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {activeTable !== "disciplines" && <button className="admin-btn primary" onClick={openNew}>+ New</button>}
            <button className="admin-btn primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => window.location.href = '/admin/sql'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
              SQL Console
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        {renderFilterBar()}

        {/* Disciplines Info Banner */}
        {activeTable === "disciplines" && (
          <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 16, fontSize: 11, color: '#1e40af' }}>
            <strong>ℹ️ Disciplines Overview:</strong> Click on any project to expand and view discipline assignments. 
            Blue-highlighted disciplines are enabled for that project. User assignments are filtered by project access.
          </div>
        )}

        {/* Table or Empty Prompt */}
        {activeTable === "disciplines" ? (
          renderDisciplinesView()
        ) : LAZY_TABLES.includes(activeTable) && !isLazyLoaded() ? (
          <div className="admin-empty-prompt">
            {activeTable === "inspections" ? "Set filter conditions and click Search to load inspections." : "Select a ship and click Search to load observations."}
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table>
                <thead><tr>{renderTableHeaders()}</tr></thead>
                <tbody>{pageRows.map((row, idx) => <tr key={idx} onClick={() => openEdit(row as Record<string, unknown>)}>{renderTableRow(row)}</tr>)}</tbody>
              </table>
              {allRows.length === 0 && <div className="admin-empty-prompt" style={{ minHeight: 120, border: "none" }}>No data</div>}
            </div>

            {/* Pagination */}
            {allRows.length > PAGE_SIZE && (
              <div className="admin-pagination">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>◀ Prev</button>
                <span>Page {page} of {totalPages} ({allRows.length} rows)</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next ▶</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal ── */}
      {modalMode !== "closed" && (
        <div className="modalOverlay" onClick={(e) => { if (e.target === e.currentTarget) setModalMode("closed"); }}>
          <div className="modalDialog" style={{ maxWidth: activeTable === "inspections" && modalMode === "edit" ? 840 : 500, maxHeight: "85vh", overflow: "auto" }}>
            {renderModalContent()}
          </div>
        </div>
      )}
    </div>
  );

  /* ── helper ── */
  function isLazyLoaded(): boolean {
    if (activeTable === "inspections") return inspLoaded;
    if (activeTable === "observations") return obsLoaded;
    return true;
  }

  /* ───────── FILTER BAR RENDER ───────── */
  function renderFilterBar() {
    switch (activeTable) {
      case "projects": return (
        <div className="admin-filter-bar">
          <select value={projStatusFilter} onChange={e => { setProjStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Status</option><option value="active">Active</option><option value="archived">Archived</option>
          </select>
          <input type="text" placeholder="Search name / code…" value={projSearch} onChange={e => { setProjSearch(e.target.value); setPage(1); }} />
        </div>
      );

      case "ships": return (
        <div className="admin-filter-bar">
          <select value={shipProjFilter} onChange={e => { setShipProjFilter(e.target.value); setPage(1); }}>
            <option value="">All Projects</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          <select value={shipStatusFilter} onChange={e => { setShipStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Status</option><option value="building">Building</option><option value="delivered">Delivered</option>
          </select>
        </div>
      );

      case "users": return (
        <div className="admin-filter-bar">
          <select value={userRoleFilter} onChange={e => { setUserRoleFilter(e.target.value); setPage(1); }}>
            <option value="">All Roles</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={userActiveFilter} onChange={e => { setUserActiveFilter(e.target.value); setPage(1); }}>
            <option value="">All Status</option><option value="1">Active</option><option value="0">Inactive</option>
          </select>
        </div>
      );

      case "obsTypes": return null;

      case "inspections": return (
        <div className="admin-filter-bar">
          <select value={inspProjFilter} onChange={e => { setInspProjFilter(e.target.value); setInspShipFilter(""); }}>
            <option value="">All Projects</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
          </select>
          <select value={inspShipFilter} onChange={e => setInspShipFilter(e.target.value)}>
            <option value="">All Ships</option>{inspShipChoices.map(s => <option key={s.id} value={s.id}>{s.hullNumber} / {s.shipName}</option>)}
          </select>
          <select value={inspDiscFilter} onChange={e => setInspDiscFilter(e.target.value)}>
            <option value="">All Disciplines</option>{(inspProjFilter ? getProjectDisciplines(inspProjFilter) : DISCIPLINES).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={inspStatusFilter} onChange={e => setInspStatusFilter(e.target.value)}>
            <option value="">All Status</option>{WORKFLOW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="text" placeholder="Search item name…" value={inspSearch} onChange={e => setInspSearch(e.target.value)} style={{ minWidth: 140 }} />
          <button className="admin-btn primary" onClick={() => void doSearchInspections()} disabled={working}>🔍 Search</button>
        </div>
      );

      case "observations": return (
        <div className="admin-filter-bar">
          <select value={obsShipFilter} onChange={e => setObsShipFilter(e.target.value)}>
            <option value="">Select Ship…</option>{ships.map(s => <option key={s.id} value={s.id}>{s.hullNumber} / {s.shipName}</option>)}
          </select>
          <select value={obsTypeFilter} onChange={e => setObsTypeFilter(e.target.value)}>
            <option value="">All Types</option>{obsTypes.map(t => <option key={t.id} value={t.code}>{t.code}</option>)}
          </select>
          <select value={obsDiscFilter} onChange={e => setObsDiscFilter(e.target.value)}>
            <option value="">All Disciplines</option>{(() => { const s = ships.find(sh => sh.id === obsShipFilter); return s ? getProjectDisciplines(s.projectId) : DISCIPLINES; })().map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={obsStatusFilter} onChange={e => setObsStatusFilter(e.target.value)}>
            <option value="">All Status</option><option value="open">Open</option><option value="closed">Closed</option>
          </select>
          <input type="date" value={obsDateFrom} onChange={e => setObsDateFrom(e.target.value)} />
          <input type="date" value={obsDateTo} onChange={e => setObsDateTo(e.target.value)} />
          <button className="admin-btn primary" onClick={() => void doSearchObservations()} disabled={working}>🔍 Search</button>
        </div>
      );
    }
  }

  /* ───────── TABLE HEADERS ───────── */
  function renderTableHeaders(): React.ReactNode {
    const hdrs: Record<TableKey, string[]> = {
      projects: ["Code", "Name", "Status", "Disciplines", "Owner", "Shipyard", "Class"],
      ships: ["Hull", "Ship Name", "Project", "Type", "Status"],
      disciplines: ["Discipline", "Projects Using", "Assigned Users", "User Names"],
      users: ["Username", "Display Name", "Role", "Disciplines", "Projects", "Active"],
      obsTypes: ["Code", "Label", "Sort Order"],
      inspections: ["Item", "Ship", "Discipline", "Round", "Result", "Status", "Comments"],
      observations: ["Type", "Discipline", "Date", "Author", "Status", "Content"],
    };
    return <>{(hdrs[activeTable] || []).map(h => <th key={h}>{h}</th>)}<th>Actions</th></>;
  }

  /* ───────── TABLE ROW ───────── */
  function renderTableRow(raw: unknown): React.ReactNode {
    const row = raw as Record<string, unknown>;

    const actionsCell = (id: string) => (
      <td onClick={e => e.stopPropagation()}>
        <div className="actions-cell">
          <button onClick={() => openEdit(row)} title="Edit">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button className="del" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    );

    switch (activeTable) {
      case "projects": {
        const p = raw as ProjectRecord;
        return <><td>{p.code}</td><td>{p.name}</td><td>{p.status}</td><td>{p.disciplines && p.disciplines.length > 0 ? p.disciplines.join(", ") : <span style={{ color: "var(--nb-text-muted)", fontStyle: "italic" }}>ALL</span>}</td><td>{p.owner ?? "—"}</td><td>{p.shipyard ?? "—"}</td><td>{p.class ?? "—"}</td>{actionsCell(p.id)}</>;
      }
      case "ships": {
        const s = raw as ShipRecord;
        const proj = projects.find(p => p.id === s.projectId);
        return <><td>{s.hullNumber}</td><td>{s.shipName}</td><td>{proj?.code ?? s.projectId}</td><td>{s.shipType ?? "—"}</td><td>{s.status}</td>{actionsCell(s.id)}</>;
      }
      case "users": {
        const u = raw as UserRecord;
        return <><td>{u.username}</td><td>{u.displayName}</td><td>{u.role}</td><td>{u.disciplines.join(", ") || "—"}</td><td>{u.accessibleProjectIds.map(id => projects.find(p => p.id === id)?.code ?? id).join(", ") || "—"}</td><td>{u.isActive ? "✔" : "✗"}</td>
          <td onClick={e => e.stopPropagation()}>
            <div className="actions-cell">
              <button onClick={() => openEdit(row)} title="Edit"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
              <button className="del" title="Delete" onClick={() => void handleDeleteUser(u.id, u.username)}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
          </td>
        </>;
      }
      case "obsTypes": {
        const o = raw as ObservationType;
        return <><td>{o.code}</td><td>{o.label}</td><td>{o.sortOrder}</td>{actionsCell(o.id)}</>;
      }
      case "inspections": {
        const i = raw as InspectionListItem;
        return <><td>{i.itemName}</td><td>{i.hullNumber} / {i.shipName}</td><td>{i.discipline}</td><td>{i.currentRound}</td><td><span className={`resultBadge result-${(i.currentResult || "pending").toLowerCase()}`}>{i.currentResult || "—"}</span></td><td>{i.workflowStatus}</td><td>{i.openComments}</td>{actionsCell(i.id)}</>;
      }
      case "observations": {
        const o = raw as ObservationItem;
        return <><td>{o.type}</td><td>{o.discipline}</td><td>{o.date}</td><td>{o.authorName ?? o.authorId}</td><td><span className={`commentStatus ${o.status}`}>{o.status}</span></td><td>{o.content}</td>
          <td onClick={e => e.stopPropagation()}>
            <div className="actions-cell">
              <button onClick={() => openEdit(row)} title="Edit"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
              {o.status === "open" && <button onClick={() => void handleCloseObs(o.id)}>✔ Close</button>}
              <button className="del" title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
          </td>
        </>;
      }
      default: return null;
    }
  }

  /* ───────── MODAL CONTENT ───────── */
  function renderModalContent(): React.ReactNode {
    // Special: Inspection detail editor
    if (activeTable === "inspections" && modalMode === "edit" && inspectionDetail) {
      return renderInspectionModal();
    }

    const title = modalMode === "new" ? `New ${SIDEBAR_ITEMS.find(i => i.key === activeTable)?.label ?? ""}` : `Edit ${SIDEBAR_ITEMS.find(i => i.key === activeTable)?.label ?? ""}`;

    return (
      <>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800 }}>{title}</h3>
        {renderModalFields()}
        <div className="admin-modal-footer">
          <button className="admin-btn" onClick={() => setModalMode("closed")}>Cancel</button>
          <button className="admin-btn primary" onClick={() => void handleSave()} disabled={working}>{working ? "Saving…" : "Save"}</button>
        </div>
      </>
    );
  }

  function renderModalFields(): React.ReactNode {
    switch (activeTable) {
      case "projects": {
        const projDiscs = Array.isArray(modalData.disciplines) ? modalData.disciplines : [];
        return (
          <div className="admin-form-grid">
            <div className="admin-field"><label>Code</label><input value={modalData.code || ""} onChange={e => setField("code", e.target.value)} disabled={modalMode === "edit"} /></div>
            <div className="admin-field"><label>Name</label><input value={modalData.name || ""} onChange={e => setField("name", e.target.value)} /></div>
            <div className="admin-field"><label>Status</label><select value={modalData.status || "active"} onChange={e => setField("status", e.target.value)}><option value="active">active</option><option value="archived">archived</option></select></div>
            <div className="admin-field"><label>Owner</label><input value={modalData.owner || ""} onChange={e => setField("owner", e.target.value)} /></div>
            <div className="admin-field"><label>Shipyard</label><input value={modalData.shipyard || ""} onChange={e => setField("shipyard", e.target.value)} /></div>
            <div className="admin-field"><label>Class</label><input value={modalData.class || ""} onChange={e => setField("class", e.target.value)} /></div>
            <div className="admin-field" style={{ gridColumn: "1 / -1" }}>
              <label>Disciplines <span style={{ fontSize: 10, color: 'var(--nb-text-muted)', fontWeight: 500 }}>(empty = all presets)</span></label>
              <div className="admin-pills">{DISCIPLINES.map(d => <button key={d} type="button" className={`admin-pill-btn${projDiscs.includes(d) ? " selected" : ""}`} onClick={() => toggleJsonArray("disciplines", d)}>{d}</button>)}</div>
            </div>
            <div className="admin-field" style={{ gridColumn: "1 / -1" }}><label>Report Recipients (comma-separated)</label><textarea value={Array.isArray(modalData.reportRecipients) ? modalData.reportRecipients.join(", ") : (modalData.reportRecipients || "")} onChange={e => setField("reportRecipients", e.target.value)} /></div>
            <div className="admin-field" style={{ gridColumn: "1 / -1" }}><label>NCR Recipients (comma-separated)</label><textarea value={Array.isArray(modalData.ncrRecipients) ? modalData.ncrRecipients.join(", ") : (modalData.ncrRecipients || "")} onChange={e => setField("ncrRecipients", e.target.value)} /></div>
          </div>
        );
      }

      case "ships": {
        const shipChoices = shipProjFilter ? ships.filter(s => s.projectId === shipProjFilter) : ships;
        return (
          <div className="admin-form-grid">
            <div className="admin-field"><label>Project</label><select value={modalData.projectId || ""} onChange={e => setField("projectId", e.target.value)}><option value="">Select…</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></div>
            <div className="admin-field"><label>Hull Number</label><input value={modalData.hullNumber || ""} onChange={e => setField("hullNumber", e.target.value)} /></div>
            <div className="admin-field"><label>Ship Name</label><input value={modalData.shipName || ""} onChange={e => setField("shipName", e.target.value)} /></div>
            <div className="admin-field"><label>Ship Type</label><input value={modalData.shipType || ""} onChange={e => setField("shipType", e.target.value)} /></div>
            <div className="admin-field"><label>Status</label><select value={modalData.status || "building"} onChange={e => setField("status", e.target.value)}><option value="building">building</option><option value="delivered">delivered</option></select></div>
          </div>
        );
      }

      case "users": {
        const discs = Array.isArray(modalData.disciplines) ? modalData.disciplines : [];
        const projIds = Array.isArray(modalData.accessibleProjectIds) ? modalData.accessibleProjectIds : [];
        return (
          <div className="admin-form-grid">
            <div className="admin-field"><label>Username</label><input value={modalData.username || ""} onChange={e => setField("username", e.target.value)} /></div>
            <div className="admin-field"><label>Display Name</label><input value={modalData.displayName || ""} onChange={e => setField("displayName", e.target.value)} /></div>
            <div className="admin-field"><label>Role</label><select value={modalData.role || "inspector"} onChange={e => setField("role", e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
            <div className="admin-field"><label>Active</label><select value={modalData.isActive ?? "true"} onChange={e => setField("isActive", e.target.value)}><option value="true">Active</option><option value="false">Inactive</option></select></div>
            {modalMode === "new" && <div className="admin-field"><label>Password</label><input type="password" value={modalData.password || ""} onChange={e => setField("password", e.target.value)} /></div>}
            <div className="admin-field" style={{ gridColumn: "1 / -1" }}>
              <label>Disciplines</label>
              <div className="admin-pills">{DISCIPLINES.map(d => <button key={d} type="button" className={`admin-pill-btn${discs.includes(d) ? " selected" : ""}`} onClick={() => toggleJsonArray("disciplines", d)}>{d}</button>)}</div>
            </div>
            <div className="admin-field" style={{ gridColumn: "1 / -1" }}>
              <label>Accessible Projects</label>
              <div className="admin-pills">{projects.map(p => <button key={p.id} type="button" className={`admin-pill-btn${projIds.includes(p.id) ? " selected" : ""}`} onClick={() => toggleJsonArray("accessibleProjectIds", p.id)}>{p.code}</button>)}</div>
            </div>
            {modalMode === "edit" && (
              <div className="admin-field" style={{ gridColumn: "1 / -1", paddingTop: 8, borderTop: "1px solid var(--nb-border)" }}>
                <label>Reset Password</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="password" placeholder="Enter new password…" value={passwordDraft} onChange={e => setPasswordDraft(e.target.value)} style={{ flex: 1 }} />
                  <button className="admin-btn" onClick={() => void handleResetPassword()} disabled={!passwordDraft || working}>Update</button>
                </div>
              </div>
            )}
          </div>
        );
      }

      case "obsTypes": return (
        <div className="admin-form-grid">
          <div className="admin-field"><label>Code</label><input value={modalData.code || ""} onChange={e => setField("code", e.target.value)} disabled={modalMode === "edit"} /></div>
          <div className="admin-field"><label>Label</label><input value={modalData.label || ""} onChange={e => setField("label", e.target.value)} /></div>
          <div className="admin-field"><label>Sort Order</label><input type="number" value={modalData.sortOrder || "0"} onChange={e => setField("sortOrder", e.target.value)} /></div>
        </div>
      );

      case "inspections": return (
        <div className="admin-form-grid">
          <div className="admin-field"><label>Project</label><select value={modalData.projectId || ""} onChange={e => { setField("projectId", e.target.value); setField("shipId", ""); }}><option value="">Select…</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}</select></div>
          <div className="admin-field"><label>Ship</label><select value={modalData.shipId || ""} onChange={e => setField("shipId", e.target.value)}><option value="">Select…</option>{ships.filter(s => !modalData.projectId || s.projectId === modalData.projectId).map(s => <option key={s.id} value={s.id}>{s.hullNumber} / {s.shipName}</option>)}</select></div>
          <div className="admin-field"><label>Item Name</label><input value={modalData.itemName || ""} onChange={e => setField("itemName", e.target.value)} /></div>
          <div className="admin-field"><label>Discipline</label><select value={modalData.discipline || "HULL"} onChange={e => setField("discipline", e.target.value)}>{(modalData.projectId ? getProjectDisciplines(modalData.projectId) : DISCIPLINES).map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          <div className="admin-field"><label>Planned Date</label><input type="date" value={modalData.plannedDate || ""} onChange={e => setField("plannedDate", e.target.value)} /></div>
          <div className="admin-field"><label>Yard QC</label><input value={modalData.yardQc || ""} onChange={e => setField("yardQc", e.target.value)} /></div>
          <div className="admin-field"><label>Start Round</label><select value={modalData.startAtRound || "1"} onChange={e => setField("startAtRound", e.target.value)}><option value="1">1 / R1</option><option value="2">2 / R2</option><option value="3">3 / R3</option></select></div>

        </div>
      );

      case "observations": return (
        <div className="admin-form-grid">
          <div className="admin-field"><label>Ship</label><select value={modalData.shipId || ""} onChange={e => setField("shipId", e.target.value)}><option value="">Select…</option>{ships.map(s => <option key={s.id} value={s.id}>{s.hullNumber} / {s.shipName}</option>)}</select></div>
          <div className="admin-field"><label>Type</label><select value={modalData.type || ""} onChange={e => setField("type", e.target.value)}><option value="">Select…</option>{obsTypes.map(t => <option key={t.id} value={t.code}>{t.code}</option>)}</select></div>
          <div className="admin-field"><label>Discipline</label><select value={modalData.discipline || "HULL"} onChange={e => setField("discipline", e.target.value)}>{(() => { const s = ships.find(sh => sh.id === (modalData.shipId || obsShipFilter)); return s ? getProjectDisciplines(s.projectId) : DISCIPLINES; })().map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          <div className="admin-field"><label>Author Id</label><input value={modalData.authorId || ""} onChange={e => setField("authorId", e.target.value)} /></div>
          <div className="admin-field"><label>Date</label><input type="date" value={modalData.date || ""} onChange={e => setField("date", e.target.value)} /></div>
          <div className="admin-field"><label>Status</label><select value={modalData.status || "open"} onChange={e => setField("status", e.target.value)}><option value="open">open</option><option value="closed">closed</option></select></div>
          <div className="admin-field" style={{ gridColumn: "1 / -1" }}><label>Content</label><textarea value={modalData.content || ""} onChange={e => setField("content", e.target.value)} /></div>
        </div>
      );

      default: return null;
    }
  }

  /* ───────── INSPECTION DETAIL MODAL ───────── */
  function renderInspectionModal(): React.ReactNode {
    if (!inspectionDetail) return null;
    const d = inspectionDetail;
    return (
      <>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 800 }}>
          Inspection Detail
          <span className={`resultBadge result-${(d.lastRoundResult || "pending").toLowerCase()}`} style={{ marginLeft: 8 }}>{d.workflowStatus}</span>
        </h3>
        <p style={{ margin: "0 0 10px", fontSize: 10, color: "var(--nb-text-muted)" }}>
          {d.projectCode} / {d.hullNumber} / {d.itemName} — Round {d.currentRound}
        </p>

        <div className="admin-modal-tabs">
          <button className={`admin-modal-tab${inspModalTab === "item" ? " active" : ""}`} onClick={() => setInspModalTab("item")}>Item Info</button>
          <button className={`admin-modal-tab${inspModalTab === "round" ? " active" : ""}`} onClick={() => setInspModalTab("round")}>Current Round</button>
          <button className={`admin-modal-tab${inspModalTab === "comments" ? " active" : ""}`} onClick={() => setInspModalTab("comments")}>Comments ({d.comments.length})</button>
        </div>

        {inspModalTab === "item" && (
          <>
            <div className="admin-form-grid">
              <div className="admin-field"><label>Ship</label><select value={modalData.shipId || ""} onChange={e => setField("shipId", e.target.value)}><option value="">Select…</option>{ships.map(s => <option key={s.id} value={s.id}>{s.hullNumber} / {s.shipName}</option>)}</select></div>
              <div className="admin-field"><label>Item Name</label><input value={modalData.itemName || ""} onChange={e => setField("itemName", e.target.value)} /></div>
              <div className="admin-field"><label>Discipline</label><select value={modalData.discipline || ""} onChange={e => setField("discipline", e.target.value)}>{(() => { const s = ships.find(sh => sh.id === modalData.shipId); return s ? getProjectDisciplines(s.projectId) : DISCIPLINES; })().map(x => <option key={x} value={x}>{x}</option>)}</select></div>
              <div className="admin-field"><label>Workflow Status</label><select value={modalData.workflowStatus || ""} onChange={e => setField("workflowStatus", e.target.value)}>{WORKFLOW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div className="admin-field"><label>Last Round Result</label><select value={modalData.lastRoundResult || ""} onChange={e => setField("lastRoundResult", e.target.value)}><option value="">—</option>{INSPECTION_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              <div className="admin-field"><label>Resolved Result</label><select value={modalData.resolvedResult || ""} onChange={e => setField("resolvedResult", e.target.value)}><option value="">—</option>{INSPECTION_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              <div className="admin-field"><label>Current Round</label><input type="number" value={modalData.currentRound || "1"} onChange={e => setField("currentRound", e.target.value)} /></div>
              <div className="admin-field"><label>Source</label><select value={modalData.source || "manual"} onChange={e => setField("source", e.target.value)}><option value="manual">manual</option><option value="n8n">n8n</option></select></div>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn" onClick={() => setModalMode("closed")}>Cancel</button>
              <button className="admin-btn primary" onClick={() => void saveInspectionItem()} disabled={working}>{working ? "Saving…" : "Save Item"}</button>
            </div>
          </>
        )}

        {inspModalTab === "round" && (
          <>
            <div className="admin-form-grid">
              <div className="admin-field"><label>Raw Item Name</label><input value={modalData.roundRawItemName || ""} onChange={e => setField("roundRawItemName", e.target.value)} /></div>
              <div className="admin-field"><label>Planned Date</label><input type="date" value={modalData.roundPlannedDate || ""} onChange={e => setField("roundPlannedDate", e.target.value)} /></div>
              <div className="admin-field"><label>Actual Date</label><input type="date" value={modalData.roundActualDate || ""} onChange={e => setField("roundActualDate", e.target.value)} /></div>
              <div className="admin-field"><label>Yard QC</label><input value={modalData.roundYardQc || ""} onChange={e => setField("roundYardQc", e.target.value)} /></div>
              <div className="admin-field"><label>Result</label><select value={modalData.roundResult || ""} onChange={e => setField("roundResult", e.target.value)}><option value="">—</option>{INSPECTION_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              <div className="admin-field"><label>Inspected By</label><input value={modalData.roundInspectedBy || ""} onChange={e => setField("roundInspectedBy", e.target.value)} /></div>
              <div className="admin-field"><label>Source</label><select value={modalData.roundSource || "manual"} onChange={e => setField("roundSource", e.target.value)}><option value="manual">manual</option><option value="n8n">n8n</option></select></div>
            </div>
            <div className="admin-field" style={{ marginTop: 8 }}><label>Notes</label><textarea value={modalData.roundNotes || ""} onChange={e => setField("roundNotes", e.target.value)} /></div>
            <div className="admin-modal-footer">
              <button className="admin-btn" onClick={() => setModalMode("closed")}>Cancel</button>
              <button className="admin-btn primary" onClick={() => void saveInspectionRound()} disabled={working}>{working ? "Saving…" : "Save Round"}</button>
            </div>
          </>
        )}

        {inspModalTab === "comments" && (
          <>
            {d.comments.length === 0 && <div className="admin-empty-prompt" style={{ minHeight: 80, border: "none" }}>No comments</div>}
            
            <div style={{ marginBottom: 16, padding: "10px", background: "#f8fafc", borderRadius: 8, border: "1px dashed var(--nb-border)" }}>
              <div className="admin-field"><label>Add New Comment</label><textarea placeholder="Type a new comment here..." value={newCommentDraft} onChange={e => setNewCommentDraft(e.target.value)} style={{ minHeight: 60 }} /></div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button className="admin-btn primary" onClick={() => void handleAddComment()} disabled={working || !newCommentDraft.trim()}>+ Add Comment</button>
              </div>
            </div>

            {d.comments.map(c => (
              <div key={c.id} className="admin-comment-card">
                <div className="admin-comment-header">
                  <strong>#{c.localId} / Round {c.roundNumber}</strong>
                  <span className={`commentStatus ${c.status}`}>{c.status}</span>
                </div>

                {editingCommentId === c.id ? (
                  <div style={{ marginTop: 6 }}>
                    <div className="admin-field"><label>Content</label><textarea value={commentForm.content} onChange={e => setCommentForm({ ...commentForm, content: e.target.value })} /></div>
                    <div className="admin-form-grid" style={{ marginTop: 6 }}>
                      <div className="admin-field"><label>Status</label><select value={commentForm.status} onChange={e => setCommentForm({ ...commentForm, status: e.target.value as "open" | "closed" })}><option value="open">open</option><option value="closed">closed</option></select></div>
                      <div className="admin-field"><label>Closed By</label><input value={commentForm.closedBy} onChange={e => setCommentForm({ ...commentForm, closedBy: e.target.value })} /></div>
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      <button className="admin-btn primary" onClick={() => void handleSaveComment()} disabled={working}>Save</button>
                      <button className="admin-btn" onClick={() => setEditingCommentId("")}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="admin-comment-body">{c.message}</p>
                    <div className="admin-comment-actions">
                      <button className="admin-btn" onClick={() => { setEditingCommentId(c.id); setCommentForm({ content: c.message, status: c.status, closedBy: c.resolvedBy ?? "", closedAt: c.resolvedAt ?? "" }); }}><svg style={{marginRight:4}} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button>
                      {c.status === "open" && <button className="admin-btn" onClick={() => void handleResolveComment(c.id)} disabled={working}>✔ Resolve</button>}
                      <button className="admin-btn danger" onClick={() => void handleDeleteComment(c.id)} disabled={working}><svg style={{marginRight:4}} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}

            <div className="admin-modal-footer">
              <button className="admin-btn" onClick={() => setModalMode("closed")}>Close</button>
            </div>
          </>
        )}
      </>
    );
  }
}
