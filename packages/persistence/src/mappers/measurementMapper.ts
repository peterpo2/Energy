import { MeasurementEntity } from "../contracts/PersistenceTypes";

export interface MeasurementDbRow {
  id: string;
  dataset_id: string;
  timestamp_utc_ms: number;
  timestamp_iso_utc: string;
  plant_name: string | null;
  source_time_zone: string | null;
  source_row_index: number;
  production_w: number | null;
  consumption_w: number | null;
  grid_w: number | null;
  purchasing_w: number | null;
  feed_in_w: number | null;
  quality_flags_json: string;
}

export function measurementToDbRow(entity: MeasurementEntity): MeasurementDbRow {
  return {
    id: entity.id,
    dataset_id: entity.datasetId,
    timestamp_utc_ms: entity.timestampUtcMs,
    timestamp_iso_utc: entity.timestampIsoUtc,
    plant_name: entity.plantName,
    source_time_zone: entity.sourceTimeZone,
    source_row_index: entity.sourceRowIndex,
    production_w: entity.productionW,
    consumption_w: entity.consumptionW,
    grid_w: entity.gridW,
    purchasing_w: entity.purchasingW,
    feed_in_w: entity.feedInW,
    quality_flags_json: JSON.stringify(entity.qualityFlags ?? []),
  };
}

export function measurementFromDbRow(row: MeasurementDbRow): MeasurementEntity {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    timestampUtcMs: row.timestamp_utc_ms,
    timestampIsoUtc: row.timestamp_iso_utc,
    plantName: row.plant_name,
    sourceTimeZone: row.source_time_zone,
    sourceRowIndex: row.source_row_index,
    productionW: row.production_w,
    consumptionW: row.consumption_w,
    gridW: row.grid_w,
    purchasingW: row.purchasing_w,
    feedInW: row.feed_in_w,
    qualityFlags: safeJsonArray(row.quality_flags_json),
  };
}

function safeJsonArray(input: string): string[] {
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

