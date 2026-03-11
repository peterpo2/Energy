export interface TimeBucketOptions {
  timeZone?: string;
}

export interface LocalTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function getParts(timestampUtcMs: number, timeZone: string): LocalTimeParts {
  const parts = getFormatter(timeZone).formatToParts(new Date(timestampUtcMs));
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.get("year")),
    month: Number(byType.get("month")),
    day: Number(byType.get("day")),
    hour: Number(byType.get("hour")),
    minute: Number(byType.get("minute")),
    second: Number(byType.get("second")),
  };
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function getHourBucketKey(timestampUtcMs: number, options?: TimeBucketOptions): string {
  const timeZone = options?.timeZone ?? "UTC";
  const p = getParts(timestampUtcMs, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}`;
}

export function getDayBucketKey(timestampUtcMs: number, options?: TimeBucketOptions): string {
  const timeZone = options?.timeZone ?? "UTC";
  const p = getParts(timestampUtcMs, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function getMonthBucketKey(timestampUtcMs: number, options?: TimeBucketOptions): string {
  const timeZone = options?.timeZone ?? "UTC";
  const p = getParts(timestampUtcMs, timeZone);
  return `${p.year}-${pad2(p.month)}`;
}

function getOffsetMsForTimeZone(timestampUtcMs: number, timeZone: string): number {
  const p = getParts(timestampUtcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - timestampUtcMs;
}

function zonedDateTimeToUtcMs(
  local: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): number {
  const hour = local.hour ?? 0;
  const minute = local.minute ?? 0;
  const second = local.second ?? 0;

  let candidate = Date.UTC(local.year, local.month - 1, local.day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const offset = getOffsetMsForTimeZone(candidate, timeZone);
    const adjusted = Date.UTC(local.year, local.month - 1, local.day, hour, minute, second) - offset;
    if (adjusted === candidate) {
      break;
    }
    candidate = adjusted;
  }
  return candidate;
}

export function getHourBucketStartUtcMs(bucketKey: string, options?: TimeBucketOptions): number {
  const timeZone = options?.timeZone ?? "UTC";
  const match = bucketKey.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid hour bucket key: ${bucketKey}`);
  }
  return zonedDateTimeToUtcMs(
    { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]) },
    timeZone,
  );
}

export function getDayBucketStartUtcMs(bucketKey: string, options?: TimeBucketOptions): number {
  const timeZone = options?.timeZone ?? "UTC";
  const match = bucketKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid day bucket key: ${bucketKey}`);
  }
  return zonedDateTimeToUtcMs(
    { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: 0 },
    timeZone,
  );
}

export function getMonthBucketStartUtcMs(bucketKey: string, options?: TimeBucketOptions): number {
  const timeZone = options?.timeZone ?? "UTC";
  const match = bucketKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid month bucket key: ${bucketKey}`);
  }
  return zonedDateTimeToUtcMs(
    { year: Number(match[1]), month: Number(match[2]), day: 1, hour: 0 },
    timeZone,
  );
}

