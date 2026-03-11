import { HourlySummaryRow } from "../aggregateHourly";
import { clamp01 } from "../math";
import {
  buildNightCandidates,
  ChargingWindowCandidate,
  NightHourRankingRow,
} from "./buildNightCandidates";
import { filterNightHours } from "./filterNightHours";
import { scoreNightHours, scoreNightWindows } from "./scoreNightWindows";

export interface NightAnalysisOptions {
  monthKey: string;
  nightStartLocalTime?: string;
  nightEndLocalTime?: string;
  durationsHours?: number[];
  minDaysRequired?: number;
}

export interface RecommendationWithExplanation {
  candidate: ChargingWindowCandidate;
  explanation: string;
}

export interface NightWindowAnalysisResult {
  monthKey: string;
  nightStartLocalTime: string;
  nightEndLocalTime: string;
  availableDays: number;
  analyzedHours: number;
  hourRanking: NightHourRankingRow[];
  candidatesByDuration: Record<number, ChargingWindowCandidate[]>;
  best1HourWindow: RecommendationWithExplanation | null;
  best2HourWindow: RecommendationWithExplanation | null;
  best3HourWindow: RecommendationWithExplanation | null;
  best4HourWindow: RecommendationWithExplanation | null;
  top3OverallRecommendations: RecommendationWithExplanation[];
  warnings: string[];
}

function formatScorePercent(score: number): string {
  return `${Math.round(clamp01(score) * 100)}%`;
}

function buildRecommendationExplanation(candidate: ChargingWindowCandidate): string {
  const parts: string[] = [];
  if (candidate.averageConsumptionW !== null) {
    parts.push(`avg ${candidate.averageConsumptionW.toFixed(0)}W`);
  }
  parts.push(`total ${candidate.totalEstimatedConsumptionWh.toFixed(0)}Wh`);
  parts.push(`stability ${formatScorePercent(candidate.stabilityScore)}`);
  parts.push(`completeness ${formatScorePercent(candidate.completenessRatio)}`);
  parts.push(
    `quality penalty ${formatScorePercent((candidate.duplicateImpact + candidate.gapImpact) / 2)}`,
  );

  return `${candidate.startLocalTime}-${candidate.endLocalTime} (${candidate.durationHours}h): ${parts.join(", ")}.`;
}

function pickBestByDuration(
  candidatesByDuration: Record<number, ChargingWindowCandidate[]>,
  duration: number,
): RecommendationWithExplanation | null {
  const rows = candidatesByDuration[duration] ?? [];
  if (rows.length === 0) {
    return null;
  }
  const best = rows[0];
  return {
    candidate: best,
    explanation: buildRecommendationExplanation(best),
  };
}

export function findOptimalNightWindows(
  hourlyRows: HourlySummaryRow[],
  options: NightAnalysisOptions,
): NightWindowAnalysisResult {
  const nightStartLocalTime = options.nightStartLocalTime ?? "22:00";
  const nightEndLocalTime = options.nightEndLocalTime ?? "07:00";
  const durationsHours = options.durationsHours ?? [1, 2, 3, 4];
  const minDaysRequired = options.minDaysRequired ?? 5;

  const filtered = filterNightHours({
    hourlyRows,
    monthKey: options.monthKey,
    nightWindow: {
      startLocalTime: nightStartLocalTime,
      endLocalTime: nightEndLocalTime,
    },
  });

  const warnings: string[] = [];
  if (filtered.monthRows.length === 0) {
    warnings.push(`No hourly rows found for month ${options.monthKey}.`);
  }
  if (filtered.availableDays.length < minDaysRequired) {
    warnings.push(
      `Only ${filtered.availableDays.length} day(s) available for ${options.monthKey}; recommendations may be weak.`,
    );
  }

  const built = buildNightCandidates({
    monthKey: options.monthKey,
    monthRows: filtered.monthRows,
    availableDays: filtered.availableDays,
    parsedNightWindow: filtered.parsedNightWindow,
    durationsHours,
    minDaysRequired,
  });

  const scoredHourRanking = scoreNightHours(built.hourRankingBase);

  const candidatesByDuration: Record<number, ChargingWindowCandidate[]> = {};
  for (const duration of durationsHours) {
    const subset = built.candidates.filter((c) => c.durationHours === duration);
    candidatesByDuration[duration] = scoreNightWindows(subset);
  }

  const allRankedCandidates = Object.values(candidatesByDuration).flat();
  const top3OverallRecommendations = [...allRankedCandidates]
    .sort((a, b) => b.finalRecommendationScore - a.finalRecommendationScore)
    .slice(0, 3)
    .map((candidate) => ({
      candidate,
      explanation: buildRecommendationExplanation(candidate),
    }));

  if (allRankedCandidates.length === 0) {
    warnings.push(
      "Not enough valid night windows to rank. Try a wider night range or lower minimum day requirement.",
    );
  }

  return {
    monthKey: options.monthKey,
    nightStartLocalTime,
    nightEndLocalTime,
    availableDays: filtered.availableDays.length,
    analyzedHours: filtered.nightRows.length,
    hourRanking: scoredHourRanking,
    candidatesByDuration,
    best1HourWindow: pickBestByDuration(candidatesByDuration, 1),
    best2HourWindow: pickBestByDuration(candidatesByDuration, 2),
    best3HourWindow: pickBestByDuration(candidatesByDuration, 3),
    best4HourWindow: pickBestByDuration(candidatesByDuration, 4),
    top3OverallRecommendations,
    warnings,
  };
}

