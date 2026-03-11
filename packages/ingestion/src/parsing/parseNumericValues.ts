export interface NumericParseResult {
  value: number | null;
  isEmpty: boolean;
  error?: string;
}

export function parseNumericValue(input: unknown): NumericParseResult {
  if (input === null || input === undefined) {
    return { value: null, isEmpty: true };
  }

  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      return { value: null, isEmpty: false, error: "Value is not a finite number." };
    }
    return { value: input, isEmpty: false };
  }

  const text = String(input).trim();
  if (!text) {
    return { value: null, isEmpty: true };
  }

  // Remove common decorations from exports (units, spaces).
  let normalized = text.replace(/\s+/g, "").replace(/w$/i, "");

  // Handle decimal comma safely.
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { value: null, isEmpty: false, error: `Unable to parse numeric value '${text}'.` };
  }

  return { value, isEmpty: false };
}

