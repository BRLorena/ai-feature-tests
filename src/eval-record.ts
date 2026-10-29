import type { TestInfo } from "@playwright/test";

/**
 * One scored eval case. Stored as a test annotation, so it ends up in
 * reports/results.json, where the gate (evals/gate.ts) aggregates them.
 */
export interface EvalRecord {
  suite: "categorize" | "parse-expense" | "insights" | "adversarial";
  id: string;
  locale: string;
  pass: boolean;
  input: unknown;
  expected: unknown;
  actual: unknown;
  /** Per-case measurements, e.g. { amount: true, date: false } or { consistent: true }. */
  checks: Record<string, boolean | number>;
  /** Calls that were retried because of a rate limit or a 5xx. */
  retries: number;
  /**
   * A confirmed, reported bug this case reproduces (e.g. "BUG-5"). The gate lists it
   * instead of failing on it, and fails when it starts passing, so the marker is
   * removed together with the fix (the eval equivalent of test.fail()).
   */
  knownIssue?: string;
}

export function recordEval(testInfo: TestInfo, record: EvalRecord) {
  testInfo.annotations.push({ type: "eval", description: JSON.stringify(record) });
}
