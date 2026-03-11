import { ChargingWindowCandidate, NightHourRankingRow } from "./buildNightCandidates";
import { clamp01 } from "../math";

export interface ScoreWeights {
  averageConsumption: number;
  totalConsumption: number;
  stability: number;
  completeness: number;
  qualityPenalty: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  averageConsumption: 0.35,
  totalConsumption: 0.2,
  stability: 0.2,
  completeness: 0.15,
  qualityPenalty: 0.1,
};

function normalizeLowerBetter(value: number, minValue: number, maxValue: number): number {
  if (maxValue <= minValue) {
    return 1;
  }
  return clamp01((maxValue - value) / (maxValue - minValue));
}

function normalizeHigherBetter(value: number, minValue: number, maxValue: number): number {
  if (maxValue <= minValue) {
    return 1;
  }
  return clamp01((value - minValue) / (maxValue - minValue));
}

export function scoreNightWindows(
  candidates: ChargingWindowCandidate[],
  weights?: Partial<ScoreWeights>,
): ChargingWindowCandidate[] {
  if (candidates.length === 0) {
    return [];
  }

  const resolvedWeights: ScoreWeights = {
    ...DEFAULT_WEIGHTS,
    ...(weights ?? {}),
  };

  const avgValues = candidates
    .map((c) => c.averageConsumptionW)
    .filter((v): v is number => v !== null);
  const totalValues = candidates.map((c) => c.totalEstimatedConsumptionWh);
  const stabilityValues = candidates.map((c) => c.stabilityScore);
  const completenessValues = candidates.map((c) => c.completenessRatio);

  const minAvg = avgValues.length > 0 ? Math.min(...avgValues) : 0;
  const maxAvg = avgValues.length > 0 ? Math.max(...avgValues) : 1;
  const minTotal = Math.min(...totalValues);
  const maxTotal = Math.max(...totalValues);
  const minStability = Math.min(...stabilityValues);
  const maxStability = Math.max(...stabilityValues);
  const minCompleteness = Math.min(...completenessValues);
  const maxCompleteness = Math.max(...completenessValues);

  const scored = candidates.map((candidate) => {
    const avgTerm =
      candidate.averageConsumptionW === null
        ? 0
        : normalizeLowerBetter(candidate.averageConsumptionW, minAvg, maxAvg);
    const totalTerm = normalizeLowerBetter(
      candidate.totalEstimatedConsumptionWh,
      minTotal,
      maxTotal,
    );
    const stabilityTerm = normalizeHigherBetter(
      candidate.stabilityScore,
      minStability,
      maxStability,
    );
    const completenessTerm = normalizeHigherBetter(
      candidate.completenessRatio,
      minCompleteness,
      maxCompleteness,
    );
    const qualityPenalty = clamp01((candidate.duplicateImpact + candidate.gapImpact) / 2);
    const qualityTerm = 1 - qualityPenalty;

    const finalRecommendationScore =
      avgTerm * resolvedWeights.averageConsumption +
      totalTerm * resolvedWeights.totalConsumption +
      stabilityTerm * resolvedWeights.stability +
      completenessTerm * resolvedWeights.completeness +
      qualityTerm * resolvedWeights.qualityPenalty;

    return { ...candidate, finalRecommendationScore };
  });

  const ranked = [...scored].sort((a, b) => b.finalRecommendationScore - a.finalRecommendationScore);
  return ranked.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function scoreNightHours(rows: NightHourRankingRow[]): NightHourRankingRow[] {
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

  const scored = rows.map((row) => {
    const avgTerm =
      row.averageConsumptionW === null ? 0 : normalizeLowerBetter(row.averageConsumptionW, minAvg, maxAvg);
    const totalTerm = normalizeLowerBetter(row.totalEstimatedConsumptionWh, minTotal, maxTotal);
    const qualityPenalty = clamp01((row.duplicateImpact + row.gapImpact) / 2);
    const qualityTerm = clamp01(row.completenessRatio * (1 - qualityPenalty));

    const score = avgTerm * 0.5 + totalTerm * 0.2 + row.stabilityScore * 0.2 + qualityTerm * 0.1;
    return { ...row, score };
  });

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  return ranked.map((row, index) => ({ ...row, rank: index + 1 }));
}

