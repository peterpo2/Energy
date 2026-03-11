import {
  ImportValidationIssue,
  ImportValidationResult,
  QualitySeverity,
  ValidationCode,
} from "../contracts/ImportResult";
import { SolarmanColumnMap } from "../mapping/mapSolarmanColumns";

export interface RequiredColumnsOptions {
  requireConsumptionPower?: boolean;
}

export function validateRequiredColumns(
  columnMap: SolarmanColumnMap,
  unknownColumns: string[],
  options?: RequiredColumnsOptions,
): ImportValidationResult {
  const issues: ImportValidationIssue[] = [];
  const missingRequiredColumns: string[] = [];

  if (columnMap.updatedTime === undefined) {
    missingRequiredColumns.push("Updated Time");
    issues.push({
      code: ValidationCode.MissingRequiredColumn,
      severity: QualitySeverity.Error,
      columnName: "Updated Time",
      message: "Required column 'Updated Time' is missing.",
    });
  }

  // Consumption is required for charge-window business analysis.
  if (options?.requireConsumptionPower !== false && columnMap.consumptionPower === undefined) {
    missingRequiredColumns.push("Consumption Power(W)");
    issues.push({
      code: ValidationCode.MissingRequiredColumn,
      severity: QualitySeverity.Error,
      columnName: "Consumption Power(W)",
      message: "Required column 'Consumption Power(W)' is missing.",
    });
  }

  for (const header of unknownColumns) {
    issues.push({
      code: ValidationCode.UnknownHeader,
      severity: QualitySeverity.Info,
      columnName: header,
      message: `Unknown column '${header}' will be ignored.`,
    });
  }

  return {
    isValid: missingRequiredColumns.length === 0,
    issues,
    missingRequiredColumns,
    unknownColumns,
  };
}

