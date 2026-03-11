import * as XLSX from "xlsx";

export interface WorksheetSelectionInput {
  worksheetName?: string;
  worksheetIndex?: number;
}

export interface WorksheetSelectionResult {
  worksheet: XLSX.WorkSheet;
  selectedWorksheetName: string;
  selectedWorksheetIndex: number;
}

export function selectWorksheet(
  workbook: XLSX.WorkBook,
  selection?: WorksheetSelectionInput,
): WorksheetSelectionResult {
  const sheetNames = workbook.SheetNames ?? [];
  if (sheetNames.length === 0) {
    throw new Error("Workbook has no worksheets.");
  }

  let selectedWorksheetName: string | undefined;
  let selectedWorksheetIndex = 0;

  if (selection?.worksheetName) {
    const idx = sheetNames.findIndex(
      (name) => name.toLowerCase() === selection.worksheetName?.toLowerCase(),
    );
    if (idx >= 0) {
      selectedWorksheetName = sheetNames[idx];
      selectedWorksheetIndex = idx;
    }
  }

  if (!selectedWorksheetName && Number.isInteger(selection?.worksheetIndex)) {
    const idx = selection?.worksheetIndex as number;
    if (idx >= 0 && idx < sheetNames.length) {
      selectedWorksheetName = sheetNames[idx];
      selectedWorksheetIndex = idx;
    }
  }

  if (!selectedWorksheetName) {
    selectedWorksheetName = sheetNames[0];
    selectedWorksheetIndex = 0;
  }

  const worksheet = workbook.Sheets[selectedWorksheetName];
  if (!worksheet) {
    throw new Error(`Worksheet not found: ${selectedWorksheetName}`);
  }

  return { worksheet, selectedWorksheetName, selectedWorksheetIndex };
}

