import type Database from "better-sqlite3";
import { MeasurementEntity, MeasurementQuery } from "../contracts/PersistenceTypes";
import {
  MeasurementDbRow,
  measurementFromDbRow,
  measurementToDbRow,
} from "../mappers/measurementMapper";

export interface IMeasurementRepository {
  upsertMany(rows: MeasurementEntity[]): void;
  replaceForDataset(datasetId: string, rows: MeasurementEntity[]): void;
  list(query: MeasurementQuery): MeasurementEntity[];
  countByDataset(datasetId: string): number;
  deleteByDataset(datasetId: string): void;
}

export class MeasurementRepository implements IMeasurementRepository {
  constructor(private readonly db: Database.Database) {}

  upsertMany(rows: MeasurementEntity[]): void {
    if (rows.length === 0) {
      return;
    }

    const stmt = this.db.prepare(`
      INSERT INTO measurements (
        id, dataset_id, timestamp_utc_ms, timestamp_iso_utc,
        plant_name, source_time_zone, source_row_index,
        production_w, consumption_w, grid_w, purchasing_w, feed_in_w,
        quality_flags_json
      ) VALUES (
        @id, @dataset_id, @timestamp_utc_ms, @timestamp_iso_utc,
        @plant_name, @source_time_zone, @source_row_index,
        @production_w, @consumption_w, @grid_w, @purchasing_w, @feed_in_w,
        @quality_flags_json
      )
      ON CONFLICT(id) DO UPDATE SET
        dataset_id = excluded.dataset_id,
        timestamp_utc_ms = excluded.timestamp_utc_ms,
        timestamp_iso_utc = excluded.timestamp_iso_utc,
        plant_name = excluded.plant_name,
        source_time_zone = excluded.source_time_zone,
        source_row_index = excluded.source_row_index,
        production_w = excluded.production_w,
        consumption_w = excluded.consumption_w,
        grid_w = excluded.grid_w,
        purchasing_w = excluded.purchasing_w,
        feed_in_w = excluded.feed_in_w,
        quality_flags_json = excluded.quality_flags_json;
    `);

    const tx = this.db.transaction((input: MeasurementEntity[]) => {
      for (const row of input) {
        stmt.run(measurementToDbRow(row));
      }
    });
    tx(rows);
  }

  replaceForDataset(datasetId: string, rows: MeasurementEntity[]): void {
    const tx = this.db.transaction((input: MeasurementEntity[]) => {
      this.db.prepare("DELETE FROM measurements WHERE dataset_id = ?").run(datasetId);
      this.upsertMany(input);
    });
    tx(rows);
  }

  list(query: MeasurementQuery): MeasurementEntity[] {
    const clauses = ["dataset_id = @dataset_id"];
    const params: Record<string, unknown> = { dataset_id: query.datasetId };

    if (query.fromUtcMs !== undefined) {
      clauses.push("timestamp_utc_ms >= @from_utc_ms");
      params.from_utc_ms = query.fromUtcMs;
    }
    if (query.toUtcMs !== undefined) {
      clauses.push("timestamp_utc_ms <= @to_utc_ms");
      params.to_utc_ms = query.toUtcMs;
    }

    const limitClause = query.limit ? "LIMIT @limit" : "";
    const offsetClause = query.offset ? "OFFSET @offset" : "";
    if (query.limit) {
      params.limit = query.limit;
    }
    if (query.offset) {
      params.offset = query.offset;
    }

    const sql = `
      SELECT * FROM measurements
      WHERE ${clauses.join(" AND ")}
      ORDER BY timestamp_utc_ms ASC
      ${limitClause} ${offsetClause}
    `;

    const dbRows = this.db.prepare(sql).all(params) as MeasurementDbRow[];
    return dbRows.map(measurementFromDbRow);
  }

  countByDataset(datasetId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(1) AS c FROM measurements WHERE dataset_id = ?")
      .get(datasetId) as { c: number };
    return row?.c ?? 0;
  }

  deleteByDataset(datasetId: string): void {
    this.db.prepare("DELETE FROM measurements WHERE dataset_id = ?").run(datasetId);
  }
}

