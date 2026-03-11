import { MappedRawRow } from "../contracts/ImportResult";

export interface RowShapeValidationResult {
  isCompletelyEmpty: boolean;
}

export function validateRowShape(row: MappedRawRow): RowShapeValidationResult {
  const values: Array<unknown> = [
    row.plantName,
    row.updatedTimeRaw,
    row.timeZoneRaw,
    row.productionPowerRaw,
    row.consumptionPowerRaw,
    row.gridPowerRaw,
    row.purchasingPowerRaw,
    row.feedInPowerRaw,
  ];

  const isCompletelyEmpty = values.every((value) => {
    if (value === null || value === undefined) {
      return true;
    }
    return String(value).trim() === "";
  });

  return { isCompletelyEmpty };
}

