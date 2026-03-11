import type Database from "better-sqlite3";
import { AggregateEntity, AggregateQuery } from "../contracts/PersistenceTypes";
import { AggregateDbRow, aggregateFromDbRow, aggregateToDbRow } from "../mappers/aggregateMapper";

type AggregateTable = "aggregate_hourly" | "aggregate_daily" | "aggregate_monthly";

export interface IAggregateRepository {
  replaceHourly(datasetId: string, rows: AggregateEntity[]): void;
  replaceDaily(datasetId: string, rows: AggregateEntity[]): void;
  replaceMonthly(datasetId: string, rows: AggregateEntity[]): void;
  listHourly(query: AggregateQuery): AggregateEntity[];
  listDaily(query: AggregateQuery): AggregateEntity[];
  listMonthly(query: AggregateQuery): AggregateEntity[];
  deleteByDataset(datasetId: string): void;
}

function buildWhereClause(query: AggregateQuery, params: Record<string, unknown>): string {
  const clauses = ["dataset_id = @dataset_id"];
  params.dataset_id = query.datasetId;

  if (query.fromBucketStartUtcMs !== undefined) {
    clauses.push("bucket_start_utc_ms >= @from_bucket_start_utc_ms");
    params.from_bucket_start_utc_ms = query.fromBucketStartUtcMs;
  }
  if (query.toBucketStartUtcMs !== undefined) {
    clauses.push("bucket_start_utc_ms <= @to_bucket_start_utc_ms");
    params.to_bucket_start_utc_ms = query.toBucketStartUtcMs;
  }
  if (query.bucketKeyPrefix) {
    clauses.push("bucket_key LIKE @bucket_key_prefix");
    params.bucket_key_prefix = `${query.bucketKeyPrefix}%`;
  }

  return clauses.join(" AND ");
}

export class AggregateRepository implements IAggregateRepository {
  constructor(private readonly db: Database.Database) {}

  replaceHourly(datasetId: string, rows: AggregateEntity[]): void {
    this.replaceForTable("aggregate_hourly", datasetId, rows);
  }

  replaceDaily(datasetId: string, rows: AggregateEntity[]): void {
    this.replaceForTable("aggregate_daily", datasetId, rows);
  }

  replaceMonthly(datasetId: string, rows: AggregateEntity[]): void {
    this.replaceForTable("aggregate_monthly", datasetId, rows);
  }

  listHourly(query: AggregateQuery): AggregateEntity[] {
    return this.listFromTable("aggregate_hourly", query);
  }

  listDaily(query: AggregateQuery): AggregateEntity[] {
    return this.listFromTable("aggregate_daily", query);
  }

  listMonthly(query: AggregateQuery): AggregateEntity[] {
    return this.listFromTable("aggregate_monthly", query);
  }

  deleteByDataset(datasetId: string): void {
    this.db.prepare("DELETE FROM aggregate_hourly WHERE dataset_id = ?").run(datasetId);
    this.db.prepare("DELETE FROM aggregate_daily WHERE dataset_id = ?").run(datasetId);
    this.db.prepare("DELETE FROM aggregate_monthly WHERE dataset_id = ?").run(datasetId);
  }

  private replaceForTable(
    table: AggregateTable,
    datasetId: string,
    rows: AggregateEntity[],
  ): void {
    const tx = this.db.transaction((inputRows: AggregateEntity[]) => {
      this.db.prepare(`DELETE FROM ${table} WHERE dataset_id = ?`).run(datasetId);
      this.upsertManyForTable(table, inputRows);
    });
    tx(rows);
  }

  private upsertManyForTable(table: AggregateTable, rows: AggregateEntity[]): void {
    if (rows.length === 0) {
      return;
    }

    const sql = `
      INSERT INTO ${table} (
        dataset_id, bucket_key, bucket_start_utc_ms,
        local_date, hour_of_day, year_month,
        metrics_json, expected_samples, unique_timestamp_count,
        completeness_ratio, duplicate_count, gap_count, metadata_json
      ) VALUES (
        @dataset_id, @bucket_key, @bucket_start_utc_ms,
        @local_date, @hour_of_day, @year_month,
        @metrics_json, @expected_samples, @unique_timestamp_count,
        @completeness_ratio, @duplicate_count, @gap_count, @metadata_json
      )
      ON CONFLICT(dataset_id, bucket_key) DO UPDATE SET
        bucket_start_utc_ms = excluded.bucket_start_utc_ms,
        local_date = excluded.local_date,
        hour_of_day = excluded.hour_of_day,
        year_month = excluded.year_month,
        metrics_json = excluded.metrics_json,
        expected_samples = excluded.expected_samples,
        unique_timestamp_count = excluded.unique_timestamp_count,
        completeness_ratio = excluded.completeness_ratio,
        duplicate_count = excluded.duplicate_count,
        gap_count = excluded.gap_count,
        metadata_json = excluded.metadata_json;
    `;
    const stmt = this.db.prepare(sql);

    const tx = this.db.transaction((inputRows: AggregateEntity[]) => {
      for (const row of inputRows) {
        const mapped = aggregateToDbRow(row);
        stmt.run({
          dataset_id: mapped.dataset_id,
          bucket_key: mapped.bucket_key,
          bucket_start_utc_ms: mapped.bucket_start_utc_ms,
          local_date: mapped.local_date,
          hour_of_day: mapped.hour_of_day,
          year_month: mapped.year_month,
          metrics_json: mapped.metrics_json,
          expected_samples: mapped.expected_samples,
          unique_timestamp_count: mapped.unique_timestamp_count,
          completeness_ratio: mapped.completeness_ratio,
          duplicate_count: mapped.duplicate_count,
          gap_count: mapped.gap_count,
          metadata_json: mapped.metadata_json,
        });
      }
    });
    tx(rows);
  }

  private listFromTable(table: AggregateTable, query: AggregateQuery): AggregateEntity[] {
    const params: Record<string, unknown> = {};
    const whereClause = buildWhereClause(query, params);

    const sql = `
      SELECT
        dataset_id,
        bucket_key,
        bucket_start_utc_ms,
        local_date,
        hour_of_day,
        year_month,
        metrics_json,
        expected_samples,
        unique_timestamp_count,
        completeness_ratio,
        duplicate_count,
        gap_count,
        metadata_json
      FROM ${table}
      WHERE ${whereClause}
      ORDER BY bucket_start_utc_ms ASC
    `;
    const rows = this.db.prepare(sql).all(params) as AggregateDbRow[];
    return rows.map(aggregateFromDbRow);
  }
}

