import {
  aggregateHourly,
  AggregateOptions,
  HourlySummaryRow,
  MetricAggregate,
  MetricName,
  NormalizedMeasurementInput,
} from "./aggregateHourly";
import { aggregateDaily, DailySummaryRow } from "./aggregateDaily";
import { average, max, min, sum } from "./math";
import { getMonthBucketKey, getMonthBucketStartUtcMs } from "./timeBuckets";

export interface HourlyProfilePoint {
  hourOfDay: number;
  avgConsumptionW: number | null;
}

export interface MonthlySummaryRow {
  monthKey: string;
  monthStartUtcMs: number;
  datasetIds: string[];
  daysCovered: number;
  metrics: Record<MetricName, MetricAggregate>;
  averageDailyConsumptionWh: number | null;
  averageDailyConsumptionKwh: number | null;
  hourlyConsumptionProfile: HourlyProfilePoint[];
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

function mergeMetricFromDaily(metric: MetricName, dailyRows: DailySummaryRow[]): MetricAggregate {
  const sampleCount = sum(dailyRows.map((d) => d.metrics[metric].sampleCount));
  const missingSampleCount = sum(dailyRows.map((d) => d.metrics[metric].missingSampleCount));
  const estimatedWh = sum(dailyRows.map((d) => d.metrics[metric].estimatedWh));

  const minCandidates = dailyRows
    .map((d) => d.metrics[metric].minW)
    .filter((v): v is number => v !== null);
  const maxCandidates = dailyRows
    .map((d) => d.metrics[metric].maxW)
    .filter((v): v is number => v !== null);

  let avgW: number | null = null;
  if (sampleCount > 0) {
    const weightedSum = sum(dailyRows.map((d) => (d.metrics[metric].avgW ?? 0) * d.metrics[metric].sampleCount));
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

function buildHourlyConsumptionProfile(hourlyRows: HourlySummaryRow[]): HourlyProfilePoint[] {
  const byHour = new Map<number, number[]>();
  for (const hourRow of hourlyRows) {
    const consumptionAvg = hourRow.metrics.consumptionW.avgW;
    if (consumptionAvg === null) {
      continue;
    }
    if (!byHour.has(hourRow.hourOfDay)) {
      byHour.set(hourRow.hourOfDay, []);
    }
    byHour.get(hourRow.hourOfDay)?.push(consumptionAvg);
  }

  const profile: HourlyProfilePoint[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const values = byHour.get(hour) ?? [];
    profile.push({
      hourOfDay: hour,
      avgConsumptionW: values.length > 0 ? average(values) : null,
    });
  }
  return profile;
}

export function aggregateMonthly(
  rows: NormalizedMeasurementInput[],
  options?: AggregateOptions,
): MonthlySummaryRow[] {
  const timeZone = options?.timeZone ?? "UTC";
  const daily = aggregateDaily(rows, options);
  const hourly = aggregateHourly(rows, options);

  const byMonthDaily = new Map<string, DailySummaryRow[]>();
  for (const day of daily) {
    const monthKey = day.dayKey.slice(0, 7);
    if (!byMonthDaily.has(monthKey)) {
      byMonthDaily.set(monthKey, []);
    }
    byMonthDaily.get(monthKey)?.push(day);
  }

  const byMonthHourly = new Map<string, HourlySummaryRow[]>();
  for (const hour of hourly) {
    const monthKey = getMonthBucketKey(hour.bucketStartUtcMs, { timeZone });
    if (!byMonthHourly.has(monthKey)) {
      byMonthHourly.set(monthKey, []);
    }
    byMonthHourly.get(monthKey)?.push(hour);
  }

  const monthly: MonthlySummaryRow[] = [];
  for (const [monthKey, monthDays] of byMonthDaily.entries()) {
    const monthHours = byMonthHourly.get(monthKey) ?? [];
    const metrics = {} as Record<MetricName, MetricAggregate>;
    for (const metric of METRICS) {
      metrics[metric] = mergeMetricFromDaily(metric, monthDays);
    }

    const dailyConsumptionWh = monthDays.map((d) => d.metrics.consumptionW.estimatedWh);
    const avgDailyWh = dailyConsumptionWh.length > 0 ? average(dailyConsumptionWh) : null;

    const expectedSamples = sum(monthDays.map((d) => d.expectedSamples));
    const uniqueTimestampCount = sum(monthDays.map((d) => d.uniqueTimestampCount));

    monthly.push({
      monthKey,
      monthStartUtcMs: getMonthBucketStartUtcMs(monthKey, { timeZone }),
      datasetIds: Array.from(new Set(monthDays.flatMap((d) => d.datasetIds))),
      daysCovered: monthDays.length,
      metrics,
      averageDailyConsumptionWh: avgDailyWh,
      averageDailyConsumptionKwh: avgDailyWh === null ? null : avgDailyWh / 1000,
      hourlyConsumptionProfile: buildHourlyConsumptionProfile(monthHours),
      expectedSamples,
      uniqueTimestampCount,
      completenessRatio: expectedSamples > 0 ? Math.min(1, uniqueTimestampCount / expectedSamples) : 1,
      duplicateCount: sum(monthDays.map((d) => d.duplicateCount)),
      gapCount: sum(monthDays.map((d) => d.gapCount)),
    });
  }

  return monthly.sort((a, b) => a.monthStartUtcMs - b.monthStartUtcMs);
}

