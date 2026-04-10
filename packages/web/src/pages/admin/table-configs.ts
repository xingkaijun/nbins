import type { ReactNode } from "react";

export type AdminGroupKey = "core" | "inspection" | "observation" | "member";

export interface AdminColumn<TRecord> {
  key: keyof TRecord | string;
  label: string;
  sortable?: boolean;
  render?: (record: TRecord) => ReactNode;
}

export interface AdminFilter {
  key: string;
  label: string;
  type: "select" | "date";
  options?: Array<{ value: string; label: string }>;
}

export interface AdminFormField {
  key: string;
  label: string;
  type: "text" | "select" | "textarea" | "tags" | "date" | "boolean" | "readonly" | "number" | "password";
  required?: boolean;
  disabledOnEdit?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export interface AdminTableConfig<TRecord> {
  key: string;
  label: string;
  group: AdminGroupKey;
  description: string;
  status?: "active" | "coming-soon";
  columns: Array<AdminColumn<TRecord>>;
  filters?: AdminFilter[];
  formFields?: AdminFormField[];
  rowLabel?: (record: TRecord) => string;
}

export const ADMIN_GROUPS: Array<{ key: AdminGroupKey; label: string }> = [
  { key: "core", label: "Core Data" },
  { key: "inspection", label: "Inspection Data" },
  { key: "observation", label: "Observation Data" },
  { key: "member", label: "Project Members" }
];
