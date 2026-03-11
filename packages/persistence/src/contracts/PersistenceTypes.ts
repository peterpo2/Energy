export type AggregateIntervalType = "hourly" | "daily" | "monthly";
export type DuplicateResolution = "keep_latest" | "keep_first" | "average";

export interface DatasetEntity {
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

export interface MeasurementEntity {
  id: string;
  datasetId: string;
  timestampUtcMs: number;
  timestampIsoUtc: string;
  plantName: string | null;
  sourceTimeZone: string | null;
  sourceRowIndex: number;
  productionW: number | null;
  consumptionW: number | null;
  gridW: number | null;
  purchasingW: number | null;
  feedInW: number | null;
  qualityFlags: string[];
}

export interface AggregateEntity {
  datasetId: string;
  bucketKey: string;
  bucketStartUtcMs: number;
  localDate: string | null;
  hourOfDay: number | null;
  yearMonth: string | null;
  metrics: Record<string, unknown>;
  expectedSamples: number;
  uniqueTimestampCount: number;
  completenessRatio: number;
  duplicateCount: number;
  gapCount: number;
  metadata: Record<string, unknown> | null;
}

export interface NightWindowAnalysisEntity {
  datasetId: string;
  monthKey: string;
  nightStartLocalTime: string;
  nightEndLocalTime: string;
  availableDays: number;
  analyzedHours: number;
  hourRanking: unknown[];
  best1HourWindow: unknown | null;
  best2HourWindow: unknown | null;
  best3HourWindow: unknown | null;
  best4HourWindow: unknown | null;
  top3OverallRecommendations: unknown[];
  warnings: string[];
}

export interface NightWindowCandidateEntity {
  analysisId: string;
  datasetId: string;
  monthKey: string;
  durationHours: number;
  rank: number;
  startHourOfDay: number;
  endHourOfDay: number;
  startLocalTime: string;
  endLocalTime: string;
  durationMinutes: number;
  daysConsidered: number;
  daysWithData: number;
  averageConsumptionW: number | null;
  totalEstimatedConsumptionWh: number;
  minConsumptionW: number | null;
  maxConsumptionW: number | null;
  varianceConsumptionW: number | null;
  stdDevConsumptionW: number | null;
  stabilityScore: number;
  completenessRatio: number;
  duplicateImpact: number;
  gapImpact: number;
  finalRecommendationScore: number;
}

export interface AnalysisSettingsEntity {
  analysisTimeZone: string;
  expectedSamplingMinutes: number;
  duplicateResolution: DuplicateResolution;
  defaultNightStart: string;
  defaultNightEnd: string;
  minCompletenessRatio: number;
  minDaysRequiredForRecommendation: number;
  maxSafeDeltaMinutes: number;
  updatedAtUtc: string;
}

export interface AppUiStateEntity {
  activeDatasetId: string | null;
  filters: Record<string, unknown>;
  updatedAtUtc: string;
}

export interface DatasetListQuery {
  plantName?: string;
  sourceFileHash?: string;
  importedAfterUtc?: string;
  importedBeforeUtc?: string;
  limit?: number;
  offset?: number;
}

export interface MeasurementQuery {
  datasetId: string;
  fromUtcMs?: number;
  toUtcMs?: number;
  limit?: number;
  offset?: number;
}

export interface AggregateQuery {
  datasetId: string;
  fromBucketStartUtcMs?: number;
  toBucketStartUtcMs?: number;
  bucketKeyPrefix?: string;
}

export interface SqliteClientOptions {
  dbPath: string;
  migrationsDir?: string;
  readOnly?: boolean;
}
