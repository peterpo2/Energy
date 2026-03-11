import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  NightWindowAnalysisEntity,
  NightWindowCandidateEntity,
} from "../contracts/PersistenceTypes";
import {
  NightWindowAnalysisDbRow,
  NightWindowCandidateDbRow,
  nightAnalysisFromDbRow,
  nightAnalysisToDbRow,
  nightCandidateFromDbRow,
  nightCandidateToDbRow,
} from "../mappers/aggregateMapper";

export interface PersistNightAnalysisInput {
  analysis: NightWindowAnalysisEntity;
  candidates: NightWindowCandidateEntity[];
}

export interface PersistNightAnalysisResult {
  analysisId: string;
}

export interface NightAnalysisRecord {
  analysisId: string;
  analysis: NightWindowAnalysisEntity;
  candidates: NightWindowCandidateEntity[];
}

export interface INightWindowRepository {
  upsertAnalysis(input: PersistNightAnalysisInput): PersistNightAnalysisResult;
  getAnalysis(datasetId: string, monthKey: string, nightStartLocalTime: string, nightEndLocalTime: string): NightAnalysisRecord | null;
  listAnalysesForDataset(datasetId: string): NightAnalysisRecord[];
  deleteByDataset(datasetId: string): void;
}

export class NightWindowRepository implements INightWindowRepository {
  constructor(private readonly db: Database.Database) {}

  upsertAnalysis(input: PersistNightAnalysisInput): PersistNightAnalysisResult {
    const existing = this.db
      .prepare(
        `
          SELECT analysis_id
          FROM night_window_analyses
          WHERE dataset_id = ? AND month_key = ? AND night_start_local_time = ? AND night_end_local_time = ?
          LIMIT 1
        `,
      )
      .get(
        input.analysis.datasetId,
        input.analysis.monthKey,
        input.analysis.nightStartLocalTime,
        input.analysis.nightEndLocalTime,
      ) as { analysis_id: string } | undefined;

    const analysisId = existing?.analysis_id ?? randomUUID();
    const nowUtc = new Date().toISOString();
    const analysisRow = nightAnalysisToDbRow(analysisId, input.analysis);

    const upsertAnalysisStmt = this.db.prepare(`
      INSERT INTO night_window_analyses (
        analysis_id, dataset_id, month_key, night_start_local_time, night_end_local_time,
        available_days, analyzed_hours, hour_ranking_json,
        best_1h_window_json, best_2h_window_json, best_3h_window_json, best_4h_window_json,
        top_3_overall_json, warnings_json, created_at_utc, updated_at_utc
      ) VALUES (
        @analysis_id, @dataset_id, @month_key, @night_start_local_time, @night_end_local_time,
        @available_days, @analyzed_hours, @hour_ranking_json,
        @best_1h_window_json, @best_2h_window_json, @best_3h_window_json, @best_4h_window_json,
        @top_3_overall_json, @warnings_json, @created_at_utc, @updated_at_utc
      )
      ON CONFLICT(dataset_id, month_key, night_start_local_time, night_end_local_time) DO UPDATE SET
        available_days = excluded.available_days,
        analyzed_hours = excluded.analyzed_hours,
        hour_ranking_json = excluded.hour_ranking_json,
        best_1h_window_json = excluded.best_1h_window_json,
        best_2h_window_json = excluded.best_2h_window_json,
        best_3h_window_json = excluded.best_3h_window_json,
        best_4h_window_json = excluded.best_4h_window_json,
        top_3_overall_json = excluded.top_3_overall_json,
        warnings_json = excluded.warnings_json,
        updated_at_utc = excluded.updated_at_utc;
    `);

    const insertCandidateStmt = this.db.prepare(`
      INSERT INTO night_window_candidates (
        analysis_id, dataset_id, month_key, duration_hours, rank, start_hour_of_day, end_hour_of_day,
        start_local_time, end_local_time, duration_minutes, days_considered, days_with_data,
        average_consumption_w, total_estimated_consumption_wh, min_consumption_w, max_consumption_w,
        variance_consumption_w, std_dev_consumption_w, stability_score, completeness_ratio,
        duplicate_impact, gap_impact, final_recommendation_score
      ) VALUES (
        @analysis_id, @dataset_id, @month_key, @duration_hours, @rank, @start_hour_of_day, @end_hour_of_day,
        @start_local_time, @end_local_time, @duration_minutes, @days_considered, @days_with_data,
        @average_consumption_w, @total_estimated_consumption_wh, @min_consumption_w, @max_consumption_w,
        @variance_consumption_w, @std_dev_consumption_w, @stability_score, @completeness_ratio,
        @duplicate_impact, @gap_impact, @final_recommendation_score
      )
      ON CONFLICT(analysis_id, duration_hours, rank) DO UPDATE SET
        start_hour_of_day = excluded.start_hour_of_day,
        end_hour_of_day = excluded.end_hour_of_day,
        start_local_time = excluded.start_local_time,
        end_local_time = excluded.end_local_time,
        duration_minutes = excluded.duration_minutes,
        days_considered = excluded.days_considered,
        days_with_data = excluded.days_with_data,
        average_consumption_w = excluded.average_consumption_w,
        total_estimated_consumption_wh = excluded.total_estimated_consumption_wh,
        min_consumption_w = excluded.min_consumption_w,
        max_consumption_w = excluded.max_consumption_w,
        variance_consumption_w = excluded.variance_consumption_w,
        std_dev_consumption_w = excluded.std_dev_consumption_w,
        stability_score = excluded.stability_score,
        completeness_ratio = excluded.completeness_ratio,
        duplicate_impact = excluded.duplicate_impact,
        gap_impact = excluded.gap_impact,
        final_recommendation_score = excluded.final_recommendation_score;
    `);

    const tx = this.db.transaction(() => {
      upsertAnalysisStmt.run({
        ...analysisRow,
        created_at_utc: existing ? nowUtc : nowUtc,
        updated_at_utc: nowUtc,
      });

      this.db
        .prepare("DELETE FROM night_window_candidates WHERE analysis_id = ?")
        .run(analysisId);

      for (const candidate of input.candidates) {
        const candidateRow = nightCandidateToDbRow({
          ...candidate,
          analysisId,
          datasetId: input.analysis.datasetId,
          monthKey: input.analysis.monthKey,
        });
        insertCandidateStmt.run(candidateRow);
      }
    });
    tx();

    return { analysisId };
  }

  getAnalysis(
    datasetId: string,
    monthKey: string,
    nightStartLocalTime: string,
    nightEndLocalTime: string,
  ): NightAnalysisRecord | null {
    const analysisRow = this.db
      .prepare(
        `
          SELECT analysis_id, dataset_id, month_key, night_start_local_time, night_end_local_time,
                 available_days, analyzed_hours, hour_ranking_json,
                 best_1h_window_json, best_2h_window_json, best_3h_window_json, best_4h_window_json,
                 top_3_overall_json, warnings_json
          FROM night_window_analyses
          WHERE dataset_id = ? AND month_key = ? AND night_start_local_time = ? AND night_end_local_time = ?
          LIMIT 1
        `,
      )
      .get(datasetId, monthKey, nightStartLocalTime, nightEndLocalTime) as
      | NightWindowAnalysisDbRow
      | undefined;

    if (!analysisRow) {
      return null;
    }

    const mapped = nightAnalysisFromDbRow(analysisRow);
    const candidateRows = this.db
      .prepare(
        `
          SELECT *
          FROM night_window_candidates
          WHERE analysis_id = ?
          ORDER BY duration_hours ASC, rank ASC
        `,
      )
      .all(mapped.analysisId) as NightWindowCandidateDbRow[];

    return {
      analysisId: mapped.analysisId,
      analysis: mapped.data,
      candidates: candidateRows.map(nightCandidateFromDbRow),
    };
  }

  listAnalysesForDataset(datasetId: string): NightAnalysisRecord[] {
    const rows = this.db
      .prepare(
        `
          SELECT analysis_id, dataset_id, month_key, night_start_local_time, night_end_local_time,
                 available_days, analyzed_hours, hour_ranking_json,
                 best_1h_window_json, best_2h_window_json, best_3h_window_json, best_4h_window_json,
                 top_3_overall_json, warnings_json
          FROM night_window_analyses
          WHERE dataset_id = ?
          ORDER BY month_key DESC, updated_at_utc DESC
        `,
      )
      .all(datasetId) as NightWindowAnalysisDbRow[];

    return rows.map((row) => {
      const mapped = nightAnalysisFromDbRow(row);
      const candidateRows = this.db
        .prepare(
          `
            SELECT *
            FROM night_window_candidates
            WHERE analysis_id = ?
            ORDER BY duration_hours ASC, rank ASC
          `,
        )
        .all(mapped.analysisId) as NightWindowCandidateDbRow[];
      return {
        analysisId: mapped.analysisId,
        analysis: mapped.data,
        candidates: candidateRows.map(nightCandidateFromDbRow),
      };
    });
  }

  deleteByDataset(datasetId: string): void {
    this.db.prepare("DELETE FROM night_window_analyses WHERE dataset_id = ?").run(datasetId);
  }
}

