
import React, { useEffect, useMemo, useState } from "react";
import {
  batchImportInspections,
  closeObservation,
  createObservation,
  createObservationType,
  createProject,
  createShip,
  createUser,
  fetchApiMeta,
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
  type ApiMeta,
  type InspectionListItem,
  type ProjectRecord,
  type ShipRecord,
  type UserRecord
} from "../api";
import { DISCIPLINES, INSPECTION_RESULTS, ROLES, type Discipline, type InspectionItemDetailResponse, type ObservationItem, type ObservationType, type Role } from "@nbins/shared";

type TabKey = "projects" | "ships" | "users" | "observationTypes" | "observations" | "inspections";
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "projects", label: "Projects" },
  { key: "ships", label: "Ships" },
  { key: "users", label: "Users" },
  { key: "observationTypes", label: "Observation Types" },
  { key: "observations", label: "Observations" },
  { key: "inspections", label: "Inspections" }
];

const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--nb-border)", borderRadius: 8, padding: "6px 10px", font: "inherit" };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 };
const panelGrid: React.CSSProperties = { display: "grid", gap: 12 };

function msg(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

function empty(v: string) {
  const x = v.trim();
  return x ? x : null;
}

function Field(props: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{props.label}</span>{props.children}</label>;
}

function Editor(props: { title: string; children: React.ReactNode }) {
  return <section className="panel"><div className="panelHeader"><h3>{props.title}</h3></div><div style={{ marginTop: 10, padding: 12, border: "1px solid var(--nb-border)", borderRadius: 10, background: "#f8fafc" }}>{props.children}</div></section>;
}

function InfoCard(props: { label: string; value: string }) {
  return <div className="infoCard"><span>{props.label}</span><strong>{props.value}</strong></div>;
}


export function Admin() {
  const [activeTab, setActiveTab] = useState<TabKey>("projects");
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [ships, setShips] = useState<ShipRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [obsTypes, setObsTypes] = useState<ObservationType[]>([]);
  const [observations, setObservations] = useState<ObservationItem[]>([]);
  const [inspectionList, setInspectionList] = useState<InspectionListItem[]>([]);
  const [inspectionDetail, setInspectionDetail] = useState<InspectionItemDetailResponse | null>(null);

  const [shipProjectFilter, setShipProjectFilter] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userActiveFilter, setUserActiveFilter] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedObsShipId, setSelectedObsShipId] = useState("");
  const [selectedObservationId, setSelectedObservationId] = useState("");
  const [selectedInspectionId, setSelectedInspectionId] = useState("");
  const [selectedCommentId, setSelectedCommentId] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [resolveBy, setResolveBy] = useState("sys-user");
  const [obsTypeFilter, setObsTypeFilter] = useState("");
  const [obsDisciplineFilter, setObsDisciplineFilter] = useState("");
  const [obsStatusFilter, setObsStatusFilter] = useState("");
  const [obsDateFrom, setObsDateFrom] = useState("");
  const [obsDateTo, setObsDateTo] = useState("");
  const [inspectionDisciplineFilter, setInspectionDisciplineFilter] = useState("");
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState("");
  const [inspectionQuery, setInspectionQuery] = useState("");

  const [projectForm, setProjectForm] = useState({ id: "", code: "", name: "", status: "active" as ProjectRecord["status"], owner: "", shipyard: "", class: "", recipients: "" });
  const [shipForm, setShipForm] = useState({ id: "", projectId: "", hullNumber: "", shipName: "", shipType: "", status: "building" as ShipRecord["status"] });
  const [userForm, setUserForm] = useState({ id: "", username: "", displayName: "", role: "inspector" as Role, disciplines: [] as string[], accessibleProjectIds: [] as string[], isActive: true, password: "" });
  const [obsTypeForm, setObsTypeForm] = useState({ id: "", code: "", label: "", sortOrder: "0" });
  const [obsForm, setObsForm] = useState({ id: "", shipId: "", type: "", discipline: "HULL" as Discipline, authorId: "sys-user", date: new Date().toISOString().slice(0, 10), content: "", status: "open" as "open" | "closed", closedBy: "", closedAt: "" });
  const [batchForm, setBatchForm] = useState({ projectId: "", shipId: "", itemName: "", discipline: "HULL" as Discipline, plannedDate: new Date().toISOString().slice(0, 10), yardQc: "", isReinspection: false });
  const [submitForm, setSubmitForm] = useState({ result: "QCC", actualDate: new Date().toISOString().slice(0, 10), submittedBy: "sys-user", inspectorDisplayName: "Admin Console", notes: "", commentsText: "" });
  const [inspectionItemForm, setInspectionItemForm] = useState({ shipId: "", itemName: "", discipline: "HULL" as Discipline, workflowStatus: "pending", lastRoundResult: "", resolvedResult: "", currentRound: "1", source: "manual" as "manual" | "n8n" });
  const [inspectionRoundForm, setInspectionRoundForm] = useState({ rawItemName: "", plannedDate: "", actualDate: "", yardQc: "", result: "", inspectedBy: "", notes: "", source: "manual" as "manual" | "n8n" });
  const [inspectionCommentForm, setInspectionCommentForm] = useState({ id: "", authorId: "", content: "", status: "open" as "open" | "closed", closedBy: "", closedAt: "" });

  const filteredShips = useMemo(() => ships.filter((x) => !shipProjectFilter || x.projectId === shipProjectFilter), [ships, shipProjectFilter]);
  const filteredUsers = useMemo(() => users.filter((x) => (!userRoleFilter || x.role === userRoleFilter) && (userActiveFilter === "" || (userActiveFilter === "true" ? x.isActive === 1 : x.isActive === 0))), [users, userRoleFilter, userActiveFilter]);
  const selectedUser = useMemo(() => users.find((x) => x.id === selectedUserId) ?? null, [users, selectedUserId]);
  const inspectionShipChoices = useMemo(() => ships.filter((x) => !batchForm.projectId || x.projectId === batchForm.projectId), [ships, batchForm.projectId]);
  const selectedObservation = useMemo(() => observations.find((x) => x.id === selectedObservationId) ?? null, [observations, selectedObservationId]);
  const filteredInspectionList = useMemo(() => inspectionList.filter((x) => (!inspectionDisciplineFilter || x.discipline === inspectionDisciplineFilter) && (!inspectionStatusFilter || x.workflowStatus === inspectionStatusFilter) && (!inspectionQuery || `${x.itemName} ${x.hullNumber} ${x.shipName} ${x.projectCode}`.toLowerCase().includes(inspectionQuery.toLowerCase()))), [inspectionDisciplineFilter, inspectionList, inspectionQuery, inspectionStatusFilter]);
  const jsonSnapshot = useMemo(() => activeTab === "projects" ? projects : activeTab === "ships" ? filteredShips : activeTab === "users" ? filteredUsers : activeTab === "observationTypes" ? obsTypes : activeTab === "observations" ? observations : inspectionDetail ?? filteredInspectionList, [activeTab, projects, filteredShips, filteredUsers, obsTypes, observations, inspectionDetail, filteredInspectionList]);

  useEffect(() => { void refreshAll(); }, []);
  useEffect(() => { if (!selectedObsShipId && ships[0]) setSelectedObsShipId(ships[0].id); }, [ships, selectedObsShipId]);
  useEffect(() => { if (selectedObsShipId) void loadObservations(selectedObsShipId); }, [selectedObsShipId, obsTypeFilter, obsDisciplineFilter, obsStatusFilter, obsDateFrom, obsDateTo]);
  useEffect(() => { if (!batchForm.projectId && projects[0]) setBatchForm((s) => ({ ...s, projectId: projects[0].id })); }, [projects, batchForm.projectId]);
  useEffect(() => { if (!batchForm.shipId && ships[0]) setBatchForm((s) => ({ ...s, shipId: ships[0].id })); }, [ships, batchForm.shipId]);
  useEffect(() => { if (!inspectionShipChoices.some((x) => x.id === batchForm.shipId)) setBatchForm((s) => ({ ...s, shipId: inspectionShipChoices[0]?.id ?? "" })); }, [inspectionShipChoices, batchForm.shipId]);
  useEffect(() => { if (selectedInspectionId) void loadInspectionDetail(selectedInspectionId); }, [selectedInspectionId]);
  useEffect(() => {
    if (!selectedUser) return;
    setUserForm({ id: selectedUser.id, username: selectedUser.username, displayName: selectedUser.displayName, role: selectedUser.role, disciplines: selectedUser.disciplines, accessibleProjectIds: selectedUser.accessibleProjectIds, isActive: selectedUser.isActive === 1, password: "" });
    setPasswordDraft("");
  }, [selectedUser]);
  useEffect(() => {
    if (!selectedObservation) return;
    setObsForm({ id: selectedObservation.id, shipId: selectedObservation.shipId, type: selectedObservation.type, discipline: selectedObservation.discipline, authorId: selectedObservation.authorId, date: selectedObservation.date, content: selectedObservation.content, status: selectedObservation.status, closedBy: selectedObservation.closedBy ?? "", closedAt: selectedObservation.closedAt ?? "" });
  }, [selectedObservation]);
  useEffect(() => {
    if (!inspectionDetail) return;
    setInspectionItemForm({ shipId: ships.find((ship) => ship.hullNumber === inspectionDetail.hullNumber && ship.shipName === inspectionDetail.shipName)?.id ?? "", itemName: inspectionDetail.itemName, discipline: inspectionDetail.discipline, workflowStatus: inspectionDetail.workflowStatus, lastRoundResult: inspectionDetail.lastRoundResult ?? "", resolvedResult: inspectionDetail.resolvedResult ?? "", currentRound: String(inspectionDetail.currentRound), source: inspectionDetail.source });
    const currentRound = inspectionDetail.roundHistory.find((round) => round.roundNumber === inspectionDetail.currentRound);
    setInspectionRoundForm({ rawItemName: inspectionDetail.itemName, plannedDate: inspectionDetail.plannedDate ?? "", actualDate: inspectionDetail.actualDate ?? "", yardQc: inspectionDetail.yardQc ?? "", result: inspectionDetail.lastRoundResult ?? "", inspectedBy: currentRound?.submittedBy ?? "", notes: currentRound?.notes ?? "", source: inspectionDetail.source });
    setSelectedCommentId((current) => current && inspectionDetail.comments.some((item) => item.id === current) ? current : inspectionDetail.comments[0]?.id ?? "");
  }, [inspectionDetail, ships]);
  useEffect(() => {
    if (!inspectionDetail) return;
    const comment = inspectionDetail.comments.find((item) => item.id === selectedCommentId);
    if (!comment) return;
    setInspectionCommentForm({ id: comment.id, authorId: comment.createdBy, content: comment.message, status: comment.status, closedBy: comment.resolvedBy ?? "", closedAt: comment.resolvedAt ?? "" });
  }, [inspectionDetail, selectedCommentId]);

  async function refreshAll() {
    setLoading(true); setError(null);
    try {
      const [m, p, s, u, o, i] = await Promise.all([fetchApiMeta(), fetchProjects(), fetchShips(), fetchUsers(), fetchObservationTypes(), fetchInspectionList()]);
      setMeta(m); setProjects(p); setShips(s); setUsers(u); setObsTypes(o); setInspectionList(i.items);
      setSelectedInspectionId((v) => v || i.items[0]?.id || "");
      setSelectedObsShipId((v) => v || s[0]?.id || "");
      setSelectedUserId((v) => v && u.some((item) => item.id === v) ? v : "");
    } catch (e) { setError(msg(e, "Failed to load admin data")); } finally { setLoading(false); }
  }
  async function loadObservations(shipId: string) {
    try {
      const data = await fetchObservations(shipId, { type: obsTypeFilter || undefined, discipline: obsDisciplineFilter || undefined, status: obsStatusFilter || undefined, date_from: obsDateFrom || undefined, date_to: obsDateTo || undefined });
      setObservations(data);
      setSelectedObservationId((current) => current && data.some((item) => item.id === current) ? current : data[0]?.id ?? "");
    } catch (e) { setError(msg(e, "Failed to load observations")); }
  }
  async function loadInspectionDetail(id: string) { try { setInspectionDetail(await fetchInspectionDetail(id)); } catch (e) { setError(msg(e, "Failed to load inspection detail")); } }
  async function saveProject(e: React.FormEvent) {
    e.preventDefault(); setWorking("project");
    try {
      projectForm.id ? await updateProject(projectForm.id, { name: projectForm.name, code: projectForm.code, status: projectForm.status, owner: empty(projectForm.owner), shipyard: empty(projectForm.shipyard), class: empty(projectForm.class), recipients: projectForm.recipients.split(",").map((x) => x.trim()).filter(Boolean) }) : await createProject({ name: projectForm.name, code: projectForm.code, owner: empty(projectForm.owner) ?? undefined, shipyard: empty(projectForm.shipyard) ?? undefined, class: empty(projectForm.class) ?? undefined, recipients: projectForm.recipients.split(",").map((x) => x.trim()).filter(Boolean) });
      setProjects(await fetchProjects());
      setProjectForm({ id: "", code: "", name: "", status: "active", owner: "", shipyard: "", class: "", recipients: "" });
      setStatus("Project saved");
    } catch (x) { setError(msg(x, "Failed to save project")); } finally { setWorking(null); }
  }
  async function saveShip(e: React.FormEvent) {
    e.preventDefault(); setWorking("ship");
    try {
      shipForm.id ? await updateShip(shipForm.id, { hullNumber: shipForm.hullNumber, shipName: shipForm.shipName, shipType: empty(shipForm.shipType) ?? undefined, status: shipForm.status }) : await createShip({ projectId: shipForm.projectId, hullNumber: shipForm.hullNumber, shipName: shipForm.shipName, shipType: empty(shipForm.shipType) ?? undefined });
      setShips(await fetchShips());
      setShipForm({ id: "", projectId: shipProjectFilter || projects[0]?.id || "", hullNumber: "", shipName: "", shipType: "", status: "building" });
      setStatus("Ship saved");
    } catch (x) { setError(msg(x, "Failed to save ship")); } finally { setWorking(null); }
  }
  async function saveObsType(e: React.FormEvent) {
    e.preventDefault(); setWorking("obsType");
    try {
      obsTypeForm.id ? await updateObservationType(obsTypeForm.id, { label: obsTypeForm.label, sortOrder: Number(obsTypeForm.sortOrder || 0) }) : await createObservationType({ code: obsTypeForm.code, label: obsTypeForm.label, sortOrder: Number(obsTypeForm.sortOrder || 0) });
      setObsTypes(await fetchObservationTypes());
      setObsTypeForm({ id: "", code: "", label: "", sortOrder: "0" });
      setStatus("Observation type saved");
    } catch (x) { setError(msg(x, "Failed to save observation type")); } finally { setWorking(null); }
  }
  function resetUserForm() { setSelectedUserId(""); setPasswordDraft(""); setUserForm({ id: "", username: "", displayName: "", role: "inspector", disciplines: [], accessibleProjectIds: [], isActive: true, password: "" }); }
  async function saveUser(e: React.FormEvent) {
    e.preventDefault(); setWorking("user");
    try {
      if (userForm.id) await updateUser(userForm.id, { displayName: userForm.displayName, role: userForm.role, disciplines: userForm.disciplines as Discipline[], accessibleProjectIds: userForm.accessibleProjectIds, isActive: userForm.isActive });
      else await createUser({ username: userForm.username, displayName: userForm.displayName, password: userForm.password, role: userForm.role, disciplines: userForm.disciplines as Discipline[], accessibleProjectIds: userForm.accessibleProjectIds });
      const nextUsers = await fetchUsers();
      setUsers(nextUsers);
      setSelectedUserId(userForm.id || nextUsers.find((x) => x.username === userForm.username)?.id || "");
      setUserForm((current) => ({ ...current, password: "" }));
      setStatus("User saved");
    } catch (x) { setError(msg(x, "Failed to save user")); } finally { setWorking(null); }
  }
  async function savePassword() { if (!userForm.id || !passwordDraft) return; setWorking("password"); try { await updateUserPassword(userForm.id, passwordDraft); setPasswordDraft(""); setStatus("Password updated"); } catch (x) { setError(msg(x, "Failed to update password")); } finally { setWorking(null); } }
  async function saveObservation(e: React.FormEvent) { e.preventDefault(); if (!selectedObsShipId) return; setWorking("obs"); try { obsForm.id ? await updateObservation(obsForm.id, { shipId: obsForm.shipId, type: obsForm.type, discipline: obsForm.discipline, authorId: obsForm.authorId, date: obsForm.date, content: obsForm.content, status: obsForm.status, closedBy: empty(obsForm.closedBy), closedAt: empty(obsForm.closedAt) }) : await createObservation(selectedObsShipId, { type: obsForm.type, discipline: obsForm.discipline, authorId: obsForm.authorId || "sys-user", date: obsForm.date, content: obsForm.content }); await loadObservations(selectedObsShipId); setStatus("Observation saved"); } catch (x) { setError(msg(x, "Failed to save observation")); } finally { setWorking(null); } }
  async function doCloseObservation(id: string) { setWorking("closeObs"); try { await closeObservation(id, "sys-user"); await loadObservations(selectedObsShipId); setStatus("Observation closed"); } catch (x) { setError(msg(x, "Failed to close observation")); } finally { setWorking(null); } }
  async function doResolveComment(commentId: string) { if (!inspectionDetail) return; setWorking("resolve"); try { await resolveInspectionComment(inspectionDetail.id, commentId, { resolvedBy: resolveBy || "sys-user", expectedVersion: inspectionDetail.version }); await loadInspectionDetail(inspectionDetail.id); setInspectionList((await fetchInspectionList()).items); setStatus("Comment resolved"); } catch (x) { setError(msg(x, "Failed to resolve comment")); } finally { setWorking(null); } }
  async function saveInspectionItemAdmin(e: React.FormEvent) { e.preventDefault(); if (!inspectionDetail) return; setWorking("inspection-item"); try { await updateInspectionItemAdmin(inspectionDetail.id, { shipId: inspectionItemForm.shipId || undefined, itemName: inspectionItemForm.itemName, discipline: inspectionItemForm.discipline, workflowStatus: inspectionItemForm.workflowStatus, lastRoundResult: empty(inspectionItemForm.lastRoundResult), resolvedResult: empty(inspectionItemForm.resolvedResult), currentRound: Number(inspectionItemForm.currentRound || 1), source: inspectionItemForm.source }); await loadInspectionDetail(inspectionDetail.id); setInspectionList((await fetchInspectionList()).items); setStatus("Inspection item updated"); } catch (x) { setError(msg(x, "Failed to update inspection item")); } finally { setWorking(null); } }
  async function saveInspectionRoundAdmin(e: React.FormEvent) { e.preventDefault(); if (!inspectionDetail) return; setWorking("inspection-round"); try { await updateInspectionCurrentRoundAdmin(inspectionDetail.id, { rawItemName: inspectionRoundForm.rawItemName, plannedDate: empty(inspectionRoundForm.plannedDate), actualDate: empty(inspectionRoundForm.actualDate), yardQc: empty(inspectionRoundForm.yardQc), result: empty(inspectionRoundForm.result), inspectedBy: empty(inspectionRoundForm.inspectedBy), notes: empty(inspectionRoundForm.notes), source: inspectionRoundForm.source }); await loadInspectionDetail(inspectionDetail.id); setInspectionList((await fetchInspectionList()).items); setStatus("Inspection round updated"); } catch (x) { setError(msg(x, "Failed to update inspection round")); } finally { setWorking(null); } }
  async function saveInspectionCommentAdmin(e: React.FormEvent) { e.preventDefault(); if (!inspectionDetail || !inspectionCommentForm.id) return; setWorking("inspection-comment"); try { await updateInspectionCommentAdmin(inspectionDetail.id, inspectionCommentForm.id, { authorId: empty(inspectionCommentForm.authorId) ?? undefined, content: inspectionCommentForm.content, status: inspectionCommentForm.status, closedBy: empty(inspectionCommentForm.closedBy), closedAt: empty(inspectionCommentForm.closedAt) }); await loadInspectionDetail(inspectionDetail.id); setInspectionList((await fetchInspectionList()).items); setStatus("Inspection comment updated"); } catch (x) { setError(msg(x, "Failed to update inspection comment")); } finally { setWorking(null); } }

  return (
    <main className="workspace">
      <section className="hero" style={{ paddingBottom: "24px" }}>
        <div>
          <p className="eyebrow">ADMIN</p>
          <h2>ADMIN CONSOLE</h2>
          <p style={{ margin: 0, color: "var(--nb-text-muted)", fontWeight: 600 }}>
            Locate records, filter them, and edit fields directly from the admin panel.
          </p>
        </div>
      </section>
      {error ? <div className="alert error" style={{ marginTop: 16 }}>{error}</div> : null}
      {status ? <div className="alert success" style={{ marginTop: 16 }}>{status}</div> : null}
      <section style={{ marginTop: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>{tabs.map((tab) => <button key={tab.key} className={activeTab === tab.key ? "pill active" : "pill"} style={{ border: "1px solid var(--nb-border)", background: "#fff", cursor: "pointer" }} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}</section>
      {activeTab === "projects" ? <section style={{ display: "grid", gap: 16, marginTop: 16 }}><Editor title="Projects"><form onSubmit={saveProject} style={panelGrid}><div style={grid2}><Field label="Code"><input style={inputStyle} value={projectForm.code} onChange={(e) => setProjectForm({ ...projectForm, code: e.target.value })} required /></Field><Field label="Name"><input style={inputStyle} value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} required /></Field><Field label="Status"><select className="filterSelect" value={projectForm.status} onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value as ProjectRecord["status"] })}><option value="active">active</option><option value="archived">archived</option></select></Field><Field label="Owner"><input style={inputStyle} value={projectForm.owner} onChange={(e) => setProjectForm({ ...projectForm, owner: e.target.value })} /></Field><Field label="Shipyard"><input style={inputStyle} value={projectForm.shipyard} onChange={(e) => setProjectForm({ ...projectForm, shipyard: e.target.value })} /></Field><Field label="Class"><input style={inputStyle} value={projectForm.class} onChange={(e) => setProjectForm({ ...projectForm, class: e.target.value })} /></Field></div><Field label="Recipients"><textarea style={inputStyle} value={projectForm.recipients} onChange={(e) => setProjectForm({ ...projectForm, recipients: e.target.value })} /></Field><button className="submitButton" type="submit" disabled={working === "project"}>{projectForm.id ? "Update" : "Create"}</button></form></Editor><section className="panel"><div className="tableWrap"><table><thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Owner</th><th>Shipyard</th><th>Class</th></tr></thead><tbody>{projects.map((x) => <tr key={x.id}><td>{x.code}</td><td>{x.name}</td><td>{x.status}</td><td>{x.owner ?? "-"}</td><td>{x.shipyard ?? "-"}</td><td>{x.class ?? "-"}</td></tr>)}</tbody></table></div></section></section> : null}
      {activeTab === "ships" ? <section style={{ display: "grid", gap: 16, marginTop: 16 }}><Editor title="Ships"><div style={{ marginBottom: 12 }}><select className="filterSelect" value={shipProjectFilter} onChange={(e) => setShipProjectFilter(e.target.value)}><option value="">All projects</option>{projects.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select></div><form onSubmit={saveShip} style={panelGrid}><div style={grid2}><Field label="Project"><select className="filterSelect" value={shipForm.projectId} onChange={(e) => setShipForm({ ...shipForm, projectId: e.target.value })}><option value="">Select</option>{projects.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select></Field><Field label="Hull Number"><input style={inputStyle} value={shipForm.hullNumber} onChange={(e) => setShipForm({ ...shipForm, hullNumber: e.target.value })} required /></Field><Field label="Ship Name"><input style={inputStyle} value={shipForm.shipName} onChange={(e) => setShipForm({ ...shipForm, shipName: e.target.value })} required /></Field><Field label="Ship Type"><input style={inputStyle} value={shipForm.shipType} onChange={(e) => setShipForm({ ...shipForm, shipType: e.target.value })} /></Field><Field label="Status"><select className="filterSelect" value={shipForm.status} onChange={(e) => setShipForm({ ...shipForm, status: e.target.value as ShipRecord["status"] })}><option value="building">building</option><option value="delivered">delivered</option></select></Field></div><button className="submitButton" type="submit" disabled={working === "ship"}>{shipForm.id ? "Update" : "Create"}</button></form></Editor><section className="panel"><div className="tableWrap"><table><thead><tr><th>Hull</th><th>Name</th><th>Project</th><th>Type</th><th>Status</th></tr></thead><tbody>{filteredShips.map((x) => <tr key={x.id}><td>{x.hullNumber}</td><td>{x.shipName}</td><td>{projects.find((p) => p.id === x.projectId)?.code ?? x.projectId}</td><td>{x.shipType ?? "-"}</td><td>{x.status}</td></tr>)}</tbody></table></div></section></section> : null}
      {activeTab === "observationTypes" ? <section style={{ display: "grid", gap: 16, marginTop: 16 }}><Editor title="Observation Types"><form onSubmit={saveObsType} style={panelGrid}><div style={grid2}><Field label="Code"><input style={inputStyle} value={obsTypeForm.code} onChange={(e) => setObsTypeForm({ ...obsTypeForm, code: e.target.value })} disabled={Boolean(obsTypeForm.id)} required /></Field><Field label="Label"><input style={inputStyle} value={obsTypeForm.label} onChange={(e) => setObsTypeForm({ ...obsTypeForm, label: e.target.value })} required /></Field><Field label="Sort Order"><input type="number" style={inputStyle} value={obsTypeForm.sortOrder} onChange={(e) => setObsTypeForm({ ...obsTypeForm, sortOrder: e.target.value })} /></Field></div><button className="submitButton" type="submit" disabled={working === "obsType"}>{obsTypeForm.id ? "Update" : "Create"}</button></form></Editor><section className="panel"><div className="tableWrap"><table><thead><tr><th>Code</th><th>Label</th><th>Sort Order</th></tr></thead><tbody>{obsTypes.map((x) => <tr key={x.id}><td>{x.code}</td><td>{x.label}</td><td>{x.sortOrder}</td></tr>)}</tbody></table></div></section></section> : null}
      {activeTab === "users" ? <section style={{ display: "grid", gap: 16, marginTop: 16 }}><Editor title="Users"><div style={{ display: "flex", gap: 8, marginBottom: 12 }}><select className="filterSelect" value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}><option value="">All roles</option>{ROLES.map((x) => <option key={x} value={x}>{x}</option>)}</select><select className="filterSelect" value={userActiveFilter} onChange={(e) => setUserActiveFilter(e.target.value)}><option value="">All status</option><option value="true">active</option><option value="false">inactive</option></select></div><form onSubmit={saveUser} style={panelGrid}><div style={grid2}><Field label="Username"><input style={inputStyle} value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} disabled={Boolean(userForm.id)} required /></Field><Field label="Display Name"><input style={inputStyle} value={userForm.displayName} onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })} required /></Field><Field label="Role"><select className="filterSelect" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })}>{ROLES.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field><Field label="Active"><select className="filterSelect" value={String(userForm.isActive)} onChange={(e) => setUserForm({ ...userForm, isActive: e.target.value === "true" })}><option value="true">true</option><option value="false">false</option></select></Field></div><Field label="Disciplines"><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{DISCIPLINES.map((d) => <button key={d} type="button" className={userForm.disciplines.includes(d) ? "pill active" : "pill"} onClick={() => setUserForm((s) => ({ ...s, disciplines: s.disciplines.includes(d) ? s.disciplines.filter((x) => x !== d) : [...s.disciplines, d] }))}>{d}</button>)}</div></Field><Field label="Accessible Projects"><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{projects.map((project) => <button key={project.id} type="button" className={userForm.accessibleProjectIds.includes(project.id) ? "pill active" : "pill"} onClick={() => setUserForm((s) => ({ ...s, accessibleProjectIds: s.accessibleProjectIds.includes(project.id) ? s.accessibleProjectIds.filter((x) => x !== project.id) : [...s.accessibleProjectIds, project.id] }))}>{project.code}</button>)}</div></Field>{!userForm.id ? <Field label="Initial Password"><input type="password" style={inputStyle} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} required /></Field> : null}<div style={{ display: "flex", gap: 8 }}><button className="submitButton" type="submit" disabled={working === "user"}>{userForm.id ? "Update" : "Create"}</button>{userForm.id ? <button className="pill" type="button" onClick={resetUserForm}>New User</button> : null}</div></form>{userForm.id ? <div style={{ marginTop: 12 }}><Field label="New Password"><input type="password" style={inputStyle} value={passwordDraft} onChange={(e) => setPasswordDraft(e.target.value)} /></Field><button className="submitButton" type="button" onClick={() => void savePassword()} disabled={working === "password"}>Update Password</button></div> : null}</Editor><section className="panel"><div className="tableWrap"><table><thead><tr><th>Username</th><th>Display Name</th><th>Role</th><th>Disciplines</th><th>Projects</th><th>Active</th></tr></thead><tbody>{filteredUsers.map((x) => <tr key={x.id} className={x.id === selectedUserId ? "record-row isSelected" : "record-row"} onClick={() => setSelectedUserId(x.id)}><td>{x.username}</td><td>{x.displayName}</td><td>{x.role}</td><td>{x.disciplines.join(", ") || "-"}</td><td>{x.accessibleProjectIds.map((id) => projects.find((project) => project.id === id)?.code ?? id).join(", ") || "-"}</td><td>{x.isActive === 1 ? "true" : "false"}</td></tr>)}</tbody></table></div></section></section> : null}
      {activeTab === "observations" ? <section style={{ display: "grid", gap: 16, marginTop: 16 }}><Editor title="Observations"><div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}><select className="filterSelect" value={selectedObsShipId} onChange={(e) => setSelectedObsShipId(e.target.value)}><option value="">Select ship</option>{ships.map((x) => <option key={x.id} value={x.id}>{x.hullNumber} / {x.shipName}</option>)}</select><select className="filterSelect" value={obsTypeFilter} onChange={(e) => setObsTypeFilter(e.target.value)}><option value="">All types</option>{obsTypes.map((x) => <option key={x.id} value={x.code}>{x.code}</option>)}</select><select className="filterSelect" value={obsDisciplineFilter} onChange={(e) => setObsDisciplineFilter(e.target.value)}><option value="">All disciplines</option>{DISCIPLINES.map((x) => <option key={x} value={x}>{x}</option>)}</select><select className="filterSelect" value={obsStatusFilter} onChange={(e) => setObsStatusFilter(e.target.value)}><option value="">All status</option><option value="open">open</option><option value="closed">closed</option></select><input type="date" style={inputStyle} value={obsDateFrom} onChange={(e) => setObsDateFrom(e.target.value)} /><input type="date" style={inputStyle} value={obsDateTo} onChange={(e) => setObsDateTo(e.target.value)} /></div><form onSubmit={saveObservation} style={panelGrid}><div style={grid2}><Field label="Ship"><select className="filterSelect" value={obsForm.shipId || selectedObsShipId} onChange={(e) => setObsForm({ ...obsForm, shipId: e.target.value })}>{ships.map((x) => <option key={x.id} value={x.id}>{x.hullNumber}</option>)}</select></Field><Field label="Type"><select className="filterSelect" value={obsForm.type} onChange={(e) => setObsForm({ ...obsForm, type: e.target.value })}><option value="">Select</option>{obsTypes.map((x) => <option key={x.id} value={x.code}>{x.code}</option>)}</select></Field><Field label="Discipline"><select className="filterSelect" value={obsForm.discipline} onChange={(e) => setObsForm({ ...obsForm, discipline: e.target.value as Discipline })}>{DISCIPLINES.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field><Field label="Author Id"><input style={inputStyle} value={obsForm.authorId} onChange={(e) => setObsForm({ ...obsForm, authorId: e.target.value })} /></Field><Field label="Date"><input type="date" style={inputStyle} value={obsForm.date} onChange={(e) => setObsForm({ ...obsForm, date: e.target.value })} /></Field><Field label="Status"><select className="filterSelect" value={obsForm.status} onChange={(e) => setObsForm({ ...obsForm, status: e.target.value as "open" | "closed" })}><option value="open">open</option><option value="closed">closed</option></select></Field></div><Field label="Content"><textarea style={inputStyle} value={obsForm.content} onChange={(e) => setObsForm({ ...obsForm, content: e.target.value })} /></Field><div style={{ display: "flex", gap: 8 }}><button className="submitButton" type="submit" disabled={working === "obs"}>{obsForm.id ? "Update" : "Create"}</button>{obsForm.id && obsForm.status === "open" ? <button className="pill" type="button" onClick={() => void doCloseObservation(obsForm.id)}>Close</button> : null}</div></form></Editor><section className="panel"><div className="tableWrap"><table><thead><tr><th>Type</th><th>Discipline</th><th>Date</th><th>Author</th><th>Status</th><th>Content</th></tr></thead><tbody>{observations.map((x) => <tr key={x.id} className={x.id === selectedObservationId ? "record-row isSelected" : "record-row"} onClick={() => setSelectedObservationId(x.id)}><td>{x.type}</td><td>{x.discipline}</td><td>{x.date}</td><td>{x.authorName ?? x.authorId}</td><td>{x.status}</td><td>{x.content}</td></tr>)}</tbody></table></div></section></section> : null}
      {activeTab === "inspections" ? <section style={{ display: "grid", gap: 16, marginTop: 16 }}><section className="panel"><div className="panelHeader"><h3>Inspection Locator</h3><span className="badge muted">{filteredInspectionList.length} rows</span></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12 }}><select className="filterSelect" value={inspectionDisciplineFilter} onChange={(e) => setInspectionDisciplineFilter(e.target.value)}><option value="">All disciplines</option>{DISCIPLINES.map((x) => <option key={x} value={x}>{x}</option>)}</select><select className="filterSelect" value={inspectionStatusFilter} onChange={(e) => setInspectionStatusFilter(e.target.value)}><option value="">All status</option>{[...new Set(inspectionList.map((x) => x.workflowStatus))].map((x) => <option key={x} value={x}>{x}</option>)}</select><input style={inputStyle} placeholder="Search item / ship / project" value={inspectionQuery} onChange={(e) => setInspectionQuery(e.target.value)} /></div><div className="tableWrap" style={{ marginTop: 12 }}><table><thead><tr><th>Item</th><th>Ship</th><th>Discipline</th><th>Round</th><th>Result</th><th>Status</th><th>Open Comments</th></tr></thead><tbody>{filteredInspectionList.map((x) => <tr key={x.id} className={x.id === selectedInspectionId ? "record-row isSelected" : "record-row"} onClick={() => setSelectedInspectionId(x.id)}><td>{x.itemName}</td><td>{x.hullNumber} / {x.shipName}</td><td>{x.discipline}</td><td>{x.currentRound}</td><td>{x.currentResult ?? "-"}</td><td>{x.workflowStatus}</td><td>{x.openComments}</td></tr>)}</tbody></table></div></section>{inspectionDetail ? <><section className="panel"><div className="panelHeader"><h3>Inspection Detail</h3><span className="badge">{inspectionDetail.workflowStatus}</span></div><div className="detailSummaryGrid" style={{ marginTop: 12 }}><InfoCard label="Project" value={`${inspectionDetail.projectCode} / ${inspectionDetail.projectName}`} /><InfoCard label="Ship" value={`${inspectionDetail.hullNumber} / ${inspectionDetail.shipName}`} /><InfoCard label="Item" value={inspectionDetail.itemName} /><InfoCard label="Round" value={String(inspectionDetail.currentRound)} /><InfoCard label="Last Result" value={inspectionDetail.lastRoundResult ?? "-"} /><InfoCard label="Open Comments" value={String(inspectionDetail.openCommentCount)} /></div></section><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}><Editor title="Edit Item"><form onSubmit={saveInspectionItemAdmin} style={panelGrid}><div style={grid2}><Field label="Ship"><select className="filterSelect" value={inspectionItemForm.shipId} onChange={(e) => setInspectionItemForm({ ...inspectionItemForm, shipId: e.target.value })}><option value="">Select</option>{ships.map((ship) => <option key={ship.id} value={ship.id}>{ship.hullNumber} / {ship.shipName}</option>)}</select></Field><Field label="Item Name"><input style={inputStyle} value={inspectionItemForm.itemName} onChange={(e) => setInspectionItemForm({ ...inspectionItemForm, itemName: e.target.value })} /></Field><Field label="Discipline"><select className="filterSelect" value={inspectionItemForm.discipline} onChange={(e) => setInspectionItemForm({ ...inspectionItemForm, discipline: e.target.value as Discipline })}>{DISCIPLINES.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field><Field label="Workflow Status"><input style={inputStyle} value={inspectionItemForm.workflowStatus} onChange={(e) => setInspectionItemForm({ ...inspectionItemForm, workflowStatus: e.target.value })} /></Field></div><button className="submitButton" type="submit" disabled={working === "inspection-item"}>Save Item</button></form></Editor><Editor title="Edit Current Round"><form onSubmit={saveInspectionRoundAdmin} style={panelGrid}><div style={grid2}><Field label="Raw Item Name"><input style={inputStyle} value={inspectionRoundForm.rawItemName} onChange={(e) => setInspectionRoundForm({ ...inspectionRoundForm, rawItemName: e.target.value })} /></Field><Field label="Planned Date"><input type="date" style={inputStyle} value={inspectionRoundForm.plannedDate} onChange={(e) => setInspectionRoundForm({ ...inspectionRoundForm, plannedDate: e.target.value })} /></Field><Field label="Actual Date"><input type="date" style={inputStyle} value={inspectionRoundForm.actualDate} onChange={(e) => setInspectionRoundForm({ ...inspectionRoundForm, actualDate: e.target.value })} /></Field><Field label="Result"><input style={inputStyle} value={inspectionRoundForm.result} onChange={(e) => setInspectionRoundForm({ ...inspectionRoundForm, result: e.target.value })} /></Field></div><Field label="Notes"><textarea style={inputStyle} value={inspectionRoundForm.notes} onChange={(e) => setInspectionRoundForm({ ...inspectionRoundForm, notes: e.target.value })} /></Field><button className="submitButton" type="submit" disabled={working === "inspection-round"}>Save Round</button></form></Editor></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}><Editor title="Edit Comment"><select className="filterSelect" value={selectedCommentId} onChange={(e) => setSelectedCommentId(e.target.value)}><option value="">Select comment</option>{inspectionDetail.comments.map((comment) => <option key={comment.id} value={comment.id}>#{comment.localId} / round {comment.roundNumber} / {comment.status}</option>)}</select><form onSubmit={saveInspectionCommentAdmin} style={{ ...panelGrid, marginTop: 12 }}><Field label="Content"><textarea style={inputStyle} value={inspectionCommentForm.content} onChange={(e) => setInspectionCommentForm({ ...inspectionCommentForm, content: e.target.value })} /></Field><button className="submitButton" type="submit" disabled={working === "inspection-comment" || !inspectionCommentForm.id}>Save Comment</button></form></Editor><Editor title="Workflow Actions"><Field label="Resolve By"><input style={inputStyle} value={resolveBy} onChange={(e) => setResolveBy(e.target.value)} /></Field><div className="commentList">{inspectionDetail.comments.map((c) => <div key={c.id} className="commentCard"><div className="commentMeta"><strong>#{c.localId} / round {c.roundNumber}</strong><span className={c.status === "open" ? "commentStatus open" : "commentStatus closed"}>{c.status}</span></div><p>{c.message}</p>{c.status === "open" ? <button className="submitButton" onClick={() => void doResolveComment(c.id)} disabled={working === "resolve"}>Resolve</button> : null}</div>)}</div></Editor></div></> : <section className="panel"><div className="emptyState">Select an inspection row to edit.</div></section>}</section> : null}
      <aside className="panel" style={{ marginTop: 16 }}><div className="panelHeader"><h3>JSON Snapshot</h3><span className="badge muted">{activeTab}</span></div><pre style={{ marginTop: 8, padding: 12, minHeight: 220, overflow: "auto", borderRadius: 10, border: "1px solid var(--nb-border)", background: "#0f172a", color: "#cbd5e1", fontSize: 10, lineHeight: 1.5 }}>{JSON.stringify(jsonSnapshot, null, 2)}</pre></aside>
    </main>
  );
}
