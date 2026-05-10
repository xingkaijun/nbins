/**
 * Frontend-only type definitions for API responses.
 * Types shared between frontend and backend live in @nbins/shared.
 */
import type { Discipline, Role } from "@nbins/shared";
import type { AuthUser } from "../auth";

export interface ApiMeta {
  appName: string;
  environment: string;
  storageMode: "mock" | "d1" | "d1+r2";
  generatedAt: string;
  disciplines: string[];
  routes: string[];
}

export interface ProjectRecord {
  id: string;
  name: string;
  code: string;
  status: "active" | "archived";
  owner: string | null;
  shipyard: string | null;
  class: string | null;
  disciplines: string[];
  reportRecipients: string[];
  ncrRecipients: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ShipRecord {
  id: string;
  projectId: string;
  hullNumber: string;
  shipName: string;
  shipType: string | null;
  status: "building" | "delivered";
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  title?: string | null;
  disciplines: Discipline[];
  accessibleProjectIds: string[];
  isActive: 0 | 1;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}

export interface NcrListFilters {
  projectId?: string;
  shipId?: string;
  status?: string;
  keyword?: string;
}

export interface UploadedMedia {
  key: string;
  filename: string;
  contentType: string;
  size: number;
  variant?: "original" | "medium" | "thumb";
}

export interface UploadMediaOptions {
  baseId?: string;
  variant?: "original" | "medium" | "thumb";
  originalName?: string;
}

export interface FatListFilters {
  projectId?: string;
  shipId?: string;
  keyword?: string;
}
