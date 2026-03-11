import type {
  AnalysisFilterDto,
  AppSettingsDto,
  AppUiStateDto,
  DeleteDatasetRequestDto,
  CancelImportRequestDto,
  ExportResultsRequestDto,
  ImportFileRequestDto,
  RunAggregationRequestDto,
  RunNightAnalysisRequestDto,
} from "./dto";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalTimeString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && /^\d{2}:\d{2}$/.test(value));
}

function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

export function validateImportFileRequest(payload: ImportFileRequestDto): ImportFileRequestDto {
  if (payload.filePath !== undefined) {
    assert(isNonEmptyString(payload.filePath), "Невалиден път към Excel файл.");
  }

  if (payload.worksheetName !== undefined) {
    assert(isNonEmptyString(payload.worksheetName), "Невалидно име на worksheet.");
  }

  if (payload.worksheetIndex !== undefined) {
    assert(Number.isInteger(payload.worksheetIndex) && payload.worksheetIndex >= 0, "Невалиден индекс на worksheet.");
  }

  if (payload.jobId !== undefined) {
    assert(isNonEmptyString(payload.jobId), "Невалиден import job идентификатор.");
  }

  return payload;
}

export function validateCancelImportRequest(payload: CancelImportRequestDto): CancelImportRequestDto {
  assert(isNonEmptyString(payload.jobId), "Липсва import job идентификатор.");
  return payload;
}

export function validateRunAggregationRequest(payload: RunAggregationRequestDto): RunAggregationRequestDto {
  assert(isNonEmptyString(payload.datasetId), "Липсва datasetId за агрегация.");
  assert(isOptionalFiniteNumber(payload.fromUtcMs), "Невалидна начална дата за агрегация.");
  assert(isOptionalFiniteNumber(payload.toUtcMs), "Невалидна крайна дата за агрегация.");
  return payload;
}

export function validateRunNightAnalysisRequest(payload: RunNightAnalysisRequestDto): RunNightAnalysisRequestDto {
  assert(isNonEmptyString(payload.datasetId), "Липсва datasetId за нощен анализ.");
  assert(isMonthKey(payload.monthKey), "Невалиден месец за нощен анализ.");
  assert(isOptionalTimeString(payload.nightStartLocalTime), "Невалиден час за старт на нощния прозорец.");
  assert(isOptionalTimeString(payload.nightEndLocalTime), "Невалиден час за край на нощния прозорец.");
  return payload;
}

export function validateExportResultsRequest(payload: ExportResultsRequestDto): ExportResultsRequestDto {
  assert(isNonEmptyString(payload.datasetId), "Липсва datasetId за експорт.");
  if (payload.destinationPath !== undefined) {
    assert(isNonEmptyString(payload.destinationPath), "Невалиден destinationPath за експорт.");
  }
  return payload;
}

export function validateDeleteDatasetRequest(payload: DeleteDatasetRequestDto): DeleteDatasetRequestDto {
  assert(isNonEmptyString(payload.datasetId), "Липсва datasetId за изтриване.");
  return payload;
}

export function validateUpdateSettingsPayload(payload: Partial<AppSettingsDto>): Partial<AppSettingsDto> {
  if (payload.analysisTimeZone !== undefined) {
    assert(isNonEmptyString(payload.analysisTimeZone), "Невалидна часова зона.");
  }
  if (payload.expectedSamplingMinutes !== undefined) {
    assert(typeof payload.expectedSamplingMinutes === "number" && payload.expectedSamplingMinutes > 0, "Невалиден период на проба.");
  }
  if (payload.defaultNightStart !== undefined) {
    assert(isOptionalTimeString(payload.defaultNightStart), "Невалиден нощен старт.");
  }
  if (payload.defaultNightEnd !== undefined) {
    assert(isOptionalTimeString(payload.defaultNightEnd), "Невалиден нощен край.");
  }
  if (payload.minCompletenessRatio !== undefined) {
    assert(typeof payload.minCompletenessRatio === "number" && payload.minCompletenessRatio >= 0 && payload.minCompletenessRatio <= 1, "Невалидна минимална пълнота.");
  }
  if (payload.minDaysRequiredForRecommendation !== undefined) {
    assert(Number.isInteger(payload.minDaysRequiredForRecommendation) && payload.minDaysRequiredForRecommendation > 0, "Невалиден брой минимални дни.");
  }
  if (payload.maxSafeDeltaMinutes !== undefined) {
    assert(Number.isInteger(payload.maxSafeDeltaMinutes) && payload.maxSafeDeltaMinutes > 0, "Невалиден максимален безопасен интервал.");
  }

  return payload;
}

function validateAnalysisFilter(payload: AnalysisFilterDto): AnalysisFilterDto {
  if (payload.datasetId !== null) {
    assert(isNonEmptyString(payload.datasetId), "Невалиден активен набор.");
  }
  assert(payload.interval === "hourly" || payload.interval === "daily" || payload.interval === "monthly", "Невалиден интервал.");
  assert(payload.fromUtcMs === null || (typeof payload.fromUtcMs === "number" && Number.isFinite(payload.fromUtcMs)), "Невалидна начална дата.");
  assert(payload.toUtcMs === null || (typeof payload.toUtcMs === "number" && Number.isFinite(payload.toUtcMs)), "Невалидна крайна дата.");
  return payload;
}

export function validateAppStatePayload(payload: AppUiStateDto): AppUiStateDto {
  assert(payload && typeof payload === "object", "Невалидно UI състояние.");
  if (payload.activeDatasetId !== null) {
    assert(isNonEmptyString(payload.activeDatasetId), "Невалиден активен набор.");
  }
  validateAnalysisFilter(payload.filters);
  return payload;
}
