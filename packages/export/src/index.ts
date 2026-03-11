import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { AggregateEntity, NightWindowAnalysisEntity, NightWindowCandidateEntity } from "@persistence";

export interface ExportPayload {
  exportType: "aggregates" | "night_analysis" | "full_report";
  format: "xlsx" | "csv";
  destinationPath: string;
  datasetId: string;
  aggregates?: {
    hourly: AggregateEntity[];
    daily: AggregateEntity[];
    monthly: AggregateEntity[];
  };
  nightAnalysis?: {
    analysis: NightWindowAnalysisEntity;
    candidates: NightWindowCandidateEntity[];
  };
}

function ensureParentDir(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  const escape = (value: unknown): string => {
    const raw = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, "\"\"")}"` : raw;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  }
  return lines.join("\n");
}

function flattenAggregates(label: string, rows: AggregateEntity[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    section: label,
    datasetId: row.datasetId,
    bucketKey: row.bucketKey,
    bucketStartUtcMs: row.bucketStartUtcMs,
    localDate: row.localDate,
    hourOfDay: row.hourOfDay,
    yearMonth: row.yearMonth,
    expectedSamples: row.expectedSamples,
    uniqueTimestampCount: row.uniqueTimestampCount,
    completenessRatio: row.completenessRatio,
    duplicateCount: row.duplicateCount,
    gapCount: row.gapCount,
    metricsJson: JSON.stringify(row.metrics),
    metadataJson: row.metadata ? JSON.stringify(row.metadata) : "",
  }));
}

export function exportResults(payload: ExportPayload): { filePath: string } {
  ensureParentDir(payload.destinationPath);

  const rows: Record<string, unknown>[] = [];
  if (payload.aggregates) {
    rows.push(...flattenAggregates("hourly", payload.aggregates.hourly));
    rows.push(...flattenAggregates("daily", payload.aggregates.daily));
    rows.push(...flattenAggregates("monthly", payload.aggregates.monthly));
  }
  if (payload.nightAnalysis) {
    rows.push(
      ...payload.nightAnalysis.candidates.map((candidate) => ({
        section: "night_candidate",
        datasetId: candidate.datasetId,
        monthKey: candidate.monthKey,
        durationHours: candidate.durationHours,
        rank: candidate.rank,
        startLocalTime: candidate.startLocalTime,
        endLocalTime: candidate.endLocalTime,
        averageConsumptionW: candidate.averageConsumptionW,
        totalEstimatedConsumptionWh: candidate.totalEstimatedConsumptionWh,
        stabilityScore: candidate.stabilityScore,
        completenessRatio: candidate.completenessRatio,
        duplicateImpact: candidate.duplicateImpact,
        gapImpact: candidate.gapImpact,
        finalRecommendationScore: candidate.finalRecommendationScore,
      })),
    );
  }

  if (payload.format === "csv") {
    writeFileSync(payload.destinationPath, toCsv(rows), "utf8");
    return { filePath: payload.destinationPath };
  }

  const workbook = XLSX.utils.book_new();
  const exportRows = rows.length > 0 ? rows : [{ section: payload.exportType, datasetId: payload.datasetId }];
  const sheet = XLSX.utils.json_to_sheet(exportRows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Export");
  XLSX.writeFile(workbook, payload.destinationPath);
  return { filePath: payload.destinationPath };
}
