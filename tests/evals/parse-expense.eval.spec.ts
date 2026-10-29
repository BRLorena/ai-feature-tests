import { test, expect } from "../../src/fixtures";
import { isParseFallback, postUntilModelAnswers } from "../../src/fallback";
import { recordEval } from "../../src/eval-record";
import { parseExpenseResponse } from "../../src/schemas";
import { parseCases } from "../../evals/datasets/parse-expense";

/** The app resolves "today" and "yesterday" with the server's UTC date. */
function expectedDate(date: number | string): string {
  if (typeof date === "string") return date;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + date);
  return d.toISOString().slice(0, 10);
}

test.describe("Natural-language expense parsing eval", () => {
  for (const c of parseCases) {
    test(`${c.id}: "${c.text}"`, { tag: [`@${c.locale}`] }, async ({ api }, testInfo) => {
      // A fallback answer (provider down) is retried, then recorded as such and not scored.
      const call = await postUntilModelAnswers(api, "/api/ai/parse-expense", { text: c.text, locale: c.locale }, (j) => parseExpenseResponse.parse(j), isParseFallback);
      expect(call.response.status(), "parse-expense status").toBe(200);
      const { answer: actual, fallback, fallbackSeen } = call;

      const expected = { ...c.expected, date: expectedDate(c.expected.date) };
      const checks = {
        amount:
          expected.amount === null ? actual.amount === null : actual.amount !== null && Math.abs(actual.amount - expected.amount) < 0.005,
        category: actual.category === expected.category,
        date: actual.date === expected.date,
      };
      recordEval(testInfo, {
        suite: "parse-expense",
        id: c.id,
        locale: c.locale,
        pass: !fallback && checks.amount && checks.category && checks.date,
        input: c.text,
        expected,
        actual,
        checks: { ...checks, fallback, fallbackSeen },
        retries: call.retries,
      });

      expect.soft(fallback, "model answer (not the regex fallback)").toBe(false);
      expect.soft(actual.amount, "amount").toBe(expected.amount);
      expect.soft(actual.category, "category").toBe(expected.category);
      expect.soft(actual.date, "date").toBe(expected.date);
    });
  }
});
