import { HourlySummaryRow } from "../aggregateHourly";
import { clamp01, max, min } from "../math";
import {
  formatHourLabel,
  isHourSequenceInsideNightWindow,
  ParsedNightWindow,
} from "./filterNightHours";

export interface NightHourRankingRow {
  monthKey: string;
  hourOfDay: number;
  hourLabel: string;
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
  score: number;
  rank: number;
}

export interface ChargingWindowCandidate {
  monthKey: string;
  startHourOfDay: number;
  endHourOfDay: number;
  startLocalTime: string;
  endLocalTime: string;
  durationHours: number;
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
  rank: number;
}

export interface BuildNightCandidatesInput {
  monthKey: string;
  monthRows: HourlySummaryRow[];
  availableDays: string[];
  parsedNightWindow: ParsedNightWindow;
  durationsHours: number[];
  minDaysRequired: number;
}

export interface BuildNightCandidatesResult {
  hourRankingBase: NightHourRankingRow[];
  candidates: ChargingWindowCandidate[];
}

function calculateVariance(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (values.length - 1);
  return variance;
}

function calculateStabilityScore(avg: number | null, stdDev: number | null): number {
  if (avg === null || stdDev === null) {
    return 0;
  }
  if (avg === 0) {
    return stdDev === 0 ? 1 : 0;
  }
  const cv = Math.abs(stdDev / avg);
  return clamp01(1 / (1 + cv));
}

function buildDayHourMap(rows: HourlySummaryRow[]): Map<string, Map<number, HourlySummaryRow>> {
  const byDay = new Map<string, Map<number, HourlySummaryRow>>();

  for (const row of rows) {
    if (!byDay.has(row.localDate)) {
      byDay.set(row.localDate, new Map<number, HourlySummaryRow>());
    }
    byDay.get(row.localDate)?.set(row.hourOfDay, row);
  }

  return byDay;
}

function rankHourRows(rows: NightHourRankingRow[]): NightHourRankingRow[] {
  if (rows.length === 0) {
    return [];
  }

  const avgValues = rows
    .map((r) => r.averageConsumptionW)
    .filter((v): v is number => v !== null);
  const totalValues = rows.map((r) => r.totalEstimatedConsumptionWh);
  const minAvg = avgValues.length > 0 ? Math.min(...avgValues) : 0;
  const maxAvg = avgValues.length > 0 ? Math.max(...avgValues) : 1;
  const minTotal = Math.min(...totalValues);
  const maxTotal = Math.max(...totalValues);

  const normalizeLow = (v: number, minValue: number, maxValue: number): number => {
    if (maxValue <= minValue) {
      return 1;
    }
    return clamp01((maxValue - v) / (maxValue - minValue));
  };

  const scored = rows.map((row) => {
    const avgTerm =
      row.averageConsumptionW === null ? 0 : normalizeLow(row.averageConsumptionW, minAvg, maxAvg);
    const totalTerm = normalizeLow(row.totalEstimatedConsumptionWh, minTotal, maxTotal);
    const qualityTerm = clamp01(
      row.completenessRatio * (1 - 0.5 * row.duplicateImpact) * (1 - 0.5 * row.gapImpact),
    );
    const score =
      avgTerm * 0.45 + totalTerm * 0.2 + row.stabilityScore * 0.2 + qualityTerm * 0.15;
    return { ...row, score };
  });

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  return ranked.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export function buildHourRanking(
  monthKey: string,
  monthRows: HourlySummaryRow[],
  availableDays: string[],
  parsedNightWindow: ParsedNightWindow,
): NightHourRankingRow[] {
  const nightRows = monthRows.filter((row) =>
    isHourSequenceInsideNightWindow(row.hourOfDay, 1, parsedNightWindow),
  );
  const byHour = new Map<number, HourlySummaryRow[]>();
  for (const row of nightRows) {
    if (!byHour.has(row.hourOfDay)) {
      byHour.set(row.hourOfDay, []);
    }
    byHour.get(row.hourOfDay)?.push(row);
  }

  const result: NightHourRankingRow[] = [];
  const daysConsidered = availableDays.length;

  for (const [hourOfDay, hourRows] of byHour.entries()) {
    const values = hourRows
      .map((h) => h.metrics.consumptionW.avgW)
      .filter((v): v is number => v !== null);
    const totalEstimatedConsumptionWh = hourRows.reduce(
      (sum, h) => sum + h.metrics.consumptionW.estimatedWh,
      0,
    );
    const variance = calculateVariance(values);
    const stdDev = variance === null ? null : Math.sqrt(variance);
    const duplicateCount = hourRows.reduce((sum, h) => sum + h.duplicateCount, 0);
    const gapCount = hourRows.reduce((sum, h) => sum + h.gapCount, 0);
    const expectedHourSlots = Math.max(1, daysConsidered);

    result.push({
      monthKey,
      hourOfDay,
      hourLabel: formatHourLabel(hourOfDay),
      daysWithData: hourRows.length,
      averageConsumptionW:
        values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null,
      totalEstimatedConsumptionWh,
      minConsumptionW: min(values),
      maxConsumptionW: max(values),
      varianceConsumptionW: variance ?? null,
      stdDevConsumptionW: stdDev,
      stabilityScore: calculateStabilityScore(
        values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null,
        stdDev,
      ),
      completenessRatio: clamp01(hourRows.length / expectedHourSlots),
      duplicateImpact: clamp01(duplicateCount / expectedHourSlots),
      gapImpact: clamp01(gapCount / expectedHourSlots),
      rank: 0,
    });
  }

  return rankHourRows(
    result.map((r) => ({
      ...r,
      score: 0,
    })),
  );
}

export function buildNightCandidates(input: BuildNightCandidatesInput): BuildNightCandidatesResult {
  const byDayHour = buildDayHourMap(input.monthRows);
  const candidates: ChargingWindowCandidate[] = [];

  const allStartHours = Array.from({ length: 24 }, (_, i) => i).filter((hour) =>
    isHourSequenceInsideNightWindow(hour, 1, input.parsedNightWindow),
  );

  for (const durationHours of input.durationsHours) {
    for (const startHourOfDay of allStartHours) {
      if (!isHourSequenceInsideNightWindow(startHourOfDay, durationHours, input.parsedNightWindow)) {
        continue;
      }

      const dayTotalsWh: number[] = [];
      const hourlyAvgValues: number[] = [];
      let weightedConsumptionSum = 0;
      let weightedSampleCount = 0;
      let totalEstimatedConsumptionWh = 0;
      let duplicateCount = 0;
      let gapCount = 0;
      let observedHourSlots = 0;
      let daysWithData = 0;

      for (const day of input.availableDays) {
        const dayMap = byDayHour.get(day);
        if (!dayMap) {
          continue;
        }

        let dayWh = 0;
        let dayObserved = 0;
        for (let i = 0; i < durationHours; i += 1) {
          const hour = (startHourOfDay + i) % 24;
          const row = dayMap.get(hour);
          if (!row) {
            continue;
          }

          dayObserved += 1;
          observedHourSlots += 1;
          dayWh += row.metrics.consumptionW.estimatedWh;
          totalEstimatedConsumptionWh += row.metrics.consumptionW.estimatedWh;
          duplicateCount += row.duplicateCount;
          gapCount += row.gapCount;

          const avgW = row.metrics.consumptionW.avgW;
          if (avgW !== null) {
            const sampleCount = row.metrics.consumptionW.sampleCount;
            weightedConsumptionSum += avgW * sampleCount;
            weightedSampleCount += sampleCount;
            hourlyAvgValues.push(avgW);
          }
        }

        if (dayObserved > 0) {
          daysWithData += 1;
          dayTotalsWh.push(dayWh);
        }
      }

      if (daysWithData < input.minDaysRequired || observedHourSlots === 0) {
        continue;
      }

      const variance = calculateVariance(dayTotalsWh);
      const stdDev = variance === null ? null : Math.sqrt(variance);
      const averageConsumptionW =
        weightedSampleCount > 0 ? weightedConsumptionSum / weightedSampleCount : null;
      const expectedHourSlots = Math.max(1, input.availableDays.length * durationHours);

      candidates.push({
        monthKey: input.monthKey,
        startHourOfDay,
        endHourOfDay: (startHourOfDay + durationHours) % 24,
        startLocalTime: formatHourLabel(startHourOfDay),
        endLocalTime: formatHourLabel((startHourOfDay + durationHours) % 24),
        durationHours,
        durationMinutes: durationHours * 60,
        daysConsidered: input.availableDays.length,
        daysWithData,
        averageConsumptionW,
        totalEstimatedConsumptionWh,
        minConsumptionW: min(hourlyAvgValues),
        maxConsumptionW: max(hourlyAvgValues),
        varianceConsumptionW: variance ?? null,
        stdDevConsumptionW: stdDev,
        stabilityScore: calculateStabilityScore(
          dayTotalsWh.length > 0
            ? dayTotalsWh.reduce((sum, value) => sum + value, 0) / dayTotalsWh.length
            : null,
          stdDev,
        ),
        completenessRatio: clamp01(observedHourSlots / expectedHourSlots),
        duplicateImpact: clamp01(duplicateCount / expectedHourSlots),
        gapImpact: clamp01(gapCount / expectedHourSlots),
        finalRecommendationScore: 0,
        rank: 0,
      });
    }
  }

  return {
    hourRankingBase: buildHourRanking(
      input.monthKey,
      input.monthRows,
      input.availableDays,
      input.parsedNightWindow,
    ),
    candidates,
  };
}
