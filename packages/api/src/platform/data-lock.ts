import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** Resolve existing ancestors as well, so symlink aliases share the same lock. */
function canonicalPath(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  return join(canonicalPath(parent), basename(absolute));
}

interface LockOwner {
  token: string;
  pid: number;
  operation: string;
  startedAt: string;
}

/**
 * True when a process with this PID is still running. `EPERM` means it exists
 * but belongs to another user, which still counts as alive.
 */
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readOwner(lockPath: string): LockOwner | null {
  try {
    const owner = JSON.parse(readFileSync(join(lockPath, "owner.json"), "utf8")) as Partial<LockOwner>;
    return typeof owner.token === "string" && typeof owner.pid === "number"
      ? (owner as LockOwner)
      : null;
  } catch {
    return null;
  }
}

/**
 * Removes a lock whose owner process is gone (killed with SIGKILL, terminal
 * closed, crashed before the exit hook ran). Without this a single hard kill
 * makes every later command fail until someone deletes the directory by hand.
 *
 * Racing reclaimers are safe: the rename is atomic, so exactly one process
 * wins the stale lock and the others see EEXIST again and re-evaluate the new
 * owner (a live process, which they then report as DATA_LOCKED).
 */
function reclaimStaleLock(lockPath: string, stale: LockOwner | null): boolean {
  const nudge = `${lockPath}.stale-${process.pid}-${randomUUID()}`;
  try {
    renameSync(lockPath, nudge);
  } catch {
    return false;
  }
  try {
    const moved = readOwner(nudge);
    // A live owner may have replaced the directory between our read and rename.
    if (moved && isProcessAlive(moved.pid)) {
      renameSync(nudge, lockPath);
      return false;
    }
    console.error(
      `Reclaimed stale data lock ${lockPath}` +
        (stale ? ` (pid ${stale.pid}, ${stale.operation}, started ${stale.startedAt} is no longer running)` : "")
    );
    return true;
  } catch {
    return false;
  } finally {
    rmSync(nudge, { recursive: true, force: true });
  }
}

/**
 * Exclusive ownership of the database AND file store. Full backups must run
 * with the server stopped: a SQLite snapshot alone cannot snapshot object files.
 * A lock left by a dead process is reclaimed automatically; a lock held by a
 * live process is never taken over, so concurrent writers stay impossible.
 */
export function acquireDataLock(dbPath: string, storageDir: string, operation: string): () => void {
  const token = randomUUID();
  const paths = [...new Set([canonicalPath(dbPath), canonicalPath(storageDir)])]
    .map((path) => `${path}.nbins-lock`).sort();
  const held: string[] = [];
  const release = () => {
    for (const path of [...held].reverse()) {
      const ownerPath = join(path, "owner.json");
      try {
        if ((JSON.parse(readFileSync(ownerPath, "utf8")) as { token: string }).token !== token) continue;
        unlinkSync(ownerPath);
        rmdirSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`Could not release data lock ${path}: ${String(error)}`);
        }
      }
    }
    held.length = 0;
  };
  try {
    for (const path of paths) {
      mkdirSync(dirname(path), { recursive: true });
      for (let attempt = 0; ; attempt += 1) {
        try {
          mkdirSync(path);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          // An owner.json that is missing or half-written belongs to a process
          // that is still arriving; give it a moment before calling it stale.
          const owner = readOwner(path);
          const stale = owner ? !isProcessAlive(owner.pid) : attempt > 0;
          if (stale && reclaimStaleLock(path, owner)) continue;
          if (!owner && attempt === 0) continue;
          throw new Error(`DATA_LOCKED: ${path}. Stop the nbins server and other maintenance commands before ${operation}.`);
        }
      }
      try {
        writeFileSync(join(path, "owner.json"), JSON.stringify({ token, pid: process.pid, operation, startedAt: new Date().toISOString() }), { flag: "wx" });
      } catch (error) {
        rmdirSync(path);
        throw error;
      }
      held.push(path);
    }
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
