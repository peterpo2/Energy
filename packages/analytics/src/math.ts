export interface DeltaOptions {
  expectedSamplingMinutes: number;
  maxSafeDeltaMinutes?: number;
}

export function calculateSampleDeltaMinutes(
  currentTimestampUtcMs: number,
  nextTimestampUtcMs: number | null | undefined,
  options: DeltaOptions,
): number {
  const expected = options.expectedSamplingMinutes;
  const maxSafe = options.maxSafeDeltaMinutes ?? 24 * 60;

  if (!nextTimestampUtcMs || !Number.isFinite(nextTimestampUtcMs)) {
    return expected;
  }

  const deltaMinutes = (nextTimestampUtcMs - currentTimestampUtcMs) / 60000;
  if (!Number.isFinite(deltaMinutes) || deltaMinutes <= 0) {
    return expected;
  }

  if (deltaMinutes > maxSafe) {
    return expected;
  }

  return deltaMinutes;
}

export function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function min(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((acc, value) => (value < acc ? value : acc), values[0]);
}

export function max(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((acc, value) => (value > acc ? value : acc), values[0]);
}

export function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

export function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

