import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SqliteClientOptions } from "../contracts/PersistenceTypes";
import { applyPragmas } from "./pragma";

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      applied_at_utc TEXT NOT NULL
    );
  `);
}

function getDefaultMigrationsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "packages", "persistence", "src", "db", "migrations"),
    path.resolve(process.cwd(), "..", "..", "packages", "persistence", "src", "db", "migrations"),
    path.resolve(__dirname, "..", "migrations"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Migrations directory not found. Checked: ${candidates.join(" | ")}`);
  }
  return found;
}

function runMigrations(db: Database.Database, migrationsDir: string): void {
  ensureMigrationsTable(db);

  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  const appliedRows = db
    .prepare("SELECT version FROM schema_migrations")
    .all() as Array<{ version: string }>;
  const applied = new Set(appliedRows.map((r) => r.version));

  const insertMigration = db.prepare(
    "INSERT INTO schema_migrations(version, applied_at_utc) VALUES (?, ?)",
  );

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    // SQL migration files can contain their own BEGIN/COMMIT blocks.
    // Do not wrap them in an additional JS transaction.
    db.exec(sql);
    insertMigration.run(file, new Date().toISOString());
  }
}

export interface SqliteClient {
  db: Database.Database;
  close: () => void;
}

export function createSqliteClient(options: SqliteClientOptions): SqliteClient {
  if (!options.dbPath) {
    throw new Error("dbPath is required.");
  }

  const dir = path.dirname(options.dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(options.dbPath, {
    readonly: Boolean(options.readOnly),
    fileMustExist: Boolean(options.readOnly),
  });

  applyPragmas(db);

  if (!options.readOnly) {
    runMigrations(db, options.migrationsDir ?? getDefaultMigrationsDir());
  }

  return {
    db,
    close: () => db.close(),
  };
}
