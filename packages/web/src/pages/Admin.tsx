
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
  const [selectedObsShipId, setSelectedObsShipId] = useState("");
  const [selectedInspectionId, setSelectedInspectionId] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [resolveBy, setResolveBy] = useState("sys-user");

  const [projectForm, setProjectForm] = useState({ id: "", code: "", name: "", status: "active" as ProjectRecord["status"], owner: "", shipyard: "", class: "", recipients: "" });
  const [shipForm, setShipForm] = useState({ id: "", projectId: "", hullNumber: "", shipName: "", shipType: "", status: "building" as ShipRecord["status"] });
  const [userForm, setUserForm] = useState({ id: "", username: "", displayName: "", role: "inspector" as Role, disciplines: [] as string[], isActive: true, password: "" });
  const [obsTypeForm, setObsTypeForm] = useState({ id: "", code: "", label: "", sortOrder: "0" });
  const [obsForm, setObsForm] = useState({ id: "", type: "", discipline: "HULL" as Discipline, authorId: "sys-user", date: new Date().toISOString().slice(0, 10), content: "" });
  const [batchForm, setBatchForm] = useState({ projectId: "", shipId: "", itemName: "", discipline: "HULL" as Discipline, plannedDate: new Date().toISOString().slice(0, 10), yardQc: "", isReinspection: false });
  const [submitForm, setSubmitForm] = useState({ result: "QCC", actualDate: new Date().toISOString().slice(0, 10), submittedBy: "sys-user", inspectorDisplayName: "Admin Console", notes: "", commentsText: "" });

  const filteredShips = useMemo(() => ships.filter((x) => !shipProjectFilter || x.projectId === shipProjectFilter), [ships, shipProjectFilter]);
  const filteredUsers = useMemo(() => users.filter((x) => (!userRoleFilter || x.role === userRoleFilter) && (userActiveFilter === "" || (userActiveFilter === "true" ? x.isActive === 1 : x.isActive === 0))), [users, userRoleFilter, userActiveFilter]);
  const inspectionShipChoices = useMemo(() => ships.filter((x) => !batchForm.projectId || x.projectId === batchForm.projectId), [ships, batchForm.projectId]);
  const jsonSnapshot = useMemo(() => activeTab === "projects" ? projects : activeTab === "ships" ? filteredShips : activeTab === "users" ? filteredUsers : activeTab === "observationTypes" ? obsTypes : activeTab === "observations" ? observations : inspectionDetail ?? inspectionList, [activeTab, projects, filteredShips, filteredUsers, obsTypes, observations, inspectionDetail, inspectionList]);

  useEffect(() => { void refreshAll(); }, []);
  useEffect(() => { if (!selectedObsShipId && ships[0]) setSelectedObsShipId(ships[0].id); }, [ships, selectedObsShipId]);
  useEffect(() => { if (selectedObsShipId) void loadObservations(selectedObsShipId); }, [selectedObsShipId]);
  useEffect(() => { if (!batchForm.projectId && projects[0]) setBatchForm((s) => ({ ...s, projectId: projects[0].id })); }, [projects, batchForm.projectId]);
  useEffect(() => { if (!batchForm.shipId && ships[0]) setBatchForm((s) => ({ ...s, shipId: ships[0].id })); }, [ships, batchForm.shipId]);
  useEffect(() => { if (!inspectionShipChoices.some((x) => x.id === batchForm.shipId)) setBatchForm((s) => ({ ...s, shipId: inspectionShipChoices[0]?.id ?? "" })); }, [inspectionShipChoices, batchForm.shipId]);
  useEffect(() => { if (selectedInspectionId) void loadInspectionDetail(selectedInspectionId); }, [selectedInspectionId]);

  async function refreshAll() {
    setLoading(true); setError(null);
    try {
      const [m, p, s, u, o, i] = await Promise.all([fetchApiMeta(), fetchProjects(), fetchShips(), fetchUsers(), fetchObservationTypes(), fetchInspectionList()]);
      setMeta(m); setProjects(p); setShips(s); setUsers(u); setObsTypes(o); setInspectionList(i.items);
      setSelectedInspectionId((v) => v || i.items[0]?.id || "");
      setSelectedObsShipId((v) => v || s[0]?.id || "");
    } catch (e) { setError(msg(e, "Failed to load admin data")); } finally { setLoading(false); }
  }
  async function loadObservations(shipId: string) { try { setObservations(await fetchObservations(shipId)); } catch (e) { setError(msg(e, "Failed to load observations")); } }
  async function loadInspectionDetail(id: string) { try { setInspectionDetail(await fetchInspectionDetail(id)); } catch (e) { setError(msg(e, "Failed to load inspection detail")); } }

  return (
    <main className="workspace">
      <section className="hero" style={{ paddingBottom: "24px" }}>
        <div>
          <p className="eyebrow">ADMIN</p>
          <h2>ADMIN CONSOLE</h2>
          <p style={{ margin: 0, color: "var(--nb-text-muted)", fontWeight: 600 }}>
            (Placeholder UI) Admin workflows are still under construction.
          </p>
        </div>
      </section>
    </main>
  );
}
