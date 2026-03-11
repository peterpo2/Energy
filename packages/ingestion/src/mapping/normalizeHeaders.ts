export interface NormalizedHeader {
  index: number;
  original: string;
  normalized: string;
}

export interface NormalizedHeadersResult {
  headers: NormalizedHeader[];
  byNormalizedName: Record<string, NormalizedHeader>;
}

function normalizeHeaderValue(input: unknown): string {
  if (input === null || input === undefined) {
    return "";
  }

  return String(input)
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeHeaders(headerRow: unknown[]): NormalizedHeadersResult {
  const headers: NormalizedHeader[] = headerRow.map((cell, index) => {
    const original = cell === null || cell === undefined ? "" : String(cell).trim();
    return {
      index,
      original,
      normalized: normalizeHeaderValue(cell),
    };
  });

  const byNormalizedName: Record<string, NormalizedHeader> = {};
  for (const header of headers) {
    if (!header.normalized) {
      continue;
    }

    // Keep first occurrence to avoid accidental remapping.
    if (!byNormalizedName[header.normalized]) {
      byNormalizedName[header.normalized] = header;
    }
  }

  return { headers, byNormalizedName };
}

