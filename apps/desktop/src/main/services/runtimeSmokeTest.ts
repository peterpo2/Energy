import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  aggregateDaily,
  aggregateHourly,
  aggregateMonthly,
  findOptimalNightWindows,
} from "@analytics";
import { exportResults } from "@export";
import { buildMeasurementPoints } from "@ingestion";
import {
  AggregateRepository,
  AppUiStateRepository,
  DatasetRepository,
  MeasurementRepository,
  NightWindowRepository,
  SettingsRepository,
  SqliteClient,
} from "@persistence";
import { getCurrentLogDir, logError, logInfo } from "./logger";
import { mainBgText } from "../i18n/bg";

function resolveMonthKey(timestampUtcMs: number | null): string {
  const target = timestampUtcMs ? new Date(timestampUtcMs) : new Date();
  return target.toISOString().slice(0, 7);
}

export async function runRuntimeSmokeTest(
  sqlite: SqliteClient,
  excelFilePath: string,
): Promise<void> {
  logInfo(`${mainBgText.log.runtimeSmokeStarted} file=${excelFilePath}`, "smoke");

  const datasetRepository = new DatasetRepository(sqlite.db);
  const measurementRepository = new MeasurementRepository(sqlite.db);
  const aggregateRepository = new AggregateRepository(sqlite.db);
  const nightWindowRepository = new NightWindowRepository(sqlite.db);
  const settingsRepository = new SettingsRepository(sqlite.db);
  const appUiStateRepository = new AppUiStateRepository(sqlite.db);
  const settings = settingsRepository.get();

  const importResult = buildMeasurementPoints({
    filePath: excelFilePath,
    expectedSamplingMinutes: settings.expectedSamplingMinutes,
    analysisTimeZone: settings.analysisTimeZone,
  });

  datasetRepository.upsert(importResult.metadata);
  measurementRepository.replaceForDataset(importResult.metadata.datasetId, importResult.rows);
  appUiStateRepository.upsert({
    activeDatasetId: importResult.metadata.datasetId,
    filters: {
      datasetId: importResult.metadata.datasetId,
      fromUtcMs: null,
      toUtcMs: null,
      interval: "hourly",
    },
  });

  const analyticsInput = importResult.rows.map((row) => ({
    datasetId: row.datasetId,
    timestampUtcMs: row.timestampUtcMs,
    sourceRowIndex: row.sourceRowIndex,
    productionW: row.productionW,
    consumptionW: row.consumptionW,
    gridW: row.gridW,
    purchasingW: row.purchasingW,
    feedInW: row.feedInW,
  }));

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
    importResult.metadata.datasetId,
    hourly.map((row) => ({
      datasetId: importResult.metadata.datasetId,
      bucketKey: row.bucketKey,
      bucketStartUtcMs: row.bucketStartUtcMs,
      localDate: row.localDate,
      hourOfDay: row.hourOfDay,
      yearMonth: row.bucketKey.slice(0, 7),
      metrics: row.metrics,
      expectedSamples: row.expectedSamples,
      uniqueTimestampCount: row.uniqueTimestampCount,
      completenessRatio: row.completenessRatio,
      duplicateCount: row.duplicateCount,
      gapCount: row.gapCount,
      metadata: { datasetIds: row.datasetIds },
    })),
  );
  aggregateRepository.replaceDaily(
    importResult.metadata.datasetId,
    daily.map((row) => ({
      datasetId: importResult.metadata.datasetId,
      bucketKey: row.dayKey,
      bucketStartUtcMs: row.dayStartUtcMs,
      localDate: row.dayKey,
      hourOfDay: null,
      yearMonth: row.dayKey.slice(0, 7),
      metrics: row.metrics,
      expectedSamples: row.expectedSamples,
      uniqueTimestampCount: row.uniqueTimestampCount,
      completenessRatio: row.completenessRatio,
      duplicateCount: row.duplicateCount,
      gapCount: row.gapCount,
      metadata: {
        datasetIds: row.datasetIds,
        avgHourlyConsumptionW: row.avgHourlyConsumptionW,
        minHourlyConsumptionW: row.minHourlyConsumptionW,
        maxHourlyConsumptionW: row.maxHourlyConsumptionW,
      },
    })),
  );
  aggregateRepository.replaceMonthly(
    importResult.metadata.datasetId,
    monthly.map((row) => ({
      datasetId: importResult.metadata.datasetId,
      bucketKey: row.monthKey,
      bucketStartUtcMs: row.monthStartUtcMs,
      localDate: null,
      hourOfDay: null,
      yearMonth: row.monthKey,
      metrics: row.metrics,
      expectedSamples: row.expectedSamples,
      uniqueTimestampCount: row.uniqueTimestampCount,
      completenessRatio: row.completenessRatio,
      duplicateCount: row.duplicateCount,
      gapCount: row.gapCount,
      metadata: {
        datasetIds: row.datasetIds,
        daysCovered: row.daysCovered,
        averageDailyConsumptionWh: row.averageDailyConsumptionWh,
        averageDailyConsumptionKwh: row.averageDailyConsumptionKwh,
        hourlyConsumptionProfile: row.hourlyConsumptionProfile,
      },
    })),
  );

  const monthKey = resolveMonthKey(importResult.metadata.firstTimestampUtcMs);
  const night = findOptimalNightWindows(hourly, {
    monthKey,
    nightStartLocalTime: settings.defaultNightStart,
    nightEndLocalTime: settings.defaultNightEnd,
    minDaysRequired: settings.minDaysRequiredForRecommendation,
  });

  const allCandidates = Object.values(night.candidatesByDuration).flat();
  nightWindowRepository.upsertAnalysis({
    analysis: {
      datasetId: importResult.metadata.datasetId,
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
      datasetId: importResult.metadata.datasetId,
      monthKey,
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

  const exportsDir = path.join(getCurrentLogDir(), "runtime-smoke-export");
  mkdirSync(exportsDir, { recursive: true });
  const exportPath = path.join(exportsDir, "runtime-smoke-export.xlsx");
  exportResults({
    exportType: "full_report",
    format: "xlsx",
    destinationPath: exportPath,
    datasetId: importResult.metadata.datasetId,
    aggregates: {
      hourly: aggregateRepository.listHourly({ datasetId: importResult.metadata.datasetId }),
      daily: aggregateRepository.listDaily({ datasetId: importResult.metadata.datasetId }),
      monthly: aggregateRepository.listMonthly({ datasetId: importResult.metadata.datasetId }),
    },
    nightAnalysis: {
      analysis: nightWindowRepository.listAnalysesForDataset(importResult.metadata.datasetId)[0].analysis,
      candidates: nightWindowRepository.listAnalysesForDataset(importResult.metadata.datasetId)[0].candidates,
    },
  });

  const resultFile = path.join(getCurrentLogDir(), "runtime-smoke-result.json");
  writeFileSync(
    resultFile,
    JSON.stringify(
      {
        excelFilePath,
        datasetId: importResult.metadata.datasetId,
        rowCountRaw: importResult.metadata.rowCountRaw,
        rowCountNormalized: importResult.metadata.rowCountNormalized,
        validationIssuesCount: importResult.validation.issues.length,
        hourlyCount: hourly.length,
        dailyCount: daily.length,
        monthlyCount: monthly.length,
        nightAvailableDays: night.availableDays,
        topRecommendations: night.top3OverallRecommendations.map((item) => ({
          label: `${item.candidate.startLocalTime} - ${item.candidate.endLocalTime}`,
          score: item.candidate.finalRecommendationScore,
        })),
        exportPath,
      },
      null,
      2,
    ),
    "utf8",
  );

  logInfo(mainBgText.log.runtimeSmokeFinished, "smoke");
}

export async function runRuntimeSmokeTestWithExit(
  sqlite: SqliteClient,
  excelFilePath: string,
): Promise<never> {
  try {
    await runRuntimeSmokeTest(sqlite, excelFilePath);
    process.exit(0);
  } catch (error) {
    logError(`runtimeSmoke error: ${String(error)}`, "smoke");
    process.exit(1);
  }
}
