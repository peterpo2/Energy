import { basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { ImportRequest } from "../contracts/ImportRequest";
import {
  DatasetMetadata,
  DuplicateTimestampGroup,
  ImportResult,
  ImportValidationIssue,
  MissingIntervalRange,
  NormalizedMeasurementRow,
  QualitySeverity,
  RawImportedRow,
  ValidationCode,
} from "../contracts/ImportResult";
import { mapSolarmanColumns } from "../mapping/mapSolarmanColumns";
import { normalizeHeaders } from "../mapping/normalizeHeaders";
import { selectWorksheet } from "../reader/selectWorksheet";
import { readWorkbook } from "../reader/readWorkbook";
import { normalizeMeasurementRow } from "./normalizeMeasurementRow";
import { validateRequiredColumns } from "../validation/validateRequiredColumns";
import { validateRowShape } from "../validation/validateRowShape";

type WorksheetRow = unknown[];

function computeFileHash(filePath: string): string {
  const bytes = readFileSync(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function pickCell(row: WorksheetRow, index: number | undefined): unknown {
  if (index === undefined) {
    return undefined;
  }
  return row[index];
}

function toMappedRawRow(row: WorksheetRow, rowIndex: number, columnMap: ReturnType<typeof mapSolarmanColumns>["columnMap"]) {
  return {
    rowIndex,
    plantName: pickCell(row, columnMap.plantName) as string | null | undefined,
    updatedTimeRaw: pickCell(row, columnMap.updatedTime) as string | number | Date | null | undefined,
    timeZoneRaw: pickCell(row, columnMap.timeZone) as string | null | undefined,
    productionPowerRaw: pickCell(row, columnMap.productionPower) as string | number | null | undefined,
    consumptionPowerRaw: pickCell(row, columnMap.consumptionPower) as string | number | null | undefined,
    gridPowerRaw: pickCell(row, columnMap.gridPower) as string | number | null | undefined,
    purchasingPowerRaw: pickCell(row, columnMap.purchasingPower) as string | number | null | undefined,
    feedInPowerRaw: pickCell(row, columnMap.feedInPower) as string | number | null | undefined,
  };
}

function toRawImportedRow(
  row: WorksheetRow,
  rowIndex: number,
  sourceFileName: string,
  headerRow: unknown[],
): RawImportedRow {
  const raw: RawImportedRow["raw"] = {};

  for (let i = 0; i < headerRow.length; i += 1) {
    const header = headerRow[i] === null || headerRow[i] === undefined ? `column_${i}` : String(headerRow[i]).trim();
    raw[header || `column_${i}`] = (row[i] as
      | string
      | number
      | boolean
      | Date
      | null
      | undefined);
  }

  return {
    rowIndex,
    sourceFileName,
    raw,
  };
}

function detectDuplicateTimestampGroups(rows: NormalizedMeasurementRow[]): DuplicateTimestampGroup[] {
  const byTimestamp = new Map<number, number[]>();
  for (const row of rows) {
    if (!byTimestamp.has(row.timestampUtcMs)) {
      byTimestamp.set(row.timestampUtcMs, []);
    }
    byTimestamp.get(row.timestampUtcMs)?.push(row.sourceRowIndex);
  }

  const groups: DuplicateTimestampGroup[] = [];
  for (const [timestampUtcMs, rowIndices] of byTimestamp.entries()) {
    if (rowIndices.length > 1) {
      groups.push({ timestampUtcMs, rowIndices, count: rowIndices.length });
    }
  }

  return groups.sort((a, b) => a.timestampUtcMs - b.timestampUtcMs);
}

function detectMissingIntervals(
  rows: NormalizedMeasurementRow[],
  expectedStepMinutes: number,
): MissingIntervalRange[] {
  const uniqueSortedTimestamps = Array.from(new Set(rows.map((r) => r.timestampUtcMs))).sort(
    (a, b) => a - b,
  );
  const stepMs = expectedStepMinutes * 60 * 1000;
  const gaps: MissingIntervalRange[] = [];

  for (let i = 1; i < uniqueSortedTimestamps.length; i += 1) {
    const prev = uniqueSortedTimestamps[i - 1];
    const curr = uniqueSortedTimestamps[i];
    const diffMs = curr - prev;
    if (diffMs <= stepMs) {
      continue;
    }

    const missingPoints = Math.floor(diffMs / stepMs) - 1;
    if (missingPoints > 0) {
      gaps.push({
        startUtcMs: prev,
        endUtcMs: curr,
        expectedStepMinutes,
        missingPoints,
      });
    }
  }

  return gaps;
}

function markDuplicateFlags(rows: NormalizedMeasurementRow[], duplicates: DuplicateTimestampGroup[]): void {
  const duplicateSet = new Set<number>(duplicates.map((d) => d.timestampUtcMs));
  for (const row of rows) {
    if (duplicateSet.has(row.timestampUtcMs) && !row.qualityFlags.includes(ValidationCode.DuplicateTimestamp)) {
      row.qualityFlags.push(ValidationCode.DuplicateTimestamp);
    }
  }
}

function computeCompletenessRatio(
  rows: NormalizedMeasurementRow[],
  expectedStepMinutes: number,
): number {
  if (rows.length === 0) {
    return 0;
  }

  const uniqueSorted = Array.from(new Set(rows.map((r) => r.timestampUtcMs))).sort((a, b) => a - b);
  if (uniqueSorted.length < 2) {
    return 1;
  }

  const stepMs = expectedStepMinutes * 60 * 1000;
  const first = uniqueSorted[0];
  const last = uniqueSorted[uniqueSorted.length - 1];
  const expectedPoints = Math.floor((last - first) / stepMs) + 1;
  if (expectedPoints <= 0) {
    return 1;
  }

  return Math.max(0, Math.min(1, uniqueSorted.length / expectedPoints));
}

function createMetadata(params: {
  datasetId: string;
  request: ImportRequest;
  selectedWorksheetName: string;
  selectedWorksheetIndex: number;
  rowCountRaw: number;
  normalizedRows: NormalizedMeasurementRow[];
  sourceFileHash: string;
}): DatasetMetadata {
  const timestamps = params.normalizedRows.map((r) => r.timestampUtcMs).sort((a, b) => a - b);
  const firstTimestampUtcMs = timestamps.length > 0 ? timestamps[0] : null;
  const lastTimestampUtcMs = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  return {
    datasetId: params.datasetId,
    sourceFilePath: params.request.filePath,
    sourceFileName: basename(params.request.filePath),
    sourceFileHash: params.sourceFileHash,
    selectedWorksheetName: params.selectedWorksheetName,
    selectedWorksheetIndex: params.selectedWorksheetIndex,
    plantName: params.normalizedRows.find((r) => r.plantName)?.plantName ?? null,
    detectedTimeZone: params.normalizedRows.find((r) => r.sourceTimeZone)?.sourceTimeZone ?? null,
    importedAtUtc: new Date().toISOString(),
    firstTimestampUtcMs,
    lastTimestampUtcMs,
    rowCountRaw: params.rowCountRaw,
    rowCountNormalized: params.normalizedRows.length,
  };
}

export function buildMeasurementPoints(request: ImportRequest): ImportResult {
  const datasetId = randomUUID();
  const expectedStepMinutes = request.expectedSamplingMinutes ?? 5;
  const reportProgress = request.onProgress ?? (() => undefined);
  const ensureNotCancelled = (): void => {
    if (request.isCancelled?.()) {
      throw new Error("IMPORT_CANCELLED");
    }
  };

  reportProgress({
    phase: "reading",
    progressPercent: 5,
    message: "Зареждане на Excel файла",
  });
  ensureNotCancelled();
  const { workbook } = readWorkbook(request.filePath);
  const { worksheet, selectedWorksheetName, selectedWorksheetIndex } = selectWorksheet(workbook, {
    worksheetName: request.worksheetName,
    worksheetIndex: request.worksheetIndex,
  });

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  }) as WorksheetRow[];

  if (rows.length === 0) {
    throw new Error("Selected worksheet is empty.");
  }

  const headerRow = rows[0] ?? [];
  const dataRows = rows.slice(1);
  reportProgress({
    phase: "reading",
    progressPercent: 15,
    message: "Подготовка на редовете за нормализация",
    totalRows: dataRows.length,
  });
  const headers = normalizeHeaders(headerRow);
  const mappedColumns = mapSolarmanColumns(headers);
  const validation = validateRequiredColumns(mappedColumns.columnMap, mappedColumns.unknownColumns);

  const allIssues: ImportValidationIssue[] = [...validation.issues];
  const rawRows: RawImportedRow[] = [];
  const normalizedRows: NormalizedMeasurementRow[] = [];

  let skippedEmptyRows = 0;
  let invalidTimestampRows = 0;
  let invalidNumericCells = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    ensureNotCancelled();
    const excelRowIndex = i + 2;
    const rawRow = dataRows[i] ?? [];
    rawRows.push(toRawImportedRow(rawRow, excelRowIndex, basename(request.filePath), headerRow));

    const mappedRow = toMappedRawRow(rawRow, excelRowIndex, mappedColumns.columnMap);
    const rowShape = validateRowShape(mappedRow);
    if (rowShape.isCompletelyEmpty) {
      skippedEmptyRows += 1;
      allIssues.push({
        code: ValidationCode.EmptyRow,
        severity: QualitySeverity.Info,
        rowIndex: excelRowIndex,
        message: "Row is fully empty and was skipped.",
      });
      continue;
    }

    // If required columns are missing, we still collect issues/raw rows but cannot normalize safely.
    if (!validation.isValid) {
      continue;
    }

    const normalized = normalizeMeasurementRow(mappedRow, {
      datasetId,
      defaultTimeZoneRaw: request.analysisTimeZone ?? null,
    });
    allIssues.push(...normalized.issues);

    if (!normalized.row) {
      invalidTimestampRows += 1;
      continue;
    }

    invalidNumericCells += normalized.invalidNumericCells;
    normalizedRows.push(normalized.row);

    if ((i + 1) % 25 === 0 || i === dataRows.length - 1) {
      reportProgress({
        phase: "parsing",
        progressPercent: Math.min(80, 15 + Math.round(((i + 1) / Math.max(dataRows.length, 1)) * 65)),
        message: "Нормализация на измерванията",
        processedRows: i + 1,
        totalRows: dataRows.length,
      });
    }
  }

  ensureNotCancelled();
  const duplicateGroups = detectDuplicateTimestampGroups(normalizedRows);
  markDuplicateFlags(normalizedRows, duplicateGroups);

  for (const duplicate of duplicateGroups) {
    allIssues.push({
      code: ValidationCode.DuplicateTimestamp,
      severity: QualitySeverity.Warning,
      message: `Duplicate timestamp detected at ${new Date(duplicate.timestampUtcMs).toISOString()} (${duplicate.count} rows).`,
      rowIndex: duplicate.rowIndices[0],
      columnName: "Updated Time",
    });
  }

  const missingIntervalRanges = detectMissingIntervals(normalizedRows, expectedStepMinutes);
  const completenessRatio = computeCompletenessRatio(normalizedRows, expectedStepMinutes);

  const metadata = createMetadata({
    datasetId,
    request,
    selectedWorksheetName,
    selectedWorksheetIndex,
    rowCountRaw: dataRows.length,
    normalizedRows,
    sourceFileHash: computeFileHash(request.filePath),
  });

  reportProgress({
    phase: "completed",
    progressPercent: 85,
    message: "Нормализацията завърши",
    processedRows: normalizedRows.length,
    totalRows: dataRows.length,
  });

  return {
    metadata,
    validation: {
      ...validation,
      issues: allIssues,
      isValid: validation.isValid,
    },
    quality: {
      expectedStepMinutes,
      totalRows: dataRows.length,
      validRows: normalizedRows.length,
      skippedEmptyRows,
      invalidTimestampRows,
      invalidNumericCells,
      duplicateGroups,
      missingIntervalRanges,
      completenessRatio,
    },
    rows: normalizedRows,
    rawRows,
  };
}
