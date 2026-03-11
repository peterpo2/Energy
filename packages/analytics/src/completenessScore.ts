import { clamp01 } from "./math";

export interface CompletenessInput {
  uniqueSampleCount: number;
  periodMinutes: number;
  expectedSamplingMinutes: number;
}

export function expectedSampleCount(
  periodMinutes: number,
  expectedSamplingMinutes: number,
): number {
  if (periodMinutes <= 0 || expectedSamplingMinutes <= 0) {
    return 0;
  }
  return Math.round(periodMinutes / expectedSamplingMinutes);
}

export function completenessScore(input: CompletenessInput): {
  expectedSamples: number;
  missingSamples: number;
  ratio: number;
} {
  const expectedSamples = expectedSampleCount(input.periodMinutes, input.expectedSamplingMinutes);
  if (expectedSamples <= 0) {
    return { expectedSamples: 0, missingSamples: 0, ratio: 1 };
  }

  const missingSamples = Math.max(0, expectedSamples - input.uniqueSampleCount);
  const ratio = clamp01(input.uniqueSampleCount / expectedSamples);
  return { expectedSamples, missingSamples, ratio };
}

