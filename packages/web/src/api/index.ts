/**
 * Barrel file for all API services.
 * This preserves backwards compatibility with existing imports like `import { fetchProjects } from "../api"`.
 */
export * from "./types";
export * from "./client";
export * from "./auth";
export * from "./inspections";
export * from "./observations";
export * from "./ncrs";
export * from "./fats";
export * from "./media";
export * from "./projects";
export * from "./ships";
export * from "./users";
export * from "./sql-console";
