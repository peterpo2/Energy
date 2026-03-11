export interface TimestampedRow {
  timestampUtcMs: number;
  sourceRowIndex?: number;
}

export interface DuplicateTimestampGroup {
  timestampUtcMs: number;
  count: number;
  rowIndices: number[];
}

export function detectDuplicates<T extends TimestampedRow>(rows: T[]): DuplicateTimestampGroup[] {
  const byTimestamp = new Map<number, number[]>();

  for (const row of rows) {
    if (!byTimestamp.has(row.timestampUtcMs)) {
      byTimestamp.set(row.timestampUtcMs, []);
    }
    byTimestamp.get(row.timestampUtcMs)?.push(row.sourceRowIndex ?? -1);
  }

  const duplicates: DuplicateTimestampGroup[] = [];
  for (const [timestampUtcMs, rowIndices] of byTimestamp.entries()) {
    if (rowIndices.length > 1) {
      duplicates.push({
        timestampUtcMs,
        count: rowIndices.length,
        rowIndices,
      });
    }
  }

  return duplicates.sort((a, b) => a.timestampUtcMs - b.timestampUtcMs);
}

