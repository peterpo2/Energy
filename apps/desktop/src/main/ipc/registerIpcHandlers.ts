import path from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { BrowserWindow, dialog, ipcMain } from "electron";
import {
  aggregateDaily,
  aggregateHourly,
  aggregateMonthly,
  findOptimalNightWindows,
  HourlySummaryRow,
} from "@analytics";
import { exportResults as exportToFile } from "@export";
import { buildMeasurementPoints, ImportValidationIssue, ValidationCode } from "@ingestion";
import {
  AggregateRepository,
  AppUiStateRepository,
  DatasetRepository,
  MeasurementRepository,
  NightWindowRepository,
  SettingsRepository,
  SqliteClient,
} from "@persistence";
import {
  AnalysisFilterDto,
  AppSettingsDto,
  AppUiStateDto,
  CancelImportRequestDto,
  DeleteDatasetRequestDto,
  DeleteDatasetResponseDto,
  ExportResultsRequestDto,
  ExportResultsResponseDto,
  ImportFileRequestDto,
  ImportFileResponseDto,
  ImportProgressEventDto,
  ImportValidationIssueDto,
  IpcChannels,
  IpcResponse,
  ListDatasetsResponseDto,
  RunAggregationRequestDto,
  RunAggregationResponseDto,
  RunNightAnalysisRequestDto,
  RunNightAnalysisResponseDto,
  LowestConsumptionPeriodDto,
  validateAppStatePayload,
  validateCancelImportRequest,
  validateDeleteDatasetRequest,
  validateExportResultsRequest,
  validateImportFileRequest,
  validateRunAggregationRequest,
  validateRunNightAnalysisRequest,
  validateUpdateSettingsPayload,
} from "@shared";
import { formatMissingIntervalWarning, mainBgText } from "../i18n/bg";
import { logError, logInfo } from "../services/logger";

interface RegisterIpcDependencies {
  sqlite: SqliteClient;
}

interface ImportJobState {
  cancelled: boolean;
  filePath: string | null;
}

function ok<T>(data: T): IpcResponse<T> {
  return { ok: true, data };
}

function fail<T>(message: string, code = "UNEXPECTED_ERROR"): IpcResponse<T> {
  return { ok: false, error: { code, message } };
}

function emitImportProgress(progress: ImportProgressEventDto): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.importProgress, progress);
  }
}

function toSettingsDto(settings: AppSettingsDto): AppSettingsDto {
  return settings;
}

function toFilterDto(filters: Record<string, unknown>): AnalysisFilterDto {
  return {
    datasetId: typeof filters.datasetId === "string" ? filters.datasetId : null,
    fromUtcMs: typeof filters.fromUtcMs === "number" ? filters.fromUtcMs : null,
    toUtcMs: typeof filters.toUtcMs === "number" ? filters.toUtcMs : null,
    interval:
      filters.interval === "daily" || filters.interval === "monthly" ? filters.interval : "hourly",
  };
}

function toAppUiStateDto(entity: {
  activeDatasetId: string | null;
  filters: Record<string, unknown>;
}): AppUiStateDto {
  return {
    activeDatasetId: entity.activeDatasetId,
    filters: toFilterDto(entity.filters),
  };
}

function mapValidationIssue(issue: ImportValidationIssue): ImportValidationIssueDto {
  return {
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    rowIndex: issue.rowIndex,
    columnName: issue.columnName,
  };
}

function toAnalyticsInput(rows: ReturnType<MeasurementRepository["list"]>) {
  return rows.map((row) => ({
    datasetId: row.datasetId,
    timestampUtcMs: row.timestampUtcMs,
    sourceRowIndex: row.sourceRowIndex,
    productionW: row.productionW,
    consumptionW: row.consumptionW,
    gridW: row.gridW,
    purchasingW: row.purchasingW,
    feedInW: row.feedInW,
  }));
}

function toAggregateEntity(
  datasetId: string,
  interval: "hourly" | "daily" | "monthly",
  row:
    | ReturnType<typeof aggregateHourly>[number]
    | ReturnType<typeof aggregateDaily>[number]
    | ReturnType<typeof aggregateMonthly>[number],
) {
  if (interval === "hourly") {
    const hourly = row as ReturnType<typeof aggregateHourly>[number];
    return {
      datasetId,
      bucketKey: hourly.bucketKey,
      bucketStartUtcMs: hourly.bucketStartUtcMs,
      localDate: hourly.localDate,
      hourOfDay: hourly.hourOfDay,
      yearMonth: hourly.bucketKey.slice(0, 7),
      metrics: hourly.metrics,
      expectedSamples: hourly.expectedSamples,
      uniqueTimestampCount: hourly.uniqueTimestampCount,
      completenessRatio: hourly.completenessRatio,
      duplicateCount: hourly.duplicateCount,
      gapCount: hourly.gapCount,
      metadata: { datasetIds: hourly.datasetIds },
    };
  }

  if (interval === "daily") {
    const daily = row as ReturnType<typeof aggregateDaily>[number];
    return {
      datasetId,
      bucketKey: daily.dayKey,
      bucketStartUtcMs: daily.dayStartUtcMs,
      localDate: daily.dayKey,
      hourOfDay: null,
      yearMonth: daily.dayKey.slice(0, 7),
      metrics: daily.metrics,
      expectedSamples: daily.expectedSamples,
      uniqueTimestampCount: daily.uniqueTimestampCount,
      completenessRatio: daily.completenessRatio,
      duplicateCount: daily.duplicateCount,
      gapCount: daily.gapCount,
      metadata: {
        datasetIds: daily.datasetIds,
        avgHourlyConsumptionW: daily.avgHourlyConsumptionW,
        minHourlyConsumptionW: daily.minHourlyConsumptionW,
        maxHourlyConsumptionW: daily.maxHourlyConsumptionW,
      },
    };
  }

  const monthly = row as ReturnType<typeof aggregateMonthly>[number];
  return {
    datasetId,
    bucketKey: monthly.monthKey,
    bucketStartUtcMs: monthly.monthStartUtcMs,
    localDate: null,
    hourOfDay: null,
    yearMonth: monthly.monthKey,
    metrics: monthly.metrics,
    expectedSamples: monthly.expectedSamples,
    uniqueTimestampCount: monthly.uniqueTimestampCount,
    completenessRatio: monthly.completenessRatio,
    duplicateCount: monthly.duplicateCount,
    gapCount: monthly.gapCount,
    metadata: {
      datasetIds: monthly.datasetIds,
      daysCovered: monthly.daysCovered,
      averageDailyConsumptionWh: monthly.averageDailyConsumptionWh,
      averageDailyConsumptionKwh: monthly.averageDailyConsumptionKwh,
      hourlyConsumptionProfile: monthly.hourlyConsumptionProfile,
    },
  };
}

function ensureDatasetExists(datasetRepository: DatasetRepository, datasetId: string): void {
  const dataset = datasetRepository.getById(datasetId);
  if (!dataset) {
    throw new Error(mainBgText.errors.datasetNotFound);
  }
}

function buildRealtimeHourly(
  measurementRepository: MeasurementRepository,
  datasetId: string,
  settings: AppSettingsDto,
): HourlySummaryRow[] {
  const measurementRows = measurementRepository.list({
    datasetId,
  });

  return aggregateHourly(toAnalyticsInput(measurementRows), {
    timeZone: settings.analysisTimeZone,
    expectedSamplingMinutes: settings.expectedSamplingMinutes,
    duplicateResolution: settings.duplicateResolution,
    maxSafeDeltaMinutes: settings.maxSafeDeltaMinutes,
  });
}

function toRecommendationDto(
  recommendation: ReturnType<typeof findOptimalNightWindows>["best1HourWindow"],
) {
  if (!recommendation) {
    return null;
  }

  return {
    label: `${recommendation.candidate.startLocalTime} - ${recommendation.candidate.endLocalTime}`,
    durationHours: recommendation.candidate.durationHours,
    score: recommendation.candidate.finalRecommendationScore,
    averageConsumptionW: recommendation.candidate.averageConsumptionW,
    completenessRatio: recommendation.candidate.completenessRatio,
    explanation: recommendation.explanation,
  };
}

function buildHourlyConsumptionProfile(hourlyRows: ReturnType<typeof aggregateHourly>) {
  const byHour = new Map<number, number[]>();

  for (const row of hourlyRows) {
    const averageConsumption = row.metrics.consumptionW.avgW;
    if (averageConsumption === null) {
      continue;
    }
    if (!byHour.has(row.hourOfDay)) {
      byHour.set(row.hourOfDay, []);
    }
    byHour.get(row.hourOfDay)?.push(averageConsumption);
  }

  return Array.from({ length: 24 }, (_, hourOfDay) => {
    const values = byHour.get(hourOfDay) ?? [];
    return {
      hourOfDay,
      label: `${String(hourOfDay).padStart(2, "0")}:00`,
      averageConsumptionW:
        values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    };
  });
}

function formatLocalRangeLabel(startUtcMs: number, endUtcMs: number | null, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("bg-BG", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const startLabel = formatter.format(new Date(startUtcMs));
  if (endUtcMs === null) {
    return startLabel;
  }

  const endFormatter = new Intl.DateTimeFormat("bg-BG", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${startLabel} - ${endFormatter.format(new Date(endUtcMs))}`;
}

function buildLowestConsumptionPeriods(
  measurementRows: ReturnType<MeasurementRepository["list"]>,
  hourlyRows: ReturnType<typeof aggregateHourly>,
  dailyRows: ReturnType<typeof aggregateDaily>,
  timeZone: string,
): LowestConsumptionPeriodDto[] {
  const lowest: LowestConsumptionPeriodDto[] = [];

  const fiveMinuteCandidate = measurementRows
    .filter((row) => typeof row.consumptionW === "number")
    .reduce<ReturnType<MeasurementRepository["list"]>[number] | null>((best, row) => {
      if (best === null) {
        return row;
      }
      return (row.consumptionW ?? Number.POSITIVE_INFINITY) < (best.consumptionW ?? Number.POSITIVE_INFINITY)
        ? row
        : best;
    }, null);

  if (fiveMinuteCandidate?.consumptionW !== null && fiveMinuteCandidate?.consumptionW !== undefined) {
    lowest.push({
      periodType: "five_minute",
      label: formatLocalRangeLabel(
        fiveMinuteCandidate.timestampUtcMs,
        fiveMinuteCandidate.timestampUtcMs + 5 * 60 * 1000,
        timeZone,
      ),
      startUtcMs: fiveMinuteCandidate.timestampUtcMs,
      endUtcMs: fiveMinuteCandidate.timestampUtcMs + 5 * 60 * 1000,
      averageConsumptionW: fiveMinuteCandidate.consumptionW,
      estimatedKwh: (fiveMinuteCandidate.consumptionW * (5 / 60)) / 1000,
    });
  }

  const hourlyCandidate = hourlyRows
    .filter((row) => row.metrics.consumptionW.avgW !== null)
    .reduce<ReturnType<typeof aggregateHourly>[number] | null>((best, row) => {
      if (best === null) {
        return row;
      }
      return (row.metrics.consumptionW.avgW ?? Number.POSITIVE_INFINITY) <
        (best.metrics.consumptionW.avgW ?? Number.POSITIVE_INFINITY)
        ? row
        : best;
    }, null);

  if (hourlyCandidate?.metrics.consumptionW.avgW !== null && hourlyCandidate?.metrics.consumptionW.avgW !== undefined) {
    lowest.push({
      periodType: "hourly",
      label: formatLocalRangeLabel(
        hourlyCandidate.bucketStartUtcMs,
        hourlyCandidate.bucketStartUtcMs + 60 * 60 * 1000,
        timeZone,
      ),
      startUtcMs: hourlyCandidate.bucketStartUtcMs,
      endUtcMs: hourlyCandidate.bucketStartUtcMs + 60 * 60 * 1000,
      averageConsumptionW: hourlyCandidate.metrics.consumptionW.avgW,
      estimatedKwh: hourlyCandidate.metrics.consumptionW.estimatedKwh,
    });
  }

  const dailyCandidate = dailyRows
    .filter((row) => row.avgHourlyConsumptionW !== null)
    .reduce<ReturnType<typeof aggregateDaily>[number] | null>((best, row) => {
      if (best === null) {
        return row;
      }
      return (row.avgHourlyConsumptionW ?? Number.POSITIVE_INFINITY) <
        (best.avgHourlyConsumptionW ?? Number.POSITIVE_INFINITY)
        ? row
        : best;
    }, null);

  if (dailyCandidate?.avgHourlyConsumptionW !== null && dailyCandidate?.avgHourlyConsumptionW !== undefined) {
    lowest.push({
      periodType: "daily",
      label: formatLocalRangeLabel(
        dailyCandidate.dayStartUtcMs,
        dailyCandidate.dayStartUtcMs + 24 * 60 * 60 * 1000,
        timeZone,
      ),
      startUtcMs: dailyCandidate.dayStartUtcMs,
      endUtcMs: dailyCandidate.dayStartUtcMs + 24 * 60 * 60 * 1000,
      averageConsumptionW: dailyCandidate.avgHourlyConsumptionW,
      estimatedKwh: dailyCandidate.metrics.consumptionW.estimatedKwh,
    });
  }

  return lowest;
}

function calculateOverallAverageConsumptionW(hourlyRows: ReturnType<typeof aggregateHourly>): number {
  let totalWh = 0;
  let totalHours = 0;

  for (const row of hourlyRows) {
    const consumption = row.metrics.consumptionW;
    if (consumption.sampleCount <= 0 || consumption.estimatedWh <= 0) {
      continue;
    }

    const coveredHours = (consumption.sampleCount * 5) / 60;
    totalWh += consumption.estimatedWh;
    totalHours += coveredHours;
  }

  if (totalHours <= 0) {
    return 0;
  }

  return totalWh / totalHours;
}

function calculateOverallTotalConsumptionKwh(hourlyRows: ReturnType<typeof aggregateHourly>): number {
  const totalWh = hourlyRows.reduce((sum, row) => sum + row.metrics.consumptionW.estimatedWh, 0);
  return totalWh / 1000;
}

export function registerIpcHandlers(deps: RegisterIpcDependencies): void {
  logInfo("Registering IPC handlers.", "ipc");
  const datasetRepository = new DatasetRepository(deps.sqlite.db);
  const measurementRepository = new MeasurementRepository(deps.sqlite.db);
  const aggregateRepository = new AggregateRepository(deps.sqlite.db);
  const nightWindowRepository = new NightWindowRepository(deps.sqlite.db);
  const settingsRepository = new SettingsRepository(deps.sqlite.db);
  const appUiStateRepository = new AppUiStateRepository(deps.sqlite.db);
  const importJobs = new Map<string, ImportJobState>();

  ipcMain.handle(
    IpcChannels.importFile,
    async (_event, payload: ImportFileRequestDto): Promise<IpcResponse<ImportFileResponseDto>> => {
      const request = validateImportFileRequest(payload);
      const jobId = request.jobId ?? randomUUID();
      let filePath = request.filePath?.trim() ?? "";

      try {
        logInfo(`importFile request: ${JSON.stringify(request)}`, "ipc");

        if (!filePath) {
          emitImportProgress({
            jobId,
            phase: "starting",
            progressPercent: 2,
            message: mainBgText.importProgress.selectingFile,
            canCancel: true,
          });

          const pick = await dialog.showOpenDialog({
            title: mainBgText.dialogs.openExcelTitle,
            properties: ["openFile"],
            filters: [{ name: "Excel", extensions: ["xlsx", "xls"] }],
          });
          if (pick.canceled || pick.filePaths.length === 0) {
            logInfo(`importFile cancelled during file selection: jobId=${jobId}`, "ipc");
            return fail<ImportFileResponseDto>(mainBgText.dialogs.importCancelled, "IMPORT_CANCELLED");
          }
          filePath = pick.filePaths[0];
        }

        importJobs.set(jobId, { cancelled: false, filePath });
        emitImportProgress({
          jobId,
          phase: "starting",
          progressPercent: 5,
          message: mainBgText.importProgress.starting,
          filePath,
          fileName: path.basename(filePath),
          canCancel: true,
        });

        const settings = settingsRepository.get();
        const result = buildMeasurementPoints({
          filePath,
          worksheetName: request.worksheetName,
          worksheetIndex: request.worksheetIndex,
          expectedSamplingMinutes: settings.expectedSamplingMinutes,
          analysisTimeZone: settings.analysisTimeZone,
          isCancelled: () => importJobs.get(jobId)?.cancelled === true,
          onProgress: (progress) => {
            emitImportProgress({
              jobId,
              phase: progress.phase,
              progressPercent: progress.progressPercent,
              message: progress.message,
              filePath,
              fileName: path.basename(filePath),
              processedRows: progress.processedRows,
              totalRows: progress.totalRows,
              canCancel: true,
            });
          },
        });

        if (importJobs.get(jobId)?.cancelled) {
          importJobs.delete(jobId);
          logInfo(`importFile cancelled before persistence: jobId=${jobId} file=${filePath}`, "ipc");
          emitImportProgress({
            jobId,
            phase: "cancelled",
            progressPercent: 100,
            message: mainBgText.importProgress.cancelled,
            filePath,
            fileName: path.basename(filePath),
            canCancel: false,
          });
          return fail<ImportFileResponseDto>(mainBgText.errors.importCancelled, "IMPORT_CANCELLED");
        }

        emitImportProgress({
          jobId,
          phase: "persisting",
          progressPercent: 88,
          message: mainBgText.importProgress.persisting,
          filePath,
          fileName: path.basename(filePath),
          processedRows: result.rows.length,
          totalRows: result.metadata.rowCountRaw,
          canCancel: true,
        });

        datasetRepository.upsert({
          datasetId: result.metadata.datasetId,
          sourceFilePath: result.metadata.sourceFilePath,
          sourceFileName: result.metadata.sourceFileName,
          sourceFileHash: result.metadata.sourceFileHash,
          selectedWorksheetName: result.metadata.selectedWorksheetName,
          selectedWorksheetIndex: result.metadata.selectedWorksheetIndex,
          plantName: result.metadata.plantName,
          detectedTimeZone: result.metadata.detectedTimeZone,
          importedAtUtc: result.metadata.importedAtUtc,
          firstTimestampUtcMs: result.metadata.firstTimestampUtcMs,
          lastTimestampUtcMs: result.metadata.lastTimestampUtcMs,
          rowCountRaw: result.metadata.rowCountRaw,
          rowCountNormalized: result.metadata.rowCountNormalized,
        });

        measurementRepository.deleteByDataset(result.metadata.datasetId);
        const chunkSize = 500;
        for (let index = 0; index < result.rows.length; index += chunkSize) {
          if (importJobs.get(jobId)?.cancelled) {
            measurementRepository.deleteByDataset(result.metadata.datasetId);
            datasetRepository.deleteById(result.metadata.datasetId);
            importJobs.delete(jobId);
            logInfo(
              `importFile cancelled during persistence: jobId=${jobId} datasetId=${result.metadata.datasetId} processed=${index}`,
              "ipc",
            );
            emitImportProgress({
              jobId,
              phase: "cancelled",
              progressPercent: 100,
              message: mainBgText.importProgress.cancelled,
              filePath,
              fileName: path.basename(filePath),
              processedRows: index,
              totalRows: result.rows.length,
              canCancel: false,
            });
            return fail<ImportFileResponseDto>(mainBgText.errors.importCancelled, "IMPORT_CANCELLED");
          }

          measurementRepository.upsertMany(result.rows.slice(index, index + chunkSize));
          emitImportProgress({
            jobId,
            phase: "persisting",
            progressPercent: Math.min(
              98,
              88 + Math.round((Math.min(index + chunkSize, result.rows.length) / Math.max(result.rows.length, 1)) * 10),
            ),
            message: mainBgText.importProgress.persisting,
            filePath,
            fileName: path.basename(filePath),
            processedRows: Math.min(index + chunkSize, result.rows.length),
            totalRows: result.rows.length,
            canCancel: true,
          });
        }

        const existingUiState = appUiStateRepository.get();
        const isImportValid = result.metadata.rowCountNormalized > 0;
        appUiStateRepository.upsert({
          activeDatasetId: isImportValid ? result.metadata.datasetId : existingUiState.activeDatasetId,
          filters: {
            ...existingUiState.filters,
            datasetId: isImportValid
              ? result.metadata.datasetId
              : typeof existingUiState.filters.datasetId === "string"
                ? existingUiState.filters.datasetId
                : null,
          },
        });

        const validationIssues = result.validation.issues.map(mapValidationIssue);
        const warnings = [
          ...result.validation.issues
            .filter((issue) => issue.code === ValidationCode.UnknownHeader)
            .map((issue) => issue.message),
          ...result.quality.missingIntervalRanges
            .slice(0, 5)
            .map(
              (gap) =>
                formatMissingIntervalWarning(
                  new Date(gap.startUtcMs).toISOString(),
                  new Date(gap.endUtcMs).toISOString(),
                  gap.missingPoints,
                ),
            ),
        ];

        emitImportProgress({
          jobId,
          phase: "completed",
          progressPercent: 100,
          message: mainBgText.importProgress.completed,
          filePath,
          fileName: path.basename(filePath),
          processedRows: result.rows.length,
          totalRows: result.metadata.rowCountRaw,
          canCancel: false,
        });
        importJobs.delete(jobId);
        logInfo(
          `importFile success: datasetId=${result.metadata.datasetId} raw=${result.metadata.rowCountRaw} normalized=${result.metadata.rowCountNormalized} issues=${validationIssues.length} valid=${isImportValid}`,
          "ipc",
        );

        return ok({
          jobId,
          datasetId: result.metadata.datasetId,
          filePath: result.metadata.sourceFilePath,
          fileName: result.metadata.sourceFileName,
          rowCountRaw: result.metadata.rowCountRaw,
          rowCountNormalized: result.metadata.rowCountNormalized,
          detectedFromUtcMs: result.metadata.firstTimestampUtcMs,
          detectedToUtcMs: result.metadata.lastTimestampUtcMs,
          validationIssuesCount: validationIssues.length,
          validationIssues,
          warnings,
        });
      } catch (error) {
        importJobs.delete(jobId);
        if (String((error as Error).message) === "IMPORT_CANCELLED") {
          logInfo(`importFile cancelled: jobId=${jobId} file=${filePath || "n/a"}`, "ipc");
        }
        emitImportProgress({
          jobId,
          phase: String((error as Error).message) === "IMPORT_CANCELLED" ? "cancelled" : "failed",
          progressPercent: 100,
          message:
            String((error as Error).message) === "IMPORT_CANCELLED"
              ? mainBgText.importProgress.cancelled
              : mainBgText.importProgress.failed,
          filePath: filePath || undefined,
          fileName: filePath ? path.basename(filePath) : undefined,
          canCancel: false,
        });
        if (String((error as Error).message) !== "IMPORT_CANCELLED") {
          logError(`importFile error: ${String(error)}`, "ipc");
        }
        return fail<ImportFileResponseDto>(
          String((error as Error).message) === "IMPORT_CANCELLED"
            ? mainBgText.errors.importCancelled
            : (error as Error).message,
          String((error as Error).message) === "IMPORT_CANCELLED" ? "IMPORT_CANCELLED" : "IMPORT_FAILED",
        );
      }
    },
  );

  ipcMain.handle(
    IpcChannels.cancelImport,
    async (_event, payload: CancelImportRequestDto): Promise<IpcResponse<{ cancelled: boolean }>> => {
      try {
        const request = validateCancelImportRequest(payload);
        const job = importJobs.get(request.jobId);
        if (!job) {
          logInfo(`cancelImport ignored: missing jobId=${request.jobId}`, "ipc");
          return ok({ cancelled: false });
        }
        job.cancelled = true;
        importJobs.set(request.jobId, job);
        logInfo(`cancelImport request accepted: jobId=${request.jobId}`, "ipc");
        emitImportProgress({
          jobId: request.jobId,
          phase: "cancelled",
          progressPercent: 100,
          message: mainBgText.importProgress.cancelled,
          filePath: job.filePath ?? undefined,
          fileName: job.filePath ? path.basename(job.filePath) : undefined,
          canCancel: false,
        });
        return ok({ cancelled: true });
      } catch (error) {
        logError(`cancelImport error: ${String(error)}`, "ipc");
        return fail<{ cancelled: boolean }>((error as Error).message, "CANCEL_IMPORT_FAILED");
      }
    },
  );

  ipcMain.handle(
    IpcChannels.runAggregation,
    async (_event, payload: RunAggregationRequestDto): Promise<IpcResponse<RunAggregationResponseDto>> => {
      try {
        const request = validateRunAggregationRequest(payload);
        logInfo(`runAggregation request: ${JSON.stringify(request)}`, "ipc");
        ensureDatasetExists(datasetRepository, request.datasetId);

        if (
          typeof request.fromUtcMs === "number" &&
          typeof request.toUtcMs === "number" &&
          request.fromUtcMs > request.toUtcMs
        ) {
          throw new Error(mainBgText.errors.invalidTimeRange);
        }

        const settings = settingsRepository.get();
        const measurementRows = measurementRepository.list({
          datasetId: request.datasetId,
          fromUtcMs: request.fromUtcMs,
          toUtcMs: request.toUtcMs,
        });
        if (measurementRows.length === 0) {
          throw new Error(mainBgText.errors.datasetHasNoMeasurements);
        }
        const analyticsInput = toAnalyticsInput(measurementRows);

        const options = {
          timeZone: settings.analysisTimeZone,
          expectedSamplingMinutes: settings.expectedSamplingMinutes,
          duplicateResolution: settings.duplicateResolution,
          maxSafeDeltaMinutes: settings.maxSafeDeltaMinutes,
        } as const;

        const hourly = aggregateHourly(analyticsInput, options);
        const daily = aggregateDaily(analyticsInput, options);
        const monthly = aggregateMonthly(analyticsInput, options);

        aggregateRepository.replaceHourly(
          request.datasetId,
          hourly.map((row) => toAggregateEntity(request.datasetId, "hourly", row)),
        );
        aggregateRepository.replaceDaily(
          request.datasetId,
          daily.map((row) => toAggregateEntity(request.datasetId, "daily", row)),
        );
        aggregateRepository.replaceMonthly(
          request.datasetId,
          monthly.map((row) => toAggregateEntity(request.datasetId, "monthly", row)),
        );

        const combinedRows = [...hourly, ...daily, ...monthly];
        const allCompleteness = combinedRows.map((row) => row.completenessRatio);
        const totalDuplicateCount = combinedRows.reduce((sum, row) => sum + row.duplicateCount, 0);
        const totalGapCount = combinedRows.reduce((sum, row) => sum + row.gapCount, 0);
        const allBuckets = combinedRows.map((row) => row.bucketStartUtcMs);
        const overallAverageConsumptionW = calculateOverallAverageConsumptionW(hourly);
        const overallTotalConsumptionKwh = calculateOverallTotalConsumptionKwh(hourly);
        const lowestConsumptionPeriods = buildLowestConsumptionPeriods(
          measurementRows,
          hourly,
          daily,
          settings.analysisTimeZone,
        );
        logInfo(
          `runAggregation success: datasetId=${request.datasetId} hourly=${hourly.length} daily=${daily.length} monthly=${monthly.length} duplicates=${totalDuplicateCount} gaps=${totalGapCount}`,
          "ipc",
        );

        return ok({
          datasetId: request.datasetId,
          hourlyCount: hourly.length,
          dailyCount: daily.length,
          monthlyCount: monthly.length,
          timeZone: settings.analysisTimeZone,
          summary: {
            averageCompletenessRatio:
              allCompleteness.length > 0
                ? allCompleteness.reduce((sum, value) => sum + value, 0) / allCompleteness.length
                : 0,
            overallAverageConsumptionW,
            overallTotalConsumptionKwh,
            totalDuplicateCount,
            totalGapCount,
            firstBucketUtcMs: allBuckets.length > 0 ? Math.min(...allBuckets) : null,
            lastBucketUtcMs: allBuckets.length > 0 ? Math.max(...allBuckets) : null,
          },
          hourlyConsumptionProfile: buildHourlyConsumptionProfile(hourly),
          lowestConsumptionPeriods,
          message: mainBgText.ipc.aggregationCompleted,
        });
      } catch (error) {
        logError(`runAggregation error: ${String(error)}`, "ipc");
        return fail<RunAggregationResponseDto>((error as Error).message, "AGGREGATION_FAILED");
      }
    },
  );

  ipcMain.handle(
    IpcChannels.runNightAnalysis,
    async (_event, payload: RunNightAnalysisRequestDto): Promise<IpcResponse<RunNightAnalysisResponseDto>> => {
      try {
        const request = validateRunNightAnalysisRequest(payload);
        logInfo(`runNightAnalysis request: ${JSON.stringify(request)}`, "ipc");
        ensureDatasetExists(datasetRepository, request.datasetId);

        const settings = settingsRepository.get();
        const hourly = buildRealtimeHourly(measurementRepository, request.datasetId, {
          analysisTimeZone: settings.analysisTimeZone,
          expectedSamplingMinutes: settings.expectedSamplingMinutes,
          duplicateResolution: settings.duplicateResolution,
          defaultNightStart: settings.defaultNightStart,
          defaultNightEnd: settings.defaultNightEnd,
          minCompletenessRatio: settings.minCompletenessRatio,
          minDaysRequiredForRecommendation: settings.minDaysRequiredForRecommendation,
          maxSafeDeltaMinutes: settings.maxSafeDeltaMinutes,
        });

        const night = findOptimalNightWindows(hourly, {
          monthKey: request.monthKey,
          nightStartLocalTime: request.nightStartLocalTime ?? settings.defaultNightStart,
          nightEndLocalTime: request.nightEndLocalTime ?? settings.defaultNightEnd,
          minDaysRequired: settings.minDaysRequiredForRecommendation,
        });

        const allCandidates = Object.values(night.candidatesByDuration).flat();
        nightWindowRepository.upsertAnalysis({
          analysis: {
            datasetId: request.datasetId,
            monthKey: night.monthKey,
            nightStartLocalTime: night.nightStartLocalTime,
            nightEndLocalTime: night.nightEndLocalTime,
            availableDays: night.availableDays,
            analyzedHours: night.analyzedHours,
            hourRanking: night.hourRanking,
            best1HourWindow: night.best1HourWindow,
            best2HourWindow: night.best2HourWindow,
            best3HourWindow: night.best3HourWindow,
            best4HourWindow: night.best4HourWindow,
            top3OverallRecommendations: night.top3OverallRecommendations,
            warnings: night.warnings,
          },
          candidates: allCandidates.map((candidate) => ({
            analysisId: "",
            datasetId: request.datasetId,
            monthKey: request.monthKey,
            durationHours: candidate.durationHours,
            rank: candidate.rank,
            startHourOfDay: candidate.startHourOfDay,
            endHourOfDay: candidate.endHourOfDay,
            startLocalTime: candidate.startLocalTime,
            endLocalTime: candidate.endLocalTime,
            durationMinutes: candidate.durationMinutes,
            daysConsidered: candidate.daysConsidered,
            daysWithData: candidate.daysWithData,
            averageConsumptionW: candidate.averageConsumptionW,
            totalEstimatedConsumptionWh: candidate.totalEstimatedConsumptionWh,
            minConsumptionW: candidate.minConsumptionW,
            maxConsumptionW: candidate.maxConsumptionW,
            varianceConsumptionW: candidate.varianceConsumptionW,
            stdDevConsumptionW: candidate.stdDevConsumptionW,
            stabilityScore: candidate.stabilityScore,
            completenessRatio: candidate.completenessRatio,
            duplicateImpact: candidate.duplicateImpact,
            gapImpact: candidate.gapImpact,
            finalRecommendationScore: candidate.finalRecommendationScore,
          })),
        });
        logInfo(
          `runNightAnalysis success: datasetId=${request.datasetId} month=${request.monthKey} availableDays=${night.availableDays} analyzedHours=${night.analyzedHours} recommendations=${night.top3OverallRecommendations.length}`,
          "ipc",
        );

        return ok({
          datasetId: request.datasetId,
          monthKey: request.monthKey,
          availableDays: night.availableDays,
          analyzedHours: night.analyzedHours,
          bestWindows: {
            oneHour: toRecommendationDto(night.best1HourWindow),
            twoHours: toRecommendationDto(night.best2HourWindow),
            threeHours: toRecommendationDto(night.best3HourWindow),
            fourHours: toRecommendationDto(night.best4HourWindow),
          },
          topRecommendations: night.top3OverallRecommendations.map((item) => ({
            label: `${item.candidate.startLocalTime} - ${item.candidate.endLocalTime}`,
            durationHours: item.candidate.durationHours,
            score: item.candidate.finalRecommendationScore,
            averageConsumptionW: item.candidate.averageConsumptionW,
            completenessRatio: item.candidate.completenessRatio,
            explanation: item.explanation,
          })),
          warnings: night.warnings,
          message: mainBgText.ipc.nightCompleted,
        });
      } catch (error) {
        logError(`runNightAnalysis error: ${String(error)}`, "ipc");
        return fail<RunNightAnalysisResponseDto>((error as Error).message, "NIGHT_ANALYSIS_FAILED");
      }
    },
  );

  ipcMain.handle(
    IpcChannels.exportResults,
    async (_event, payload: ExportResultsRequestDto): Promise<IpcResponse<ExportResultsResponseDto>> => {
      try {
        const request = validateExportResultsRequest(payload);
        logInfo(`exportResults request: ${JSON.stringify(request)}`, "ipc");
        ensureDatasetExists(datasetRepository, request.datasetId);

        const hourly = aggregateRepository.listHourly({ datasetId: request.datasetId });
        const daily = aggregateRepository.listDaily({ datasetId: request.datasetId });
        const monthly = aggregateRepository.listMonthly({ datasetId: request.datasetId });
        const latestNightAnalysis = nightWindowRepository.listAnalysesForDataset(request.datasetId)[0] ?? null;

        if (request.exportType === "night_analysis" && !latestNightAnalysis) {
          throw new Error(mainBgText.errors.noNightAnalysisAvailable);
        }

        let destinationPath = request.destinationPath?.trim() ?? "";
        if (!destinationPath) {
          const dataset = datasetRepository.getById(request.datasetId);
          const extension = request.format === "csv" ? "csv" : "xlsx";
          const defaultName = `${dataset?.sourceFileName?.replace(/\.(xlsx|xls)$/i, "") ?? request.datasetId}-${request.exportType}.${extension}`;
          const save = await dialog.showSaveDialog({
            title: mainBgText.dialogs.saveExportTitle,
            defaultPath: defaultName,
            filters: [{ name: request.format === "csv" ? "CSV" : "Excel", extensions: [extension] }],
          });

          if (save.canceled || !save.filePath) {
            return fail<ExportResultsResponseDto>(mainBgText.dialogs.exportCancelled, "EXPORT_CANCELLED");
          }

          destinationPath = save.filePath;
        }

        const exported = exportToFile({
          exportType: request.exportType,
          format: request.format,
          destinationPath,
          datasetId: request.datasetId,
          aggregates: request.exportType === "night_analysis" ? undefined : { hourly, daily, monthly },
          nightAnalysis: latestNightAnalysis
            ? {
                analysis: latestNightAnalysis.analysis,
                candidates: latestNightAnalysis.candidates,
              }
            : undefined,
        });

        return ok({ filePath: exported.filePath });
      } catch (error) {
        logError(`exportResults error: ${String(error)}`, "ipc");
        return fail<ExportResultsResponseDto>((error as Error).message, "EXPORT_FAILED");
      }
    },
  );

  ipcMain.handle(
    IpcChannels.deleteDataset,
    async (_event, payload: DeleteDatasetRequestDto): Promise<IpcResponse<DeleteDatasetResponseDto>> => {
      try {
        const request = validateDeleteDatasetRequest(payload);
        const dataset = datasetRepository.getById(request.datasetId);
        if (!dataset) {
          throw new Error(mainBgText.errors.datasetNotFound);
        }

        let deletedSourceFile = false;
        if (request.deleteSourceFile && dataset.sourceFilePath && existsSync(dataset.sourceFilePath)) {
          rmSync(dataset.sourceFilePath);
          deletedSourceFile = true;
        }

        datasetRepository.deleteById(request.datasetId);

        const currentUiState = appUiStateRepository.get();
        if (currentUiState.activeDatasetId === request.datasetId) {
          appUiStateRepository.upsert({
            activeDatasetId: null,
            filters: {
              ...currentUiState.filters,
              datasetId: null,
            },
          });
        }

        logInfo(
          `deleteDataset success: datasetId=${request.datasetId} deletedSourceFile=${deletedSourceFile}`,
          "ipc",
        );

        return ok({
          datasetId: request.datasetId,
          deletedSourceFile,
          deletedSourcePath: deletedSourceFile ? dataset.sourceFilePath : undefined,
        });
      } catch (error) {
        logError(`deleteDataset error: ${String(error)}`, "ipc");
        return fail<DeleteDatasetResponseDto>((error as Error).message, "DELETE_DATASET_FAILED");
      }
    },
  );

  ipcMain.handle(IpcChannels.listDatasets, async (): Promise<IpcResponse<ListDatasetsResponseDto>> => {
    try {
      logInfo("listDatasets request", "ipc");
      return ok({
        items: datasetRepository.list({ limit: 100 }).map((item) => ({
          datasetId: item.datasetId,
          sourceFileName: item.sourceFileName,
          sourceFilePath: item.sourceFilePath,
          plantName: item.plantName,
          importedAtUtc: item.importedAtUtc,
          rowCountRaw: item.rowCountRaw,
          rowCountNormalized: item.rowCountNormalized,
          firstTimestampUtcMs: item.firstTimestampUtcMs,
          lastTimestampUtcMs: item.lastTimestampUtcMs,
        })),
      });
    } catch (error) {
      logError(`listDatasets error: ${String(error)}`, "ipc");
      return fail<ListDatasetsResponseDto>((error as Error).message, "LIST_DATASETS_FAILED");
    }
  });

  ipcMain.handle(IpcChannels.getSettings, async (): Promise<IpcResponse<AppSettingsDto>> => {
    try {
      logInfo("getSettings request", "ipc");
      const settings = settingsRepository.get();
      return ok(
        toSettingsDto({
          analysisTimeZone: settings.analysisTimeZone,
          expectedSamplingMinutes: settings.expectedSamplingMinutes,
          duplicateResolution: settings.duplicateResolution,
          defaultNightStart: settings.defaultNightStart,
          defaultNightEnd: settings.defaultNightEnd,
          minCompletenessRatio: settings.minCompletenessRatio,
          minDaysRequiredForRecommendation: settings.minDaysRequiredForRecommendation,
          maxSafeDeltaMinutes: settings.maxSafeDeltaMinutes,
        }),
      );
    } catch (error) {
      logError(`getSettings error: ${String(error)}`, "ipc");
      return fail<AppSettingsDto>((error as Error).message, "GET_SETTINGS_FAILED");
    }
  });

  ipcMain.handle(
    IpcChannels.updateSettings,
    async (_event, payload: Partial<AppSettingsDto>): Promise<IpcResponse<AppSettingsDto>> => {
      try {
        const request = validateUpdateSettingsPayload(payload);
        logInfo(`updateSettings request: ${JSON.stringify(request)}`, "ipc");
        const next = settingsRepository.upsert({
          analysisTimeZone: request.analysisTimeZone,
          expectedSamplingMinutes: request.expectedSamplingMinutes,
          duplicateResolution: request.duplicateResolution,
          defaultNightStart: request.defaultNightStart,
          defaultNightEnd: request.defaultNightEnd,
          minCompletenessRatio: request.minCompletenessRatio,
          minDaysRequiredForRecommendation: request.minDaysRequiredForRecommendation,
          maxSafeDeltaMinutes: request.maxSafeDeltaMinutes,
        });
        return ok(
          toSettingsDto({
            analysisTimeZone: next.analysisTimeZone,
            expectedSamplingMinutes: next.expectedSamplingMinutes,
            duplicateResolution: next.duplicateResolution,
            defaultNightStart: next.defaultNightStart,
            defaultNightEnd: next.defaultNightEnd,
            minCompletenessRatio: next.minCompletenessRatio,
            minDaysRequiredForRecommendation: next.minDaysRequiredForRecommendation,
            maxSafeDeltaMinutes: next.maxSafeDeltaMinutes,
          }),
        );
      } catch (error) {
        logError(`updateSettings error: ${String(error)}`, "ipc");
        return fail<AppSettingsDto>((error as Error).message, "UPDATE_SETTINGS_FAILED");
      }
    },
  );

  ipcMain.handle(IpcChannels.getAppState, async (): Promise<IpcResponse<AppUiStateDto>> => {
    try {
      logInfo("getAppState request", "ipc");
      return ok(toAppUiStateDto(appUiStateRepository.get()));
    } catch (error) {
      logError(`getAppState error: ${String(error)}`, "ipc");
      return fail<AppUiStateDto>((error as Error).message, "GET_APP_STATE_FAILED");
    }
  });

  ipcMain.handle(
    IpcChannels.updateAppState,
    async (_event, payload: AppUiStateDto): Promise<IpcResponse<AppUiStateDto>> => {
      try {
        const request = validateAppStatePayload(payload);
        logInfo(`updateAppState request: ${JSON.stringify(request)}`, "ipc");
        const next = appUiStateRepository.upsert({
          activeDatasetId: request.activeDatasetId,
          filters: request.filters,
        });
        return ok(toAppUiStateDto(next));
      } catch (error) {
        logError(`updateAppState error: ${String(error)}`, "ipc");
        return fail<AppUiStateDto>((error as Error).message, "UPDATE_APP_STATE_FAILED");
      }
    },
  );
}

