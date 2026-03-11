export type DuplicateResolution = "keep_latest" | "keep_first" | "average";
export type IntervalType = "hourly" | "daily" | "monthly";
export type ImportProgressPhase =
  | "starting"
  | "reading"
  | "parsing"
  | "persisting"
  | "completed"
  | "cancelled"
  | "failed";

export interface IpcErrorDto {
  code: string;
  message: string;
  details?: string;
}

export interface IpcResponse<T> {
  ok: boolean;
  data?: T;
  error?: IpcErrorDto;
}

export interface DatasetListItemDto {
  datasetId: string;
  sourceFileName: string;
  sourceFilePath: string;
  plantName: string | null;
  importedAtUtc: string;
  rowCountRaw: number;
  rowCountNormalized: number;
  firstTimestampUtcMs: number | null;
  lastTimestampUtcMs: number | null;
}

export interface DatasetScopedDto {
  datasetId: string;
}

export interface TimeRangeDto {
  fromUtcMs?: number;
  toUtcMs?: number;
}

export interface AppSettingsDto {
  analysisTimeZone: string;
  expectedSamplingMinutes: number;
  duplicateResolution: DuplicateResolution;
  defaultNightStart: string;
  defaultNightEnd: string;
  minCompletenessRatio: number;
  minDaysRequiredForRecommendation: number;
  maxSafeDeltaMinutes: number;
}

export interface AnalysisFilterDto {
  datasetId: string | null;
  fromUtcMs: number | null;
  toUtcMs: number | null;
  interval: IntervalType;
}

export interface AppUiStateDto {
  activeDatasetId: string | null;
  filters: AnalysisFilterDto;
}

export interface ImportFileRequestDto {
  filePath?: string;
  worksheetName?: string;
  worksheetIndex?: number;
  jobId?: string;
}

export interface CancelImportRequestDto {
  jobId: string;
}

export interface ImportValidationIssueDto {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  rowIndex?: number;
  columnName?: string;
}

export interface ImportProgressEventDto {
  jobId: string;
  phase: ImportProgressPhase;
  progressPercent: number;
  message: string;
  filePath?: string;
  fileName?: string;
  processedRows?: number;
  totalRows?: number;
  canCancel: boolean;
}

export interface ImportFileResponseDto {
  jobId: string;
  datasetId: string;
  filePath: string;
  fileName: string;
  rowCountRaw: number;
  rowCountNormalized: number;
  detectedFromUtcMs: number | null;
  detectedToUtcMs: number | null;
  validationIssuesCount: number;
  validationIssues: ImportValidationIssueDto[];
  warnings: string[];
}

export interface AggregationQualitySummaryDto {
  averageCompletenessRatio: number;
  overallAverageConsumptionW: number;
  overallTotalConsumptionKwh: number;
  totalDuplicateCount: number;
  totalGapCount: number;
  firstBucketUtcMs: number | null;
  lastBucketUtcMs: number | null;
}

export interface HourlyConsumptionProfilePointDto {
  hourOfDay: number;
  label: string;
  averageConsumptionW: number;
}

export type LowestConsumptionPeriodType = "five_minute" | "hourly" | "daily";

export interface LowestConsumptionPeriodDto {
  periodType: LowestConsumptionPeriodType;
  label: string;
  startUtcMs: number | null;
  endUtcMs: number | null;
  averageConsumptionW: number;
  estimatedKwh: number;
}

export interface RunAggregationRequestDto extends DatasetScopedDto, TimeRangeDto {}

export interface RunAggregationResponseDto {
  datasetId: string;
  hourlyCount: number;
  dailyCount: number;
  monthlyCount: number;
  timeZone: string;
  summary: AggregationQualitySummaryDto;
  hourlyConsumptionProfile: HourlyConsumptionProfilePointDto[];
  lowestConsumptionPeriods: LowestConsumptionPeriodDto[];
  message: string;
}

export interface NightRecommendationDto {
  label: string;
  durationHours: number;
  score: number;
  averageConsumptionW: number | null;
  completenessRatio: number;
  explanation: string;
}

export interface NightBestWindowsDto {
  oneHour: NightRecommendationDto | null;
  twoHours: NightRecommendationDto | null;
  threeHours: NightRecommendationDto | null;
  fourHours: NightRecommendationDto | null;
}

export interface RunNightAnalysisRequestDto extends DatasetScopedDto {
  monthKey: string;
  nightStartLocalTime?: string;
  nightEndLocalTime?: string;
}

export interface RunNightAnalysisResponseDto {
  datasetId: string;
  monthKey: string;
  availableDays: number;
  analyzedHours: number;
  bestWindows: NightBestWindowsDto;
  topRecommendations: NightRecommendationDto[];
  warnings: string[];
  message: string;
}

export interface ExportResultsRequestDto {
  datasetId: string;
  exportType: "aggregates" | "night_analysis" | "full_report";
  format: "xlsx" | "csv";
  destinationPath?: string;
}

export interface ExportResultsResponseDto {
  filePath: string;
}

export interface DeleteDatasetRequestDto {
  datasetId: string;
  deleteSourceFile?: boolean;
}

export interface DeleteDatasetResponseDto {
  datasetId: string;
  deletedSourceFile: boolean;
  deletedSourcePath?: string;
}

export interface ListDatasetsResponseDto {
  items: DatasetListItemDto[];
}

export interface EnergyDesktopApi {
  importFile: (payload: ImportFileRequestDto) => Promise<IpcResponse<ImportFileResponseDto>>;
  cancelImport: (payload: CancelImportRequestDto) => Promise<IpcResponse<{ cancelled: boolean }>>;
  onImportProgress: (listener: (event: ImportProgressEventDto) => void) => () => void;
  runAggregation: (
    payload: RunAggregationRequestDto,
  ) => Promise<IpcResponse<RunAggregationResponseDto>>;
  runNightAnalysis: (
    payload: RunNightAnalysisRequestDto,
  ) => Promise<IpcResponse<RunNightAnalysisResponseDto>>;
  exportResults: (
    payload: ExportResultsRequestDto,
  ) => Promise<IpcResponse<ExportResultsResponseDto>>;
  deleteDataset: (
    payload: DeleteDatasetRequestDto,
  ) => Promise<IpcResponse<DeleteDatasetResponseDto>>;
  listDatasets: () => Promise<IpcResponse<ListDatasetsResponseDto>>;
  getSettings: () => Promise<IpcResponse<AppSettingsDto>>;
  updateSettings: (payload: Partial<AppSettingsDto>) => Promise<IpcResponse<AppSettingsDto>>;
  getAppState: () => Promise<IpcResponse<AppUiStateDto>>;
  updateAppState: (payload: AppUiStateDto) => Promise<IpcResponse<AppUiStateDto>>;
}
