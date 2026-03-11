export interface MissingIntervalRange {
  startUtcMs: number;
  endUtcMs: number;
  expectedStepMinutes: number;
  missingPoints: number;
}

export function detectGaps(
  timestampsUtcMs: number[],
  expectedSamplingMinutes: number,
): MissingIntervalRange[] {
  if (timestampsUtcMs.length < 2) {
    return [];
  }

  const uniqueSorted = Array.from(new Set(timestampsUtcMs)).sort((a, b) => a - b);
  const expectedStepMs = expectedSamplingMinutes * 60 * 1000;
  const gaps: MissingIntervalRange[] = [];

  for (let i = 1; i < uniqueSorted.length; i += 1) {
    const prev = uniqueSorted[i - 1];
    const curr = uniqueSorted[i];
    const diffMs = curr - prev;
    if (diffMs <= expectedStepMs) {
      continue;
    }

    const missingPoints = Math.floor(diffMs / expectedStepMs) - 1;
    if (missingPoints > 0) {
      gaps.push({
        startUtcMs: prev,
        endUtcMs: curr,
        expectedStepMinutes: expectedSamplingMinutes,
        missingPoints,
      });
    }
  }

  return gaps;
}

