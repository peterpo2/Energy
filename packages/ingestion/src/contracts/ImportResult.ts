export enum ValidationCode {
  MissingRequiredColumn = "missing_required_column",
  InvalidTimestamp = "invalid_timestamp",
  InvalidNumeric = "invalid_numeric",
  DuplicateTimestamp = "duplicate_timestamp",
  EmptyRow = "empty_row",
  UnknownHeader = "unknown_header",
}

export enum QualitySeverity {
  Info = "info",
  Warning = "warning",
  Error = "error",
}

export interface DatasetMetadata {
  datasetId: string;
  sourceFilePath: string;
  sourceFileName: string;
  sourceFileHash: string;
  selectedWorksheetName: string;
  selectedWorksheetIndex: number;
  plantName: string | null;
  detectedTimeZone: string | null;
  importedAtUtc: string;
  firstTimestampUtcMs: number | null;
  lastTimestampUtcMs: number | null;
  rowCountRaw: number;
  rowCountNormalized: number;
}

export interface ImportValidationIssue {
  code: ValidationCode;
  severity: QualitySeverity;
  rowIndex?: number;
  columnName?: string;
  message: string;
  rawValue?: string | number | null;
}

export interface ImportValidationResult {
  isValid: boolean;
  issues: ImportValidationIssue[];
  missingRequiredColumns: string[];
  unknownColumns: string[];
}

export interface DuplicateTimestampGroup {
  timestampUtcMs: number;
  rowIndices: number[];
  count: number;
}

export interface MissingIntervalRange {
  startUtcMs: number;
  endUtcMs: number;
  expectedStepMinutes: number;
  missingPoints: number;
}

export interface ImportQualityResult {
  expectedStepMinutes: number;
  totalRows: number;
  validRows: number;
  skippedEmptyRows: number;
  invalidTimestampRows: number;
  invalidNumericCells: number;
  duplicateGroups: DuplicateTimestampGroup[];
  missingIntervalRanges: MissingIntervalRange[];
  completenessRatio: number;
}

export interface RawImportedRow {
  rowIndex: number;
  sourceFileName: string;
  raw: Record<string, string | number | boolean | Date | null | undefined>;
}

export interface MappedRawRow {
  rowIndex: number;
  plantName?: string | null;
  updatedTimeRaw?: string | number | Date | null;
  timeZoneRaw?: string | null;
  productionPowerRaw?: string | number | null;
  consumptionPowerRaw?: string | number | null;
  gridPowerRaw?: string | number | null;
  purchasingPowerRaw?: string | number | null;
  feedInPowerRaw?: string | number | null;
}

export interface NormalizedMeasurementRow {
  id: string;
  datasetId: string;
  plantName: string | null;
  timestampUtcMs: number;
  timestampIsoUtc: string;
  sourceTimeZone: string | null;
  sourceRowIndex: number;
  productionW: number | null;
  consumptionW: number | null;
  gridW: number | null;
  purchasingW: number | null;
  feedInW: number | null;
  qualityFlags: ValidationCode[];
}

export interface ImportResult {
  metadata: DatasetMetadata;
  validation: ImportValidationResult;
  quality: ImportQualityResult;
  rows: NormalizedMeasurementRow[];
  rawRows: RawImportedRow[];
}

