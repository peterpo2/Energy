import path from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import {
  aggregateDaily,
  aggregateHourly,
  aggregateMonthly,
  findOptimalNightWindows,
} from "../packages/analytics/src/index";
import { exportResults } from "../packages/export/src/index";
import { buildMeasurementPoints } from "../packages/ingestion/src/normalization/buildMeasurementPoints";
import {
  AggregateRepository,
  createSqliteClient,
  DatasetRepository,
  MeasurementRepository,
  NightWindowRepository,
  SettingsRepository,
} from "../packages/persistence/src/index";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node test-real-flow.js <xlsx-file>");
  process.exit(1);
}

const tempDir = path.resolve(".tmp-real-flow");
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

const sqlite = createSqliteClient({
  dbPath: path.join(tempDir, "energy.db"),
  migrationsDir: path.resolve("packages/persistence/src/db/migrations"),
});

const datasetRepository = new DatasetRepository(sqlite.db);
const measurementRepository = new MeasurementRepository(sqlite.db);
const aggregateRepository = new AggregateRepository(sqlite.db);
const nightRepository = new NightWindowRepository(sqlite.db);
const settingsRepository = new SettingsRepository(sqlite.db);

const settings = settingsRepository.get();
const imported = buildMeasurementPoints({
  filePath,
  expectedSamplingMinutes: settings.expectedSamplingMinutes,
  analysisTimeZone: settings.analysisTimeZone,
});

datasetRepository.upsert(imported.metadata);
measurementRepository.replaceForDataset(imported.metadata.datasetId, imported.rows);

const analyticsInput = imported.rows.map((row) => ({
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
  imported.metadata.datasetId,
  hourly.map((row) => ({
    datasetId: imported.metadata.datasetId,
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
  imported.metadata.datasetId,
  daily.map((row) => ({
    datasetId: imported.metadata.datasetId,
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
      avgHourlyConsumptionW: row.avgHourlyConsumptionW,
      minHourlyConsumptionW: row.minHourlyConsumptionW,
      maxHourlyConsumptionW: row.maxHourlyConsumptionW,
    },
  })),
);

aggregateRepository.replaceMonthly(
  imported.metadata.datasetId,
  monthly.map((row) => ({
    datasetId: imported.metadata.datasetId,
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
      daysCovered: row.daysCovered,
      averageDailyConsumptionWh: row.averageDailyConsumptionWh,
      averageDailyConsumptionKwh: row.averageDailyConsumptionKwh,
      hourlyConsumptionProfile: row.hourlyConsumptionProfile,
    },
  })),
);

const targetMonth = imported.metadata.firstTimestampUtcMs
  ? new Date(imported.metadata.firstTimestampUtcMs).toISOString().slice(0, 7)
  : new Date().toISOString().slice(0, 7);

const night = findOptimalNightWindows(hourly, {
  monthKey: targetMonth,
  nightStartLocalTime: settings.defaultNightStart,
  nightEndLocalTime: settings.defaultNightEnd,
  minDaysRequired: settings.minDaysRequiredForRecommendation,
});

const allCandidates = Object.values(night.candidatesByDuration).flat();
nightRepository.upsertAnalysis({
  analysis: {
    datasetId: imported.metadata.datasetId,
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
    datasetId: imported.metadata.datasetId,
    monthKey: night.monthKey,
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

const exportPath = path.join(tempDir, "aggregates.csv");
exportResults({
  exportType: "aggregates",
  format: "csv",
  destinationPath: exportPath,
  datasetId: imported.metadata.datasetId,
  aggregates: {
    hourly: aggregateRepository.listHourly({ datasetId: imported.metadata.datasetId }),
    daily: aggregateRepository.listDaily({ datasetId: imported.metadata.datasetId }),
    monthly: aggregateRepository.listMonthly({ datasetId: imported.metadata.datasetId }),
  },
});

console.log(
  JSON.stringify(
    {
      datasetId: imported.metadata.datasetId,
      rowCountRaw: imported.metadata.rowCountRaw,
      rowCountNormalized: imported.metadata.rowCountNormalized,
      validationIssues: imported.validation.issues.length,
      hourlyCount: hourly.length,
      dailyCount: daily.length,
      monthlyCount: monthly.length,
      nightRecommendations: night.top3OverallRecommendations.length,
      warnings: night.warnings,
      exportPath,
    },
    null,
    2,
  ),
);

sqlite.close();
