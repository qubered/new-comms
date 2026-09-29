/** Nearest-rank percentile of ascending samples; e.g. p95 is sample 19 of 20. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return Number.NaN;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[index]!;
}
