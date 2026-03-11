import { SqliteClient } from "@persistence";
import { logInfo, logWarn } from "./logger";

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface MigrationRow {
  version: string;
  applied_at_utc: string;
}

function listColumns(sqlite: SqliteClient, tableName: string): string[] {
  const rows = sqlite.db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as TableInfoRow[];
  return rows.map((row) => row.name);
}

function hasColumns(actualColumns: string[], requiredColumns: string[]): boolean {
  return requiredColumns.every((column) => actualColumns.includes(column));
}

export function logDatabaseDiagnostics(sqlite: SqliteClient): void {
  const migrations = sqlite.db
    .prepare("SELECT version, applied_at_utc FROM schema_migrations ORDER BY version ASC")
    .all() as MigrationRow[];

  logInfo(
    `DB diagnostics: migrations=${migrations.map((item) => item.version).join(", ") || "none"}`,
    "db",
  );

  const hourlyColumns = listColumns(sqlite, "aggregate_hourly");
  const dailyColumns = listColumns(sqlite, "aggregate_daily");
  const monthlyColumns = listColumns(sqlite, "aggregate_monthly");

  logInfo(`DB diagnostics: aggregate_hourly columns=${hourlyColumns.join(",")}`, "db");
  logInfo(`DB diagnostics: aggregate_daily columns=${dailyColumns.join(",")}`, "db");
  logInfo(`DB diagnostics: aggregate_monthly columns=${monthlyColumns.join(",")}`, "db");

  const hourlyOk = hasColumns(hourlyColumns, ["year_month"]);
  const dailyOk = hasColumns(dailyColumns, ["hour_of_day", "year_month"]);
  const monthlyOk = hasColumns(monthlyColumns, ["local_date", "hour_of_day", "year_month"]);

  if (!hourlyOk || !dailyOk || !monthlyOk) {
    logWarn(
      `DB diagnostics warning: aggregate schema incomplete hourlyOk=${hourlyOk} dailyOk=${dailyOk} monthlyOk=${monthlyOk}`,
      "db",
    );
  }
}
