export interface ParsedTimeZone {
  raw: string | null;
  normalized: string | null;
  offsetMinutes: number | null;
}

export interface TimestampParseResult {
  timestampUtcMs: number | null;
  timestampIsoUtc: string | null;
  error?: string;
}

function parseOffsetToken(token: string): number | null {
  const compact = token.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(/^([+-])(\d{1,2})(:?(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[4] ?? "0");
  if (hours > 14 || minutes > 59) {
    return null;
  }
  return sign * (hours * 60 + minutes);
}

export function parseTimeZone(input: unknown): ParsedTimeZone {
  if (input === null || input === undefined) {
    return { raw: null, normalized: null, offsetMinutes: null };
  }

  const raw = String(input).trim();
  if (!raw) {
    return { raw: null, normalized: null, offsetMinutes: null };
  }

  const upper = raw.toUpperCase();
  if (upper === "UTC" || upper === "GMT") {
    return { raw, normalized: "UTC+00:00", offsetMinutes: 0 };
  }

  const utcGmtMatch = upper.match(/^(UTC|GMT)([+-].+)$/);
  if (utcGmtMatch) {
    const offset = parseOffsetToken(utcGmtMatch[2]);
    if (offset !== null) {
      return { raw, normalized: toOffsetString(offset), offsetMinutes: offset };
    }
  }

  const directOffset = parseOffsetToken(upper);
  if (directOffset !== null) {
    return { raw, normalized: toOffsetString(directOffset), offsetMinutes: directOffset };
  }

  return { raw, normalized: raw, offsetMinutes: null };
}

function toOffsetString(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (absolute % 60).toString().padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

function excelSerialToUtcMs(serial: number): number {
  // Excel serial 1 starts at 1899-12-31 but with 1900 leap-year bug.
  const excelEpochUtcMs = Date.UTC(1899, 11, 30);
  return Math.round(excelEpochUtcMs + serial * 24 * 60 * 60 * 1000);
}

function parseNaiveDateTimeString(input: string): Date | null {
  const s = input.trim();
  const matchIsoLike = s.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (matchIsoLike) {
    const year = Number(matchIsoLike[1]);
    const month = Number(matchIsoLike[2]);
    const day = Number(matchIsoLike[3]);
    const hour = Number(matchIsoLike[4] ?? "0");
    const minute = Number(matchIsoLike[5] ?? "0");
    const second = Number(matchIsoLike[6] ?? "0");
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  const matchDmy = s.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (matchDmy) {
    const day = Number(matchDmy[1]);
    const month = Number(matchDmy[2]);
    const year = Number(matchDmy[3]);
    const hour = Number(matchDmy[4] ?? "0");
    const minute = Number(matchDmy[5] ?? "0");
    const second = Number(matchDmy[6] ?? "0");
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  return null;
}

export function parseUpdatedTime(
  input: unknown,
  timeZoneOffsetMinutes: number | null,
): TimestampParseResult {
  if (input === null || input === undefined || String(input).trim?.() === "") {
    return { timestampUtcMs: null, timestampIsoUtc: null, error: "Timestamp is empty." };
  }

  if (input instanceof Date) {
    const ms = input.getTime();
    if (Number.isNaN(ms)) {
      return { timestampUtcMs: null, timestampIsoUtc: null, error: "Invalid Date object." };
    }
    return { timestampUtcMs: ms, timestampIsoUtc: new Date(ms).toISOString() };
  }

  if (typeof input === "number") {
    const ms = excelSerialToUtcMs(input);
    return { timestampUtcMs: ms, timestampIsoUtc: new Date(ms).toISOString() };
  }

  const text = String(input).trim();
  if (!text) {
    return { timestampUtcMs: null, timestampIsoUtc: null, error: "Timestamp is empty." };
  }

  // If timestamp contains timezone info, trust it directly.
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text);
  if (hasZone) {
    const ms = Date.parse(text);
    if (!Number.isNaN(ms)) {
      return { timestampUtcMs: ms, timestampIsoUtc: new Date(ms).toISOString() };
    }
  }

  // Parse as local datetime and apply source timezone offset if available.
  const parsedNaive = parseNaiveDateTimeString(text);
  if (parsedNaive) {
    const naiveUtcMs = parsedNaive.getTime();
    const offset = timeZoneOffsetMinutes ?? 0;
    const correctedUtcMs = naiveUtcMs - offset * 60 * 1000;
    return {
      timestampUtcMs: correctedUtcMs,
      timestampIsoUtc: new Date(correctedUtcMs).toISOString(),
    };
  }

  // Last fallback for uncommon formats.
  const fallbackMs = Date.parse(text);
  if (!Number.isNaN(fallbackMs)) {
    return { timestampUtcMs: fallbackMs, timestampIsoUtc: new Date(fallbackMs).toISOString() };
  }

  return {
    timestampUtcMs: null,
    timestampIsoUtc: null,
    error: `Unable to parse timestamp '${text}'.`,
  };
}

