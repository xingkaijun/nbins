import React, { useEffect, useMemo, useState } from "react";
import {
  updateUser,
  deleteUser,
  fetchApiMeta,
  fetchProjects,
  fetchShips,
  fetchUsers,
  fetchObservationTypes,
  fetchInspectionComments,
  fetchInspectionList,
  fetchObservations,
  fetchInspectionDetail,
  updateInspectionItemAdmin,
  createObservation,
  updateObservation,
  createObservationType,
  updateObservationType,
  updateInspectionCommentAdmin,
  deleteInspectionCommentAdmin,
  createProject,
  updateProject,
  createShip,
  updateShip,
  createUser,
  updateUserPassword,
  type ApiMeta,
  type InspectionListItem,
  type ProjectRecord,
  type ShipRecord,
  type UserRecord
} from "../../api";
import { DISCIPLINES, ROLES, type Discipline, type InspectionCommentView, type ObservationItem, type ObservationType, type Role } from "@nbins/shared";
import { AdminLayout } from "./AdminLayout";
import { DataTable } from "./DataTable";
import { RecordEditor } from "./RecordEditor";
import { TableToolbar } from "./TableToolbar";
import type { AdminTableConfig } from "./table-configs";

type ObservationAdminRecord = ObservationItem & { shipLabel: string; projectCode: string };
type InspectionAdminRecord = InspectionListItem & { shipLabel: string; projectId?: string; date?: string; };
type AdminCommentRecord = InspectionCommentView & { itemName: string };
type TableKey =
  | "users"
  | "projects"
  | "ships"
  | "project_members"
  | "inspection_items"
  | "comments"
  | "observation_types"
  | "observations";

function messageOf(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

function saveBlob(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const EMPTY_SEARCH: Record<TableKey, string> = {
  users: "",
  projects: "",
  ships: "",
  project_members: "",
  inspection_items: "",
  comments: "",
  observation_types: "",
  observations: ""
};

const EMPTY_FILTERS: Record<TableKey, Record<string, string>> = {
  users: {},
  projects: {},
  ships: {},
  project_members: {},
  inspection_items: {},
  comments: {},
  observation_types: {},
  observations: {}
};

export function AdminPage() {
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [ships, setShips] = useState<ShipRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [observationTypes, setObservationTypes] = useState<ObservationType[]>([]);
  const [observations, setObservations] = useState<ObservationAdminRecord[]>([]);
  const [inspectionItems, setInspectionItems] = useState<InspectionAdminRecord[]>([]);
  const [adminComments, setAdminComments] = useState<AdminCommentRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTable, setActiveTable] = useState<TableKey>("projects");
  const [searchByTable, setSearchByTable] = useState<Record<TableKey, string>>(EMPTY_SEARCH);
  const [filtersByTable, setFiltersByTable] = useState<Record<TableKey, Record<string, string>>>(EMPTY_FILTERS);
  const [appliedSearchByTable, setAppliedSearchByTable] = useState<Record<TableKey, string>>(EMPTY_SEARCH);
  const [appliedFiltersByTable, setAppliedFiltersByTable] = useState<Record<TableKey, Record<string, string>>>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Partial<Record<TableKey, string>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<TableKey, Record<string, unknown>>>>({});
  const [isCreating, setIsCreating] = useState<Partial<Record<TableKey, boolean>>>({});
  const [sortByTable, setSortByTable] = useState<Partial<Record<TableKey, { key: string; direction: "asc" | "desc" }>>>({
    projects: { key: "code", direction: "asc" },
    ships: { key: "hullNumber", direction: "asc" },
    users: { key: "username", direction: "asc" },
    inspection_items: { key: "itemName", direction: "asc" },
    observations: { key: "date", direction: "desc" },
    observation_types: { key: "code", direction: "asc" }
  });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.id, label: `${project.code} / ${project.name}` })),
    [projects]
  );
  const shipOptions = useMemo(
    () => ships.map((ship) => ({ value: ship.id, label: `${ship.hullNumber} / ${ship.shipName}` })),
    [ships]
  );
  const currentInspFilters = filtersByTable.inspection_items ?? {};
  const filteredShipOptions = useMemo(
    () => ships.filter((s) => !currentInspFilters.projectId || s.projectId === currentInspFilters.projectId).map((ship) => ({ value: ship.id, label: `${ship.hullNumber} / ${ship.shipName}` })),
    [ships, currentInspFilters.projectId]
  );
  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: `${user.username} / ${user.displayName}` })),
    [users]
  );

  const tableConfigs = useMemo<Record<TableKey, AdminTableConfig<any>>>(() => ({
    users: {
      key: "users",
      label: "users",
      group: "core",
      description: "Manage platform users, roles, accessible projects, and discipline coverage.",
      columns: [
        { key: "username", label: "Username", sortable: true },
        { key: "displayName", label: "Display Name", sortable: true },
        { key: "role", label: "Role", sortable: true },
        { key: "disciplines", label: "Disciplines", render: (record: UserRecord) => record.disciplines.join(", ") || "-" },
        { key: "isActive", label: "Active", sortable: true, render: (record: UserRecord) => (record.isActive === 1 ? "true" : "false") }
      ],
      filters: [
        { key: "role", label: "Role", type: "select", options: ROLES.map((role) => ({ value: role, label: role })) },
        { key: "isActive", label: "Active", type: "select", options: [{ value: "1", label: "true" }, { value: "0", label: "false" }] }
      ],
      formFields: [
        { key: "username", label: "Username", type: "text", required: true },
        { key: "displayName", label: "Display Name", type: "text", required: true },
        { key: "role", label: "Role", type: "select", required: true, options: ROLES.map((role) => ({ value: role, label: role })) },
        { key: "disciplines", label: "Disciplines", type: "tags", options: DISCIPLINES.map((item) => ({ value: item, label: item })) },
        { key: "accessibleProjectIds", label: "Accessible Projects", type: "tags", options: projectOptions },
        { key: "isActive", label: "Active", type: "boolean" },
        { key: "password", label: "Initial Password", type: "password", required: true }
      ]
    },
    projects: {
      key: "projects",
      label: "projects",
      group: "core",
      description: "Browse and edit project master data.",
      columns: [
        { key: "code", label: "Code", sortable: true },
        { key: "name", label: "Name", sortable: true },
        { key: "status", label: "Status", sortable: true },
        { key: "owner", label: "Owner", sortable: true },
        { key: "shipyard", label: "Shipyard", sortable: true }
      ],
      filters: [{ key: "status", label: "Status", type: "select", options: [{ value: "active", label: "active" }, { value: "archived", label: "archived" }] }],
      formFields: [
        { key: "code", label: "Code", type: "text", required: true },
        { key: "name", label: "Name", type: "text", required: true },
        { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "active" }, { value: "archived", label: "archived" }] },
        { key: "owner", label: "Owner", type: "text" },
        { key: "shipyard", label: "Shipyard", type: "text" },
        { key: "class", label: "Class", type: "text" },
        { key: "recipientsText", label: "Recipients", type: "textarea", placeholder: "Comma-separated emails" }
      ]
    },
    ships: {
      key: "ships",
      label: "ships",
      group: "core",
      description: "Ships mapped to each project.",
      columns: [
        { key: "hullNumber", label: "Hull", sortable: true },
        { key: "shipName", label: "Ship Name", sortable: true },
        { key: "projectId", label: "Project", render: (record: ShipRecord) => projects.find((item) => item.id === record.projectId)?.code ?? record.projectId },
        { key: "shipType", label: "Type", sortable: true },
        { key: "status", label: "Status", sortable: true }
      ],
      filters: [
        { key: "projectId", label: "Project", type: "select", options: projectOptions },
        { key: "status", label: "Status", type: "select", options: [{ value: "building", label: "building" }, { value: "delivered", label: "delivered" }] }
      ],
      formFields: [
        { key: "projectId", label: "Project", type: "select", required: true, options: projectOptions },
        { key: "hullNumber", label: "Hull Number", type: "text", required: true },
        { key: "shipName", label: "Ship Name", type: "text", required: true },
        { key: "shipType", label: "Ship Type", type: "text" },
        { key: "status", label: "Status", type: "select", options: [{ value: "building", label: "building" }, { value: "delivered", label: "delivered" }] }
      ]
    },
    project_members: {
      key: "project_members",
      label: "project_members",
      group: "member",
      status: "coming-soon",
      description: "Waiting for `/admin/project-members` endpoints from the backend plan.",
      columns: [{ key: "projectCode", label: "Project" }, { key: "userName", label: "User" }, { key: "role", label: "Role" }]
    },
    inspection_items: {
      key: "inspection_items",
      label: "inspection_items",
      group: "inspection",
      description: "Inspection item master rows from the existing dashboard API.",
      columns: [
        { key: "projectCode", label: "Project", sortable: true },
        { key: "hullNumber", label: "Ship", sortable: true },
        { key: "itemName", label: "Item", sortable: true },
        { key: "discipline", label: "Discipline", sortable: true },
        { key: "yardQc", label: "Yard QC", sortable: true },
        { key: "date", label: "Date", sortable: true },
        { key: "workflowStatus", label: "Status", sortable: true },
        { key: "currentRound", label: "Round", sortable: true }
      ],
      filters: [
        { key: "projectId", label: "Project", type: "select", options: projectOptions },
        { key: "shipId", label: "Ship", type: "select", options: filteredShipOptions },
        { key: "discipline", label: "Discipline", type: "select", options: DISCIPLINES.map((item) => ({ value: item, label: item })) },
        { key: "yardQc", label: "Yard QC", type: "select", options: Array.from(new Set(inspectionItems.map(i => i.yardQc).filter(Boolean))).map(name => ({ value: name, label: name })) },
        { key: "date", label: "Date", type: "date" },
        { key: "workflowStatus", label: "Status", type: "select", options: [{ value: "pending", label: "pending" }, { value: "open", label: "open" }, { value: "closed", label: "closed" }] }
      ],
      formFields: [
        { key: "shipId", label: "Ship", type: "select", required: true, options: shipOptions },
        { key: "itemName", label: "Item Name", type: "text", required: true },
        { key: "discipline", label: "Discipline", type: "select", required: true, options: DISCIPLINES.map((item) => ({ value: item, label: item })) },
        { key: "workflowStatus", label: "Workflow Status", type: "text" },
        { key: "lastRoundResult", label: "Last Round Result", type: "text" },
        { key: "resolvedResult", label: "Resolved Result", type: "text" },
        { key: "currentRound", label: "Current Round", type: "number" },
        { key: "source", label: "Source", type: "select", options: [{ value: "manual", label: "manual" }, { value: "n8n", label: "n8n" }] }
      ]
    },
    comments: {
      key: "comments",
      label: "comments",
      group: "inspection",
      description: "Inspection comments / remarks from all projects, with multi-dimension filtering.",
      columns: [
        { key: "localId", label: "#", sortable: true },
        { key: "projectCode", label: "Project", sortable: true },
        { key: "hullNumber", label: "Ship", sortable: true },
        { key: "itemName", label: "Inspection Item", sortable: true },
        { key: "discipline", label: "Discipline", sortable: true },
        { key: "content", label: "Content", sortable: true },
        { key: "status", label: "Status", sortable: true },
        { key: "authorName", label: "Author", sortable: true },
        { key: "createdAt", label: "Created", sortable: true, render: (r: any) => String(r.createdAt ?? "").substring(0, 10) }
      ],
      filters: [
        { key: "projectId", label: "Project", type: "select", options: projectOptions },
        { key: "shipId", label: "Ship", type: "select", options: filteredShipOptions },
        { key: "discipline", label: "Discipline", type: "select", options: DISCIPLINES.map((item) => ({ value: item, label: item })) },
        { key: "createdAt", label: "Date", type: "date" },
        { key: "inspectionItemId", label: "Item", type: "select", options: inspectionItems.map((i) => ({ value: (i as any).id ?? "", label: i.itemName })) },
        { key: "authorId", label: "Author", type: "select", options: userOptions },
        { key: "status", label: "Status", type: "select", options: [{ value: "open", label: "open" }, { value: "closed", label: "closed" }] }
      ],
      formFields: [
        { key: "inspectionItemId", label: "Item Record", type: "readonly" },
        { key: "authorId", label: "Author", type: "select", options: userOptions },
        { key: "content", label: "Content", type: "textarea", required: true },
        { key: "status", label: "Status", type: "select", options: [{ value: "open", label: "open" }, { value: "closed", label: "closed" }] },
        { key: "closedBy", label: "Closed By", type: "select", options: userOptions }
      ]
    },

    observation_types: {
      key: "observation_types",
      label: "observation_types",
      group: "observation",
      description: "Observation type master data.",
      columns: [
        { key: "code", label: "Code", sortable: true },
        { key: "label", label: "Label", sortable: true },
        { key: "sortOrder", label: "Sort", sortable: true }
      ],
      formFields: [
        { key: "code", label: "Code", type: "text", required: true, disabledOnEdit: true },
        { key: "label", label: "Label", type: "text", required: true },
        { key: "sortOrder", label: "Sort Order", type: "number" }
      ]
    },
    observations: {
      key: "observations",
      label: "observations",
      group: "observation",
      description: "Cross-ship observation browser built from the existing ship-scoped API.",
      columns: [
        { key: "date", label: "Date", sortable: true },
        { key: "shipLabel", label: "Ship", sortable: true },
        { key: "type", label: "Type", sortable: true },
        { key: "discipline", label: "Discipline", sortable: true },
        { key: "status", label: "Status", sortable: true }
      ],
      filters: [
        { key: "shipId", label: "Ship", type: "select", options: shipOptions },
        { key: "type", label: "Type", type: "select", options: observationTypes.map((item) => ({ value: item.code, label: item.code })) },
        { key: "status", label: "Status", type: "select", options: [{ value: "open", label: "open" }, { value: "closed", label: "closed" }] }
      ],
      formFields: [
        { key: "shipId", label: "Ship", type: "select", required: true, options: shipOptions },
        { key: "type", label: "Type", type: "select", required: true, options: observationTypes.map((item) => ({ value: item.code, label: item.code })) },
        { key: "discipline", label: "Discipline", type: "select", required: true, options: DISCIPLINES.map((item) => ({ value: item, label: item })) },
        { key: "authorId", label: "Author", type: "select", options: userOptions },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "content", label: "Content", type: "textarea", required: true },
        { key: "status", label: "Status", type: "select", options: [{ value: "open", label: "open" }, { value: "closed", label: "closed" }] }
      ]
    }
  }), [observationTypes, projectOptions, projects, shipOptions, filteredShipOptions, ships, userOptions, inspectionItems, adminComments]);

  const tableData = useMemo<Record<TableKey, any[]>>(
    () => ({
      users,
      projects,
      ships,
      project_members: [],
      inspection_items: inspectionItems,
      comments: adminComments,
      observation_types: observationTypes,
      observations
    }),
    [adminComments, inspectionItems, observationTypes, observations, projects, ships, users]
  );

  useEffect(() => {
    void refreshAll();
  }, []);

  const currentConfig = tableConfigs[activeTable];
  const currentRows = tableData[activeTable];
  const currentFilters = filtersByTable[activeTable] ?? {};
  const currentSearch = searchByTable[activeTable] ?? "";
  const currentSort = sortByTable[activeTable] ?? { key: "id", direction: "asc" as const };
  const selectedId = selectedIds[activeTable];
  const selectedRecord = currentRows.find((row) => String(row.id) === selectedId) ?? null;

  function buildDraft(tableKey: TableKey, row: Record<string, unknown> | null): Record<string, unknown> {
    if (tableKey === "users") {
      const record = row as UserRecord | null;
      return {
        id: record?.id ?? "",
        username: record?.username ?? "",
        displayName: record?.displayName ?? "",
        role: record?.role ?? "inspector",
        disciplines: record?.disciplines ?? [],
        accessibleProjectIds: record?.accessibleProjectIds ?? [],
        isActive: record ? record.isActive === 1 : true,
        password: ""
      };
    }
    if (tableKey === "projects") {
      const record = row as ProjectRecord | null;
      return {
        id: record?.id ?? "",
        code: record?.code ?? "",
        name: record?.name ?? "",
        status: record?.status ?? "active",
        owner: record?.owner ?? "",
        shipyard: record?.shipyard ?? "",
        class: record?.class ?? "",
        recipientsText: record?.reportRecipients?.join(", ") ?? ""
      };
    }
    if (tableKey === "ships") {
      const record = row as ShipRecord | null;
      return {
        id: record?.id ?? "",
        projectId: record?.projectId ?? projects[0]?.id ?? "",
        hullNumber: record?.hullNumber ?? "",
        shipName: record?.shipName ?? "",
        shipType: record?.shipType ?? "",
        status: record?.status ?? "building"
      };
    }
    if (tableKey === "observation_types") {
      const record = row as ObservationType | null;
      return { id: record?.id ?? "", code: record?.code ?? "", label: record?.label ?? "", sortOrder: String(record?.sortOrder ?? 0) };
    }
    if (tableKey === "observations") {
      const record = row as ObservationAdminRecord | null;
      return {
        id: record?.id ?? "",
        shipId: record?.shipId ?? ships[0]?.id ?? "",
        type: record?.type ?? observationTypes[0]?.code ?? "",
        discipline: record?.discipline ?? "HULL",
        authorId: record?.authorId ?? users[0]?.id ?? "",
        date: record?.date ?? new Date().toISOString().slice(0, 10),
        content: record?.content ?? "",
        status: record?.status ?? "open"
      };
    }
    if (tableKey === "inspection_items") {
      const record = row as InspectionAdminRecord | null;
      return {
        id: record?.id ?? "",
        shipId: ships.find((ship) => ship.hullNumber === record?.hullNumber && ship.shipName === record?.shipName)?.id ?? "",
        itemName: record?.itemName ?? "",
        discipline: record?.discipline ?? "HULL",
        workflowStatus: record?.workflowStatus ?? "pending",
        lastRoundResult: record?.currentResult ?? "",
        resolvedResult: "",
        currentRound: String(record?.currentRound ?? 1),
        source: "manual"
      };
    }
    if (tableKey === "comments") {
      const record = row as AdminCommentRecord | null;
      return {
        id: record?.id ?? "",
        inspectionItemId: record?.inspectionItemId ?? "",
        content: record?.content ?? "",
        status: record?.status ?? "open",
        authorId: record?.authorId ?? users[0]?.id ?? "",
        closedBy: record?.closedBy ?? ""
      };
    }
    return {};
  }

  const currentForm = drafts[activeTable] ?? buildDraft(activeTable, selectedRecord);

  const filteredRows = useMemo(() => {
    const appliedSearch = appliedSearchByTable[activeTable] ?? "";
    const appliedFilters = appliedFiltersByTable[activeTable] ?? {};
    const filtered = currentRows.filter((row) => {
      const matchesSearch =
        !appliedSearch ||
        Object.values(row).some((value) => {
          if (Array.isArray(value)) return value.join(" ").toLowerCase().includes(appliedSearch.toLowerCase());
          return String(value ?? "").toLowerCase().includes(appliedSearch.toLowerCase());
        });
      const matchesFilters = Object.entries(appliedFilters).every(([key, value]) => {
        if (!value) return true;
        const fieldValue = row[key];
        if (Array.isArray(fieldValue)) return fieldValue.map(String).includes(value);
        const fieldStr = String(fieldValue ?? "");
        // 日期筛选使用前缀匹配（value = "2026-04-05"，fieldStr = "2026-04-05T..."）
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return fieldStr.startsWith(value);
        return fieldStr === value;
      });
      return matchesSearch && matchesFilters;
    });

    return [...filtered].sort((left, right) => {
      const leftValue = String(left[currentSort.key] ?? "");
      const rightValue = String(right[currentSort.key] ?? "");
      const order = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
      return currentSort.direction === "asc" ? order : -order;
    });
  }, [appliedFiltersByTable, appliedSearchByTable, activeTable, currentRows, currentSort.direction, currentSort.key]);

  function openRecord(tableKey: TableKey, record: Record<string, unknown>) {
    setSelectedIds((current) => ({ ...current, [tableKey]: String(record.id ?? "") }));
    setDrafts((current) => ({ ...current, [tableKey]: buildDraft(tableKey, record) }));
    setIsCreating((current) => ({ ...current, [tableKey]: false }));
  }

  function openCreate() {
    setSelectedIds((current) => ({ ...current, [activeTable]: "" }));
    setDrafts((current) => ({ ...current, [activeTable]: buildDraft(activeTable, null) }));
    setIsCreating((current) => ({ ...current, [activeTable]: true }));
  }

  function cancelEditor() {
    setDrafts((current) => ({ ...current, [activeTable]: undefined }));
    setIsCreating((current) => ({ ...current, [activeTable]: false }));
  }

  function updateDraft(key: string, value: unknown) {
    setDrafts((current) => ({
      ...current,
      [activeTable]: { ...(current[activeTable] ?? buildDraft(activeTable, selectedRecord)), [key]: value }
    }));
  }

  async function refreshAll() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [metaData, projectData, shipData, userData, typeData, inspectionData] = await Promise.all([
        fetchApiMeta(),
        fetchProjects(),
        fetchShips(),
        fetchUsers(),
        fetchObservationTypes(),
        fetchInspectionList()
      ]);
      setMeta(metaData);
      setProjects(projectData);
      setShips(shipData);
      setUsers(userData);
      setObservationTypes(typeData);
      setInspectionItems(inspectionData.items.map((item) => ({
        ...item,
        shipLabel: `${item.hullNumber} / ${item.shipName}`,
        projectId: shipData.find((s) => s.id === (item as any).shipId)?.projectId ?? "",
        date: String((item as any).plannedDate || (item as any).createdAt || "").substring(0, 10)
      })));

      const [commentData, ...observationLists] = await Promise.all([
        fetchInspectionComments(),
        ...shipData.map(async (ship) => {
          const result = await fetchObservations({ shipId: ship.id });
          const projectCode = projectData.find((project) => project.id === ship.projectId)?.code ?? "";
          return result.map((record) => ({ ...record, shipLabel: `${ship.hullNumber} / ${ship.shipName}`, projectCode }));
        })
      ]);
      setAdminComments(commentData.map((record) => ({
        ...record,
        itemName: record.inspectionItemName
      })));
      setObservations(observationLists.flat());
    } catch (error) {
      setErrorMessage(messageOf(error, "Failed to load admin data."));
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrentRecord() {
    if (currentConfig.status === "coming-soon") return;
    setWorking(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      if (activeTable === "projects") {
        const payload = {
          code: String(currentForm.code ?? ""),
          name: String(currentForm.name ?? ""),
          owner: String(currentForm.owner ?? "").trim() || undefined,
          shipyard: String(currentForm.shipyard ?? "").trim() || undefined,
          class: String(currentForm.class ?? "").trim() || undefined,
          reportRecipients: String(currentForm.recipientsText ?? "").split(",").map((item) => item.trim()).filter(Boolean)
        };
        if (isCreating.projects) await createProject(payload);
        else await updateProject(String(currentForm.id), { ...payload, status: currentForm.status as ProjectRecord["status"] });
      }

      if (activeTable === "ships") {
        const payload = {
          projectId: String(currentForm.projectId ?? ""),
          hullNumber: String(currentForm.hullNumber ?? ""),
          shipName: String(currentForm.shipName ?? ""),
          shipType: String(currentForm.shipType ?? "").trim() || undefined
        };
        if (isCreating.ships) await createShip(payload);
        else await updateShip(String(currentForm.id), { ...payload, status: currentForm.status as ShipRecord["status"] });
      }

      if (activeTable === "users") {
        const payload = {
          username: String(currentForm.username ?? ""),
          displayName: String(currentForm.displayName ?? ""),
          role: currentForm.role as Role,
          disciplines: (currentForm.disciplines ?? []) as Discipline[],
          accessibleProjectIds: (currentForm.accessibleProjectIds ?? []) as string[]
        };
        if (isCreating.users) await createUser({ ...payload, password: String(currentForm.password ?? "") });
        else {
          await updateUser(String(currentForm.id), {
            username: payload.username,
            displayName: payload.displayName,
            role: payload.role,
            disciplines: payload.disciplines,
            accessibleProjectIds: payload.accessibleProjectIds,
            isActive: Boolean(currentForm.isActive)
          });
        }
      }

      if (activeTable === "observation_types") {
        if (isCreating.observation_types) {
          await createObservationType({ code: String(currentForm.code ?? ""), label: String(currentForm.label ?? ""), sortOrder: Number(currentForm.sortOrder ?? 0) });
        } else {
          await updateObservationType(String(currentForm.id), { label: String(currentForm.label ?? ""), sortOrder: Number(currentForm.sortOrder ?? 0) });
        }
      }

      if (activeTable === "observations") {
        if (isCreating.observations) {
          await createObservation(String(currentForm.shipId ?? ""), {
            type: String(currentForm.type ?? ""),
            discipline: String(currentForm.discipline ?? ""),
            date: String(currentForm.date ?? ""),
            content: String(currentForm.content ?? "")
          });
        } else {
          await updateObservation(String(currentForm.id ?? ""), {
            shipId: String(currentForm.shipId ?? ""),
            type: String(currentForm.type ?? ""),
            discipline: String(currentForm.discipline ?? ""),
            date: String(currentForm.date ?? ""),
            content: String(currentForm.content ?? ""),
            status: currentForm.status as "open" | "closed"
          });
        }
      }

      if (activeTable === "inspection_items") {
        const detail = await fetchInspectionDetail(String(currentForm.id ?? ""));
        await updateInspectionItemAdmin(detail.id, {
          shipId: String(currentForm.shipId ?? "") || undefined,
          itemName: String(currentForm.itemName ?? ""),
          discipline: currentForm.discipline as Discipline,
          workflowStatus: String(currentForm.workflowStatus ?? ""),
          lastRoundResult: String(currentForm.lastRoundResult ?? "") || null,
          resolvedResult: String(currentForm.resolvedResult ?? "") || null,
          currentRound: Number(currentForm.currentRound ?? 1),
          source: currentForm.source as "manual" | "n8n"
        });
      }

      if (activeTable === "comments") {
        await updateInspectionCommentAdmin(String(currentForm.inspectionItemId ?? ""), String(currentForm.id ?? ""), {
          authorId: String(currentForm.authorId ?? ""),
          content: String(currentForm.content ?? ""),
          status: currentForm.status as "open" | "closed",
          closedBy: String(currentForm.closedBy ?? "") || null
        });
      }

      await refreshAll();
      cancelEditor();
      setStatusMessage(`${currentConfig.label} saved.`);
    } catch (error) {
      setErrorMessage(messageOf(error, `Failed to save ${currentConfig.label}.`));
    } finally {
      setWorking(false);
    }
  }

  async function deleteCurrentRecord() {
    if (!selectedRecord) return;
    if (activeTable === "comments") {
      if (!window.confirm("Are you sure you want to delete this comment?")) return;
      setWorking(true);
      setErrorMessage(null);
      try {
        await deleteInspectionCommentAdmin(String(selectedRecord.inspectionItemId ?? ""), String(selectedRecord.id ?? ""));
        await refreshAll();
        cancelEditor();
        setStatusMessage("Record deleted.");
      } catch (error) {
        setErrorMessage(messageOf(error, "Failed to delete record."));
      } finally {
        setWorking(false);
      }
    } else if (activeTable === "users") {
      const username = String(selectedRecord.username ?? selectedRecord.id);
      if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
      setWorking(true);
      setErrorMessage(null);
      try {
        await deleteUser(String(selectedRecord.id));
        await refreshAll();
        cancelEditor();
        setStatusMessage("User deleted.");
      } catch (error) {
        setErrorMessage(messageOf(error, "Failed to delete user."));
      } finally {
        setWorking(false);
      }
    }
  }

  function handleSort(key: string) {
    setSortByTable((current) => {
      const existing = current[activeTable];
      if (existing?.key === key) return { ...current, [activeTable]: { key, direction: existing.direction === "asc" ? "desc" : "asc" } };
      return { ...current, [activeTable]: { key, direction: "asc" } };
    });
  }

  const navItems = (Object.keys(tableConfigs) as TableKey[]).map((key) => ({
    key,
    label: tableConfigs[key].label,
    group: tableConfigs[key].group,
    count: tableData[key].length,
    status: tableConfigs[key].status
  }));

  const showEditor = Boolean(currentConfig.formFields && (drafts[activeTable] || selectedRecord || isCreating[activeTable]));
  const canCreate = currentConfig.status !== "coming-soon" && Boolean(currentConfig.formFields);

  return (
    <AdminLayout
      activeKey={activeTable}
      items={navItems}
      metaLine={meta ? `${meta.storageMode.toUpperCase()} | ${Object.keys(tableConfigs).length} tables | ${meta.environment}` : "Loading metadata"}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      onRefresh={() => void refreshAll()}
      onSelect={(key) => {
        setActiveTable(key as TableKey);
        setStatusMessage(null);
        setErrorMessage(null);
      }}
      sidebarFooter={
        <div className="adminSidebarHint">
          <strong>Backend status</strong>
          <span>3 planned admin tables are visible here as placeholders until `/admin/*` routes are implemented.</span>
        </div>
      }
      editor={
        showEditor && currentConfig.formFields ? (
          <RecordEditor
            title={`${isCreating[activeTable] ? "Create" : "Edit"} ${currentConfig.label}`}
            fields={currentConfig.formFields.filter((field) => !(field.key === "password" && !isCreating.users))}
            form={currentForm}
            isEditing={!isCreating[activeTable]}
            canSave={!working}
            canDelete={(activeTable === "comments" || activeTable === "users") && !isCreating[activeTable]}
            onChange={updateDraft}
            onSave={() => void saveCurrentRecord()}
            onDelete={() => void deleteCurrentRecord()}
            onCancel={cancelEditor}
          />
        ) : undefined
      }
    >
      <TableToolbar
        title={currentConfig.label}
        description={currentConfig.description}
        searchValue={currentSearch}
        filters={currentConfig.filters}
        filterValues={currentFilters}
        canCreate={canCreate}
        canExport={filteredRows.length > 0}
        onSearchChange={(value) => setSearchByTable((current) => ({ ...current, [activeTable]: value }))}
        onFilterChange={(key, value) =>
          setFiltersByTable((current) => ({ ...current, [activeTable]: { ...(current[activeTable] ?? {}), [key]: value } }))
        }
        onApplyFilters={() => {
          setAppliedSearchByTable((cur) => ({ ...cur, [activeTable]: searchByTable[activeTable] ?? "" }));
          setAppliedFiltersByTable((cur) => ({ ...cur, [activeTable]: filtersByTable[activeTable] ?? {} }));
        }}
        onCreate={openCreate}
        onExport={() => saveBlob(`${activeTable}.json`, filteredRows)}
      />

      {loading ? (
        <section className="panel adminPanel">
          <div className="emptyState">Loading admin data...</div>
        </section>
      ) : currentConfig.status === "coming-soon" ? (
        <section className="panel adminPanel">
          <div className="emptyState">{currentConfig.description}</div>
        </section>
      ) : (
        <DataTable
          columns={currentConfig.columns}
          data={filteredRows}
          selectedId={selectedId}
          sortKey={currentSort.key}
          sortDirection={currentSort.direction}
          emptyMessage={`No rows in ${currentConfig.label}.`}
          onSelect={(record) => openRecord(activeTable, record)}
          onSort={handleSort}
        />
      )}
    </AdminLayout>
  );
}
