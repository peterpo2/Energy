import { buildMeasurementPoints } from "../packages/ingestion/src/normalization/buildMeasurementPoints";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node test-ingestion.js <xlsx-file>");
  process.exit(1);
}

const result = buildMeasurementPoints({
  filePath,
  expectedSamplingMinutes: 5,
});

const summary = {
  metadata: result.metadata,
  validation: {
    isValid: result.validation.isValid,
    missingRequiredColumns: result.validation.missingRequiredColumns,
    unknownColumns: result.validation.unknownColumns,
    issuesCount: result.validation.issues.length,
    firstIssues: result.validation.issues.slice(0, 10),
  },
  quality: result.quality,
  firstRows: result.rows.slice(0, 3),
};

console.log(JSON.stringify(summary, null, 2));
