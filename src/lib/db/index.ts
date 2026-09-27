import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { MIGRATIONS } from "./schema";
import { loadEnv } from "@/lib/env";

export type { DatabaseSync };

const DEFAULTS: { dataDir: string; dbPath?: string } = {
  dataDir: join(process.cwd(), "data"),
  dbPath: undefined,
};

export function resolveDbConfig() {
  const env = loadEnv();
  const overrides = (globalThis as any).__COMMOS_DB_OVERRIDES as
    | Partial<typeof DEFAULTS>
    | undefined;
  const dataDir = overrides?.dataDir ?? env.COMMOS_DATA_DIR ?? DEFAULTS.dataDir;
  if (overrides?.dbPath) return { dataDir, dbPath: overrides.dbPath };
  if (env.COMMOS_DB_PATH) return { dataDir, dbPath: env.COMMOS_DB_PATH };
  return { dataDir, dbPath: join(dataDir, "commos.db") };
}

let _db: DatabaseSync | null = null;
let _dbConfig: { dataDir: string; dbPath: string } | null = null;

/**
 * COM mOS database singleton. Switch the backing store for tests by calling
 * `setDbOverride({ dbPath })` or by setting COMMOS_DATA_DIR before first use.
 */
export function getDb(): DatabaseSync {
  if (_db) return _db;
  const cfg = resolveDbConfig();
  mkdirSync(dirname(cfg.dbPath), { recursive: true });
  const db = new DatabaseSync(cfg.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  _db = db;
  _dbConfig = cfg;
  runMigrations(db);
  return db;
}

/** Reconfigure the DB path. Must be called before any DB access. */
export function setDbOverride(partial: Partial<typeof DEFAULTS>) {
  (globalThis as any).__COMMOS_DB_OVERRIDES = {
    ...((globalThis as any).__COMMOS_DB_OVERRIDES ?? {}),
    ...partial,
  };
}

export function getDbConfig() {
  return _dbConfig ?? resolveDbConfig();
}

export function runMigrations(db: DatabaseSync) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id TEXT PRIMARY KEY,
       applied_at INTEGER NOT NULL
     );`
  );
  const appliedRows = db.prepare("SELECT id FROM schema_migrations").all() as Array<{
    id: string;
  }>;
  const applied = new Set(appliedRows.map((r) => r.id));
  const tx = db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)");
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    const begin = db.prepare("BEGIN");
    begin.run();
    try {
      db.exec(m.up);
      tx.run(m.id, Date.now());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function closeDb() {
  if (_db) {
    try {
      _db.close();
    } catch {
      /* noop */
    }
    _db = null;
  }
}

/** True when the data file already exists on disk (used for seeding decision). */
export function dbFileExists() {
  const cfg = resolveDbConfig();
  return existsSync(cfg.dbPath);
}