import { completenessScore } from "./completenessScore";
import { detectDuplicates } from "./detectDuplicates";
import { detectGaps } from "./detectGaps";
import { average, calculateSampleDeltaMinutes, max, min } from "./math";
import { getHourBucketKey, getHourBucketStartUtcMs } from "./timeBuckets";

export type MetricName =
  | "productionW"
  | "consumptionW"
  | "gridW"
  | "purchasingW"
  | "feedInW";

export interface NormalizedMeasurementInput {
  datasetId: string;
  timestampUtcMs: number;
  sourceRowIndex?: number;
  productionW: number | null;
  consumptionW: number | null;
  gridW: number | null;
  purchasingW: number | null;
  feedInW: number | null;
}

export interface AggregateOptions {
  timeZone?: string;
  expectedSamplingMinutes?: number;
  duplicateResolution?: "keep_latest" | "keep_first" | "average";
  maxSafeDeltaMinutes?: number;
}

export interface MetricAggregate {
  avgW: number | null;
  minW: number | null;
  maxW: number | null;
  estimatedWh: number;
  estimatedKwh: number;
  sampleCount: number;
  missingSampleCount: number;
}

export interface HourlySummaryRow {
  bucketKey: string;
  bucketStartUtcMs: number;
  localDate: string;
  hourOfDay: number;
  datasetIds: string[];
  metrics: Record<MetricName, MetricAggregate>;
  expectedSamples: number;
  uniqueTimestampCount: number;
  completenessRatio: number;
  duplicateCount: number;
  gapCount: number;
}

interface ResolvedSample extends NormalizedMeasurementInput {}

const METRICS: MetricName[] = [
  "productionW",
  "consumptionW",
  "gridW",
  "purchasingW",
  "feedInW",
];

function toSortedRows(rows: NormalizedMeasurementInput[]): NormalizedMeasurementInput[] {
  return [...rows].sort((a, b) => {
    if (a.timestampUtcMs !== b.timestampUtcMs) {
      return a.timestampUtcMs - b.timestampUtcMs;
    }
    return (a.sourceRowIndex ?? 0) - (b.sourceRowIndex ?? 0);
  });
}

function averageNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

function resolveDuplicates(
  rows: NormalizedMeasurementInput[],
  strategy: NonNullable<AggregateOptions["duplicateResolution"]>,
): ResolvedSample[] {
  if (rows.length === 0) {
    return [];
  }

  const sorted = toSortedRows(rows);
  const resolved: ResolvedSample[] = [];

  let i = 0;
  while (i < sorted.length) {
    const currentTs = sorted[i].timestampUtcMs;
    const group: NormalizedMeasurementInput[] = [sorted[i]];
    i += 1;
    while (i < sorted.length && sorted[i].timestampUtcMs === currentTs) {
      group.push(sorted[i]);
      i += 1;
    }

    if (group.length === 1) {
      resolved.push(group[0]);
      continue;
    }

    if (strategy === "keep_first") {
      resolved.push(group[0]);
      continue;
    }

    if (strategy === "keep_latest") {
      resolved.push(group[group.length - 1]);
      continue;
    }

    resolved.push({
      datasetId: group[group.length - 1].datasetId,
      timestampUtcMs: currentTs,
      sourceRowIndex: group[group.length - 1].sourceRowIndex,
      productionW: averageNullable(group.map((g) => g.productionW)),
      consumptionW: averageNullable(group.map((g) => g.consumptionW)),
      gridW: averageNullable(group.map((g) => g.gridW)),
      purchasingW: averageNullable(group.map((g) => g.purchasingW)),
      feedInW: averageNullable(group.map((g) => g.feedInW)),
    });
  }

  return resolved;
}

function computeMetricAggregate(
  metric: MetricName,
  samples: ResolvedSample[],
  expectedSamplingMinutes: number,
  maxSafeDeltaMinutes: number | undefined,
  expectedSamples: number,
): MetricAggregate {
  const values: number[] = [];
  let estimatedWh = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const power = sample[metric];
    if (power !== null) {
      values.push(power);
      const nextTs = i < samples.length - 1 ? samples[i + 1].timestampUtcMs : null;
      const deltaMinutes = calculateSampleDeltaMinutes(sample.timestampUtcMs, nextTs, {
        expectedSamplingMinutes,
        maxSafeDeltaMinutes,
      });
      estimatedWh += power * (deltaMinutes / 60);
    }
  }

  return {
    avgW: average(values),
    minW: min(values),
    maxW: max(values),
    estimatedWh,
    estimatedKwh: estimatedWh / 1000,
    sampleCount: values.length,
    missingSampleCount: Math.max(0, expectedSamples - values.length),
  };
}

export function aggregateHourly(
  rows: NormalizedMeasurementInput[],
  options?: AggregateOptions,
): HourlySummaryRow[] {
  const timeZone = options?.timeZone ?? "UTC";
  const expectedSamplingMinutes = options?.expectedSamplingMinutes ?? 5;
  const duplicateResolution = options?.duplicateResolution ?? "keep_latest";
  const periodMinutes = 60;

  const buckets = new Map<string, NormalizedMeasurementInput[]>();
  for (const row of rows) {
    const key = getHourBucketKey(row.timestampUtcMs, { timeZone });
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)?.push(row);
  }

  const summaries: HourlySummaryRow[] = [];

  for (const [bucketKey, bucketRows] of buckets.entries()) {
    const duplicateGroups = detectDuplicates(bucketRows);
    const duplicateCount = duplicateGroups.reduce((sum, group) => sum + (group.count - 1), 0);
    const resolvedSamples = resolveDuplicates(bucketRows, duplicateResolution);
    const sortedResolved = toSortedRows(resolvedSamples);
    const gaps = detectGaps(
      sortedResolved.map((r) => r.timestampUtcMs),
      expectedSamplingMinutes,
    );

    const completeness = completenessScore({
      uniqueSampleCount: sortedResolved.length,
      periodMinutes,
      expectedSamplingMinutes,
    });

    const metrics = {} as Record<MetricName, MetricAggregate>;
    for (const metric of METRICS) {
      metrics[metric] = computeMetricAggregate(
        metric,
        sortedResolved,
        expectedSamplingMinutes,
        options?.maxSafeDeltaMinutes,
        completeness.expectedSamples,
      );
    }

    const [localDate, hourText] = bucketKey.split("T");

    summaries.push({
      bucketKey,
      bucketStartUtcMs: getHourBucketStartUtcMs(bucketKey, { timeZone }),
      localDate,
      hourOfDay: Number(hourText),
      datasetIds: Array.from(new Set(bucketRows.map((r) => r.datasetId))),
      metrics,
      expectedSamples: completeness.expectedSamples,
      uniqueTimestampCount: sortedResolved.length,
      completenessRatio: completeness.ratio,
      duplicateCount,
      gapCount: gaps.length,
    });
  }

  return summaries.sort((a, b) => a.bucketStartUtcMs - b.bucketStartUtcMs);
}

