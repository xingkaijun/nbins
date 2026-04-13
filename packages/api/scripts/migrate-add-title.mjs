#!/usr/bin/env node
/**
 * Migration script to add title column to users table
 * Run this script to update your local D1 database
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = resolve(__dirname, "../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/240b0ce6ea6ea56bba2d928988fc4c237fcf73081b5140cf6fb353d80d4ee2be.sqlite");

async function migrate() {
  console.log("🔄 Adding title column to users table...");
  
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(DB_PATH);
    
    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const hasTitle = tableInfo.some(col => col.name === "title");
    
    if (hasTitle) {
      console.log("✅ Title column already exists, skipping migration");
      db.close();
      return;
    }
    
    // Add the column
    db.prepare("ALTER TABLE users ADD COLUMN title TEXT").run();
    
    console.log("✅ Successfully added title column to users table");
    db.close();
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

migrate();
