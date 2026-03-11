import { HourlySummaryRow } from "../aggregateHourly";

export interface NightWindowRange {
  startLocalTime: string;
  endLocalTime: string;
}

export interface ParsedNightWindow {
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
}

export interface FilterNightHoursInput {
  hourlyRows: HourlySummaryRow[];
  monthKey: string;
  nightWindow: NightWindowRange;
}

export interface FilterNightHoursResult {
  monthRows: HourlySummaryRow[];
  nightRows: HourlySummaryRow[];
  availableDays: string[];
  parsedNightWindow: ParsedNightWindow;
}

export function parseHourMinute(value: string): { hour: number; minute: number } {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format '${value}'. Expected HH:mm.`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time '${value}'.`);
  }
  return { hour, minute };
}

export function parseNightWindow(range: NightWindowRange): ParsedNightWindow {
  const start = parseHourMinute(range.startLocalTime);
  const end = parseHourMinute(range.endLocalTime);

  // Hourly aggregation is aligned to whole hours.
  if (start.minute !== 0 || end.minute !== 0) {
    throw new Error("Night window times must be on full hours (HH:00) for hourly recommendation.");
  }

  const startMinutes = start.hour * 60;
  const endMinutes = end.hour * 60;
  const crossesMidnight = startMinutes >= endMinutes;

  return { startMinutes, endMinutes, crossesMidnight };
}

export function isHourInNightWindow(hourOfDay: number, nightWindow: ParsedNightWindow): boolean {
  const minuteOfDay = hourOfDay * 60;
  if (!nightWindow.crossesMidnight) {
    return minuteOfDay >= nightWindow.startMinutes && minuteOfDay < nightWindow.endMinutes;
  }
  return minuteOfDay >= nightWindow.startMinutes || minuteOfDay < nightWindow.endMinutes;
}

export function isHourSequenceInsideNightWindow(
  startHourOfDay: number,
  durationHours: number,
  nightWindow: ParsedNightWindow,
): boolean {
  for (let i = 0; i < durationHours; i += 1) {
    const hour = (startHourOfDay + i) % 24;
    if (!isHourInNightWindow(hour, nightWindow)) {
      return false;
    }
  }
  return true;
}

export function formatHourLabel(hourOfDay: number): string {
  return `${hourOfDay.toString().padStart(2, "0")}:00`;
}

export function filterNightHours(input: FilterNightHoursInput): FilterNightHoursResult {
  const parsedNightWindow = parseNightWindow(input.nightWindow);
  const monthRows = input.hourlyRows.filter((row) => row.bucketKey.slice(0, 7) === input.monthKey);
  const nightRows = monthRows.filter((row) =>
    isHourInNightWindow(row.hourOfDay, parsedNightWindow),
  );

  const availableDays = Array.from(new Set(monthRows.map((r) => r.localDate))).sort();
  return {
    monthRows,
    nightRows,
    availableDays,
    parsedNightWindow,
  };
}

