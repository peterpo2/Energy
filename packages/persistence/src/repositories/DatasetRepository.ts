import type Database from "better-sqlite3";
import { DatasetEntity, DatasetListQuery } from "../contracts/PersistenceTypes";

interface DatasetDbRow {
  dataset_id: string;
  source_file_path: string;
  source_file_name: string;
  source_file_hash: string;
  selected_worksheet_name: string;
  selected_worksheet_index: number;
  plant_name: string | null;
  detected_time_zone: string | null;
  imported_at_utc: string;
  first_timestamp_utc_ms: number | null;
  last_timestamp_utc_ms: number | null;
  row_count_raw: number;
  row_count_normalized: number;
}

function toEntity(row: DatasetDbRow): DatasetEntity {
  return {
    datasetId: row.dataset_id,
    sourceFilePath: row.source_file_path,
    sourceFileName: row.source_file_name,
    sourceFileHash: row.source_file_hash,
    selectedWorksheetName: row.selected_worksheet_name,
    selectedWorksheetIndex: row.selected_worksheet_index,
    plantName: row.plant_name,
    detectedTimeZone: row.detected_time_zone,
    importedAtUtc: row.imported_at_utc,
    firstTimestampUtcMs: row.first_timestamp_utc_ms,
    lastTimestampUtcMs: row.last_timestamp_utc_ms,
    rowCountRaw: row.row_count_raw,
    rowCountNormalized: row.row_count_normalized,
  };
}

export interface IDatasetRepository {
  upsert(dataset: DatasetEntity): void;
  getById(datasetId: string): DatasetEntity | null;
  findBySourceFileHash(sourceFileHash: string): DatasetEntity | null;
  list(query?: DatasetListQuery): DatasetEntity[];
  deleteById(datasetId: string): void;
}

export class DatasetRepository implements IDatasetRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(dataset: DatasetEntity): void {
    const stmt = this.db.prepare(`
      INSERT INTO datasets (
        dataset_id, source_file_path, source_file_name, source_file_hash,
        selected_worksheet_name, selected_worksheet_index,
        plant_name, detected_time_zone, imported_at_utc,
        first_timestamp_utc_ms, last_timestamp_utc_ms,
        row_count_raw, row_count_normalized
      ) VALUES (
        @dataset_id, @source_file_path, @source_file_name, @source_file_hash,
        @selected_worksheet_name, @selected_worksheet_index,
        @plant_name, @detected_time_zone, @imported_at_utc,
        @first_timestamp_utc_ms, @last_timestamp_utc_ms,
        @row_count_raw, @row_count_normalized
      )
      ON CONFLICT(dataset_id) DO UPDATE SET
        source_file_path = excluded.source_file_path,
        source_file_name = excluded.source_file_name,
        source_file_hash = excluded.source_file_hash,
        selected_worksheet_name = excluded.selected_worksheet_name,
        selected_worksheet_index = excluded.selected_worksheet_index,
        plant_name = excluded.plant_name,
        detected_time_zone = excluded.detected_time_zone,
        imported_at_utc = excluded.imported_at_utc,
        first_timestamp_utc_ms = excluded.first_timestamp_utc_ms,
        last_timestamp_utc_ms = excluded.last_timestamp_utc_ms,
        row_count_raw = excluded.row_count_raw,
        row_count_normalized = excluded.row_count_normalized;
    `);

    stmt.run({
      dataset_id: dataset.datasetId,
      source_file_path: dataset.sourceFilePath,
      source_file_name: dataset.sourceFileName,
      source_file_hash: dataset.sourceFileHash,
      selected_worksheet_name: dataset.selectedWorksheetName,
      selected_worksheet_index: dataset.selectedWorksheetIndex,
      plant_name: dataset.plantName,
      detected_time_zone: dataset.detectedTimeZone,
      imported_at_utc: dataset.importedAtUtc,
      first_timestamp_utc_ms: dataset.firstTimestampUtcMs,
      last_timestamp_utc_ms: dataset.lastTimestampUtcMs,
      row_count_raw: dataset.rowCountRaw,
      row_count_normalized: dataset.rowCountNormalized,
    });
  }

  getById(datasetId: string): DatasetEntity | null {
    const row = this.db
      .prepare("SELECT * FROM datasets WHERE dataset_id = ?")
      .get(datasetId) as DatasetDbRow | undefined;
    return row ? toEntity(row) : null;
  }

  findBySourceFileHash(sourceFileHash: string): DatasetEntity | null {
    const row = this.db
      .prepare(
        "SELECT * FROM datasets WHERE source_file_hash = ? ORDER BY imported_at_utc DESC LIMIT 1",
      )
      .get(sourceFileHash) as DatasetDbRow | undefined;
    return row ? toEntity(row) : null;
  }

  list(query?: DatasetListQuery): DatasetEntity[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (query?.plantName) {
      clauses.push("plant_name = @plant_name");
      params.plant_name = query.plantName;
    }
    if (query?.sourceFileHash) {
      clauses.push("source_file_hash = @source_file_hash");
      params.source_file_hash = query.sourceFileHash;
    }
    if (query?.importedAfterUtc) {
      clauses.push("imported_at_utc >= @imported_after_utc");
      params.imported_after_utc = query.importedAfterUtc;
    }
    if (query?.importedBeforeUtc) {
      clauses.push("imported_at_utc <= @imported_before_utc");
      params.imported_before_utc = query.importedBeforeUtc;
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause = query?.limit ? "LIMIT @limit" : "";
    const offsetClause = query?.offset ? "OFFSET @offset" : "";
    if (query?.limit) {
      params.limit = query.limit;
    }
    if (query?.offset) {
      params.offset = query.offset;
    }

    const sql = `
      SELECT * FROM datasets
      ${whereClause}
      ORDER BY imported_at_utc DESC
      ${limitClause} ${offsetClause}
    `;

    const rows = this.db.prepare(sql).all(params) as DatasetDbRow[];
    return rows.map(toEntity);
  }

  deleteById(datasetId: string): void {
    this.db.prepare("DELETE FROM datasets WHERE dataset_id = ?").run(datasetId);
  }
}

