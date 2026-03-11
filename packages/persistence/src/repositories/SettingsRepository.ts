import type Database from "better-sqlite3";
import { AnalysisSettingsEntity } from "../contracts/PersistenceTypes";

interface SettingsDbRow {
  analysis_time_zone: string;
  expected_sampling_minutes: number;
  duplicate_resolution: "keep_latest" | "keep_first" | "average";
  default_night_start: string;
  default_night_end: string;
  min_completeness_ratio: number;
  min_days_required_for_recommendation: number;
  max_safe_delta_minutes: number;
  updated_at_utc: string;
}

function toEntity(row: SettingsDbRow): AnalysisSettingsEntity {
  return {
    analysisTimeZone: row.analysis_time_zone,
    expectedSamplingMinutes: row.expected_sampling_minutes,
    duplicateResolution: row.duplicate_resolution,
    defaultNightStart: row.default_night_start,
    defaultNightEnd: row.default_night_end,
    minCompletenessRatio: row.min_completeness_ratio,
    minDaysRequiredForRecommendation: row.min_days_required_for_recommendation,
    maxSafeDeltaMinutes: row.max_safe_delta_minutes,
    updatedAtUtc: row.updated_at_utc,
  };
}

export interface ISettingsRepository {
  get(): AnalysisSettingsEntity;
  upsert(settings: Partial<Omit<AnalysisSettingsEntity, "updatedAtUtc">>): AnalysisSettingsEntity;
}

export class SettingsRepository implements ISettingsRepository {
  constructor(private readonly db: Database.Database) {}

  get(): AnalysisSettingsEntity {
    const row = this.db
      .prepare(
        `
          SELECT
            analysis_time_zone,
            expected_sampling_minutes,
            duplicate_resolution,
            default_night_start,
            default_night_end,
            min_completeness_ratio,
            min_days_required_for_recommendation,
            max_safe_delta_minutes,
            updated_at_utc
          FROM app_settings
          WHERE settings_id = 1
          LIMIT 1
        `,
      )
      .get() as SettingsDbRow | undefined;

    if (!row) {
      throw new Error("App settings row is missing. Check migrations.");
    }
    return toEntity(row);
  }

  upsert(settings: Partial<Omit<AnalysisSettingsEntity, "updatedAtUtc">>): AnalysisSettingsEntity {
    const current = this.get();
    const next: AnalysisSettingsEntity = {
      ...current,
      ...settings,
      updatedAtUtc: new Date().toISOString(),
    };

    this.db
      .prepare(
        `
          INSERT INTO app_settings (
            settings_id, analysis_time_zone, expected_sampling_minutes, duplicate_resolution,
            default_night_start, default_night_end, min_completeness_ratio,
            min_days_required_for_recommendation, max_safe_delta_minutes, updated_at_utc
          ) VALUES (
            1, @analysis_time_zone, @expected_sampling_minutes, @duplicate_resolution,
            @default_night_start, @default_night_end, @min_completeness_ratio,
            @min_days_required_for_recommendation, @max_safe_delta_minutes, @updated_at_utc
          )
          ON CONFLICT(settings_id) DO UPDATE SET
            analysis_time_zone = excluded.analysis_time_zone,
            expected_sampling_minutes = excluded.expected_sampling_minutes,
            duplicate_resolution = excluded.duplicate_resolution,
            default_night_start = excluded.default_night_start,
            default_night_end = excluded.default_night_end,
            min_completeness_ratio = excluded.min_completeness_ratio,
            min_days_required_for_recommendation = excluded.min_days_required_for_recommendation,
            max_safe_delta_minutes = excluded.max_safe_delta_minutes,
            updated_at_utc = excluded.updated_at_utc
        `,
      )
      .run({
        analysis_time_zone: next.analysisTimeZone,
        expected_sampling_minutes: next.expectedSamplingMinutes,
        duplicate_resolution: next.duplicateResolution,
        default_night_start: next.defaultNightStart,
        default_night_end: next.defaultNightEnd,
        min_completeness_ratio: next.minCompletenessRatio,
        min_days_required_for_recommendation: next.minDaysRequiredForRecommendation,
        max_safe_delta_minutes: next.maxSafeDeltaMinutes,
        updated_at_utc: next.updatedAtUtc,
      });

    return next;
  }
}

