import { randomUUID } from "node:crypto";
import {
  ImportValidationIssue,
  MappedRawRow,
  NormalizedMeasurementRow,
  QualitySeverity,
  ValidationCode,
} from "../contracts/ImportResult";
import { parseNumericValue } from "../parsing/parseNumericValues";
import { parseTimeZone, parseUpdatedTime } from "../parsing/parseTimestamps";

export interface NormalizeMeasurementRowContext {
  datasetId: string;
  defaultTimeZoneRaw?: string | null;
}

export interface NormalizeMeasurementRowResult {
  row: NormalizedMeasurementRow | null;
  issues: ImportValidationIssue[];
  invalidNumericCells: number;
}

function parseMetric(
  value: unknown,
  rowIndex: number,
  columnName: string,
  issues: ImportValidationIssue[],
): { value: number | null; invalidNumericCells: number; invalid: boolean } {
  const parsed = parseNumericValue(value);
  if (!parsed.error) {
    return { value: parsed.value, invalidNumericCells: 0, invalid: false };
  }

  issues.push({
    code: ValidationCode.InvalidNumeric,
    severity: QualitySeverity.Warning,
    rowIndex,
    columnName,
    message: parsed.error,
    rawValue: value === undefined ? null : (value as string | number | null),
  });

  return { value: null, invalidNumericCells: 1, invalid: true };
}

export function normalizeMeasurementRow(
  mapped: MappedRawRow,
  context: NormalizeMeasurementRowContext,
): NormalizeMeasurementRowResult {
  const issues: ImportValidationIssue[] = [];

  const parsedTimeZone = parseTimeZone(mapped.timeZoneRaw ?? context.defaultTimeZoneRaw ?? null);
  const parsedTimestamp = parseUpdatedTime(mapped.updatedTimeRaw, parsedTimeZone.offsetMinutes);

  if (parsedTimestamp.timestampUtcMs === null || !parsedTimestamp.timestampIsoUtc) {
    issues.push({
      code: ValidationCode.InvalidTimestamp,
      severity: QualitySeverity.Error,
      rowIndex: mapped.rowIndex,
      columnName: "Updated Time",
      message: parsedTimestamp.error ?? "Timestamp parsing failed.",
      rawValue:
        mapped.updatedTimeRaw === undefined
          ? null
          : (mapped.updatedTimeRaw as string | number | null),
    });

    return { row: null, issues, invalidNumericCells: 0 };
  }

  let invalidNumericCells = 0;
  const qualityFlags: ValidationCode[] = [];

  const production = parseMetric(
    mapped.productionPowerRaw,
    mapped.rowIndex,
    "Production Power(W)",
    issues,
  );
  const consumption = parseMetric(
    mapped.consumptionPowerRaw,
    mapped.rowIndex,
    "Consumption Power(W)",
    issues,
  );
  const grid = parseMetric(mapped.gridPowerRaw, mapped.rowIndex, "Grid Power(W)", issues);
  const purchasing = parseMetric(
    mapped.purchasingPowerRaw,
    mapped.rowIndex,
    "Purchasing Power(W)",
    issues,
  );
  const feedIn = parseMetric(
    mapped.feedInPowerRaw,
    mapped.rowIndex,
    "Feed-in Power(W)",
    issues,
  );

  const metricResults = [production, consumption, grid, purchasing, feedIn];
  invalidNumericCells = metricResults.reduce((sum, m) => sum + m.invalidNumericCells, 0);

  if (invalidNumericCells > 0) {
    qualityFlags.push(ValidationCode.InvalidNumeric);
  }

  const row: NormalizedMeasurementRow = {
    id: randomUUID(),
    datasetId: context.datasetId,
    plantName: mapped.plantName?.trim() || null,
    timestampUtcMs: parsedTimestamp.timestampUtcMs,
    timestampIsoUtc: parsedTimestamp.timestampIsoUtc,
    sourceTimeZone: parsedTimeZone.normalized,
    sourceRowIndex: mapped.rowIndex,
    productionW: production.value,
    consumptionW: consumption.value,
    gridW: grid.value,
    purchasingW: purchasing.value,
    feedInW: feedIn.value,
    qualityFlags,
  };

  return { row, issues, invalidNumericCells };
}
