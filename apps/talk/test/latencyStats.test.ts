import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile } from "../src/latencyStats.ts";

test("nearest-rank p95 excludes the worst sample from a 20-click run", () => {
  const samples = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.equal(percentile(samples, 0.95), 19);
  assert.equal(percentile(samples, 0.5), 10);
  assert.equal(percentile(samples, 1), 20);
  assert.equal(percentile([42], 0.95), 42);
  assert.ok(Number.isNaN(percentile([], 0.95)));
});
