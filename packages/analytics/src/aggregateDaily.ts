import {
  aggregateHourly,
  AggregateOptions,
  HourlySummaryRow,
  MetricAggregate,
  MetricName,
  NormalizedMeasurementInput,
} from "./aggregateHourly";
import { average, max, min, sum } from "./math";
import { getDayBucketStartUtcMs } from "./timeBuckets";

export interface DailySummaryRow {
  dayKey: string;
  dayStartUtcMs: number;
  datasetIds: string[];
  metrics: Record<MetricName, MetricAggregate>;
  avgHourlyConsumptionW: number | null;
  minHourlyConsumptionW: number | null;
  maxHourlyConsumptionW: number | null;
  expectedSamples: number;
  uniqueTimestampCount: number;
  completenessRatio: number;
  duplicateCount: number;
  gapCount: number;
}

const METRICS: MetricName[] = [
  "productionW",
  "consumptionW",
  "gridW",
  "purchasingW",
  "feedInW",
];

function mergeMetric(metric: MetricName, hourlyRows: HourlySummaryRow[]): MetricAggregate {
  const sampleCount = sum(hourlyRows.map((h) => h.metrics[metric].sampleCount));
  const missingSampleCount = sum(hourlyRows.map((h) => h.metrics[metric].missingSampleCount));
  const estimatedWh = sum(hourlyRows.map((h) => h.metrics[metric].estimatedWh));

  const minCandidates = hourlyRows
    .map((h) => h.metrics[metric].minW)
    .filter((v): v is number => v !== null);
  const maxCandidates = hourlyRows
    .map((h) => h.metrics[metric].maxW)
    .filter((v): v is number => v !== null);

  let avgW: number | null = null;
  if (sampleCount > 0) {
    const weightedSum = sum(hourlyRows.map((h) => (h.metrics[metric].avgW ?? 0) * h.metrics[metric].sampleCount));
    avgW = weightedSum / sampleCount;
  }

  return {
    avgW,
    minW: min(minCandidates),
    maxW: max(maxCandidates),
    estimatedWh,
    estimatedKwh: estimatedWh / 1000,
    sampleCount,
    missingSampleCount,
  };
}

export function aggregateDaily(
  rows: NormalizedMeasurementInput[],
  options?: AggregateOptions,
): DailySummaryRow[] {
  const timeZone = options?.timeZone ?? "UTC";
  const hourly = aggregateHourly(rows, options);
  const byDay = new Map<string, HourlySummaryRow[]>();

  for (const hour of hourly) {
    if (!byDay.has(hour.localDate)) {
      byDay.set(hour.localDate, []);
    }
    byDay.get(hour.localDate)?.push(hour);
  }

  const daily: DailySummaryRow[] = [];
  for (const [dayKey, dayHours] of byDay.entries()) {
    const metrics = {} as Record<MetricName, MetricAggregate>;
    for (const metric of METRICS) {
      metrics[metric] = mergeMetric(metric, dayHours);
    }

    const hourlyConsumptionAverages = dayHours
      .map((h) => h.metrics.consumptionW.avgW)
      .filter((v): v is number => v !== null);

    const expectedSamples = sum(dayHours.map((h) => h.expectedSamples));
    const uniqueTimestampCount = sum(dayHours.map((h) => h.uniqueTimestampCount));

    daily.push({
      dayKey,
      dayStartUtcMs: getDayBucketStartUtcMs(dayKey, { timeZone }),
      datasetIds: Array.from(new Set(dayHours.flatMap((h) => h.datasetIds))),
      metrics,
      avgHourlyConsumptionW: average(hourlyConsumptionAverages),
      minHourlyConsumptionW: min(hourlyConsumptionAverages),
      maxHourlyConsumptionW: max(hourlyConsumptionAverages),
      expectedSamples,
      uniqueTimestampCount,
      completenessRatio: expectedSamples > 0 ? Math.min(1, uniqueTimestampCount / expectedSamples) : 1,
      duplicateCount: sum(dayHours.map((h) => h.duplicateCount)),
      gapCount: sum(dayHours.map((h) => h.gapCount)),
    });
  }

  return daily.sort((a, b) => a.dayStartUtcMs - b.dayStartUtcMs);
}

