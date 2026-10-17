import type { NumericBaseline } from '../types/detection';

export const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function standardDeviation(values: number[], center = mean(values)): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1));
}

export function numericBaseline(values: number[]): NumericBaseline {
  const average = mean(values);
  const middle = median(values);
  const sd = standardDeviation(values, average);
  const mad = median(values.map((value) => Math.abs(value - middle)));
  const spread = Math.max(mad * 1.4826, sd * 0.5);
  return {
    mean: average,
    median: middle,
    standardDeviation: sd,
    robustSpread: spread,
    typicalLow: middle - 2 * Math.max(spread, Number.EPSILON),
    typicalHigh: middle + 2 * Math.max(spread, Number.EPSILON),
  };
}

export function circularDifferenceMinutes(first: number, second: number): number {
  const difference = Math.abs(first - second) % 1440;
  return Math.min(difference, 1440 - difference);
}

export function signedCircularDifferenceMinutes(value: number, center: number): number {
  return ((value - center + 2160) % 1440) - 720;
}

export function circularMeanMinutes(values: number[]): number {
  if (!values.length) return 0;
  const radians = values.map((minute) => (minute / 1440) * Math.PI * 2);
  const angle = Math.atan2(mean(radians.map(Math.sin)), mean(radians.map(Math.cos)));
  return ((angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2)) * 1440;
}

export function frequencyMap(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
