export interface ImportRequest {
  filePath: string;
  worksheetName?: string;
  worksheetIndex?: number;
  expectedSamplingMinutes?: number;
  analysisTimeZone?: string;
  onProgress?: (event: {
    phase: "reading" | "parsing" | "completed";
    progressPercent: number;
    message: string;
    processedRows?: number;
    totalRows?: number;
  }) => void;
  isCancelled?: () => boolean;
}
