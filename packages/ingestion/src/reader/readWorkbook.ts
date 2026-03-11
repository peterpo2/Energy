import { existsSync } from "node:fs";
import * as XLSX from "xlsx";

export interface ReadWorkbookResult {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
}

export function readWorkbook(filePath: string): ReadWorkbookResult {
  if (!filePath) {
    throw new Error("File path is required.");
  }

  if (!existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    raw: false,
    dense: true,
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Workbook has no worksheets.");
  }

  return {
    workbook,
    sheetNames: workbook.SheetNames.slice(),
  };
}

