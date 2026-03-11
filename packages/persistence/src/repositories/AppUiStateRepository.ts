import type Database from "better-sqlite3";
import { AppUiStateEntity } from "../contracts/PersistenceTypes";

interface AppUiStateDbRow {
  active_dataset_id: string | null;
  filters_json: string;
  updated_at_utc: string;
}

function parseFilters(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export class AppUiStateRepository {
  constructor(private readonly db: Database.Database) {}

  get(): AppUiStateEntity {
    const row = this.db
      .prepare(
        `
          SELECT active_dataset_id, filters_json, updated_at_utc
          FROM app_ui_state
          WHERE state_id = 1
          LIMIT 1
        `,
      )
      .get() as AppUiStateDbRow | undefined;

    if (!row) {
      throw new Error("App UI state row is missing. Check migrations.");
    }

    return {
      activeDatasetId: row.active_dataset_id,
      filters: parseFilters(row.filters_json),
      updatedAtUtc: row.updated_at_utc,
    };
  }

  upsert(next: { activeDatasetId: string | null; filters: Record<string, unknown> }): AppUiStateEntity {
    const updatedAtUtc = new Date().toISOString();
    this.db
      .prepare(
        `
          INSERT INTO app_ui_state (
            state_id, active_dataset_id, filters_json, updated_at_utc
          ) VALUES (
            1, @active_dataset_id, @filters_json, @updated_at_utc
          )
          ON CONFLICT(state_id) DO UPDATE SET
            active_dataset_id = excluded.active_dataset_id,
            filters_json = excluded.filters_json,
            updated_at_utc = excluded.updated_at_utc
        `,
      )
      .run({
        active_dataset_id: next.activeDatasetId,
        filters_json: JSON.stringify(next.filters ?? {}),
        updated_at_utc: updatedAtUtc,
      });

    return {
      activeDatasetId: next.activeDatasetId,
      filters: next.filters,
      updatedAtUtc,
    };
  }
}
