import {
  AggregateEntity,
  NightWindowAnalysisEntity,
  NightWindowCandidateEntity,
} from "../contracts/PersistenceTypes";

export interface AggregateDbRow {
  dataset_id: string;
  bucket_key: string;
  bucket_start_utc_ms: number;
  local_date?: string | null;
  hour_of_day?: number | null;
  year_month?: string | null;
  metrics_json: string;
  expected_samples: number;
  unique_timestamp_count: number;
  completeness_ratio: number;
  duplicate_count: number;
  gap_count: number;
  metadata_json?: string | null;
}

export function aggregateToDbRow(entity: AggregateEntity): AggregateDbRow {
  return {
    dataset_id: entity.datasetId,
    bucket_key: entity.bucketKey,
    bucket_start_utc_ms: entity.bucketStartUtcMs,
    local_date: entity.localDate,
    hour_of_day: entity.hourOfDay,
    year_month: entity.yearMonth,
    metrics_json: JSON.stringify(entity.metrics ?? {}),
    expected_samples: entity.expectedSamples,
    unique_timestamp_count: entity.uniqueTimestampCount,
    completeness_ratio: entity.completenessRatio,
    duplicate_count: entity.duplicateCount,
    gap_count: entity.gapCount,
    metadata_json: entity.metadata ? JSON.stringify(entity.metadata) : null,
  };
}

export function aggregateFromDbRow(row: AggregateDbRow): AggregateEntity {
  return {
    datasetId: row.dataset_id,
    bucketKey: row.bucket_key,
    bucketStartUtcMs: row.bucket_start_utc_ms,
    localDate: row.local_date ?? null,
    hourOfDay: row.hour_of_day ?? null,
    yearMonth: row.year_month ?? null,
    metrics: safeJsonObject(row.metrics_json),
    expectedSamples: row.expected_samples,
    uniqueTimestampCount: row.unique_timestamp_count,
    completenessRatio: row.completeness_ratio,
    duplicateCount: row.duplicate_count,
    gapCount: row.gap_count,
    metadata: row.metadata_json ? safeJsonObject(row.metadata_json) : null,
  };
}

export interface NightWindowAnalysisDbRow {
  analysis_id: string;
  dataset_id: string;
  month_key: string;
  night_start_local_time: string;
  night_end_local_time: string;
  available_days: number;
  analyzed_hours: number;
  hour_ranking_json: string;
  best_1h_window_json: string | null;
  best_2h_window_json: string | null;
  best_3h_window_json: string | null;
  best_4h_window_json: string | null;
  top_3_overall_json: string;
  warnings_json: string;
}

export function nightAnalysisToDbRow(
  analysisId: string,
  entity: NightWindowAnalysisEntity,
): NightWindowAnalysisDbRow {
  return {
    analysis_id: analysisId,
    dataset_id: entity.datasetId,
    month_key: entity.monthKey,
    night_start_local_time: entity.nightStartLocalTime,
    night_end_local_time: entity.nightEndLocalTime,
    available_days: entity.availableDays,
    analyzed_hours: entity.analyzedHours,
    hour_ranking_json: JSON.stringify(entity.hourRanking ?? []),
    best_1h_window_json: entity.best1HourWindow ? JSON.stringify(entity.best1HourWindow) : null,
    best_2h_window_json: entity.best2HourWindow ? JSON.stringify(entity.best2HourWindow) : null,
    best_3h_window_json: entity.best3HourWindow ? JSON.stringify(entity.best3HourWindow) : null,
    best_4h_window_json: entity.best4HourWindow ? JSON.stringify(entity.best4HourWindow) : null,
    top_3_overall_json: JSON.stringify(entity.top3OverallRecommendations ?? []),
    warnings_json: JSON.stringify(entity.warnings ?? []),
  };
}

export function nightAnalysisFromDbRow(row: NightWindowAnalysisDbRow): {
  analysisId: string;
  data: NightWindowAnalysisEntity;
} {
  return {
    analysisId: row.analysis_id,
    data: {
      datasetId: row.dataset_id,
      monthKey: row.month_key,
      nightStartLocalTime: row.night_start_local_time,
      nightEndLocalTime: row.night_end_local_time,
      availableDays: row.available_days,
      analyzedHours: row.analyzed_hours,
      hourRanking: safeJsonArray(row.hour_ranking_json),
      best1HourWindow: safeJsonNullable(row.best_1h_window_json),
      best2HourWindow: safeJsonNullable(row.best_2h_window_json),
      best3HourWindow: safeJsonNullable(row.best_3h_window_json),
      best4HourWindow: safeJsonNullable(row.best_4h_window_json),
      top3OverallRecommendations: safeJsonArray(row.top_3_overall_json),
      warnings: safeStringArray(row.warnings_json),
    },
  };
}

export interface NightWindowCandidateDbRow {
  analysis_id: string;
  dataset_id: string;
  month_key: string;
  duration_hours: number;
  rank: number;
  start_hour_of_day: number;
  end_hour_of_day: number;
  start_local_time: string;
  end_local_time: string;
  duration_minutes: number;
  days_considered: number;
  days_with_data: number;
  average_consumption_w: number | null;
  total_estimated_consumption_wh: number;
  min_consumption_w: number | null;
  max_consumption_w: number | null;
  variance_consumption_w: number | null;
  std_dev_consumption_w: number | null;
  stability_score: number;
  completeness_ratio: number;
  duplicate_impact: number;
  gap_impact: number;
  final_recommendation_score: number;
}

export function nightCandidateToDbRow(entity: NightWindowCandidateEntity): NightWindowCandidateDbRow {
  return {
    analysis_id: entity.analysisId,
    dataset_id: entity.datasetId,
    month_key: entity.monthKey,
    duration_hours: entity.durationHours,
    rank: entity.rank,
    start_hour_of_day: entity.startHourOfDay,
    end_hour_of_day: entity.endHourOfDay,
    start_local_time: entity.startLocalTime,
    end_local_time: entity.endLocalTime,
    duration_minutes: entity.durationMinutes,
    days_considered: entity.daysConsidered,
    days_with_data: entity.daysWithData,
    average_consumption_w: entity.averageConsumptionW,
    total_estimated_consumption_wh: entity.totalEstimatedConsumptionWh,
    min_consumption_w: entity.minConsumptionW,
    max_consumption_w: entity.maxConsumptionW,
    variance_consumption_w: entity.varianceConsumptionW,
    std_dev_consumption_w: entity.stdDevConsumptionW,
    stability_score: entity.stabilityScore,
    completeness_ratio: entity.completenessRatio,
    duplicate_impact: entity.duplicateImpact,
    gap_impact: entity.gapImpact,
    final_recommendation_score: entity.finalRecommendationScore,
  };
}

export function nightCandidateFromDbRow(row: NightWindowCandidateDbRow): NightWindowCandidateEntity {
  return {
    analysisId: row.analysis_id,
    datasetId: row.dataset_id,
    monthKey: row.month_key,
    durationHours: row.duration_hours,
    rank: row.rank,
    startHourOfDay: row.start_hour_of_day,
    endHourOfDay: row.end_hour_of_day,
    startLocalTime: row.start_local_time,
    endLocalTime: row.end_local_time,
    durationMinutes: row.duration_minutes,
    daysConsidered: row.days_considered,
    daysWithData: row.days_with_data,
    averageConsumptionW: row.average_consumption_w,
    totalEstimatedConsumptionWh: row.total_estimated_consumption_wh,
    minConsumptionW: row.min_consumption_w,
    maxConsumptionW: row.max_consumption_w,
    varianceConsumptionW: row.variance_consumption_w,
    stdDevConsumptionW: row.std_dev_consumption_w,
    stabilityScore: row.stability_score,
    completenessRatio: row.completeness_ratio,
    duplicateImpact: row.duplicate_impact,
    gapImpact: row.gap_impact,
    finalRecommendationScore: row.final_recommendation_score,
  };
}

function safeJsonObject(input: string): Record<string, unknown> {
  try {
    const value = JSON.parse(input);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function safeJsonArray(input: string): unknown[] {
  try {
    const value = JSON.parse(input);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function safeJsonNullable(input: string | null): unknown | null {
  if (!input) {
    return null;
  }
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function safeStringArray(input: string): string[] {
  try {
    const value = JSON.parse(input);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((v) => String(v));
  } catch {
    return [];
  }
}

