import { test, expect } from "../../src/fixtures";
import { aiPost } from "../../src/app-api";
import { recordEval } from "../../src/eval-record";
import { categorizeResponse } from "../../src/schemas";
import { categorizeCases } from "../../evals/datasets/categorize";

// The same input can get different answers: each case is asked EVAL_RUNS times.
// The majority answer is scored, and "consistent" records whether all runs agreed.
const RUNS = Number(process.env.EVAL_RUNS ?? 3);

test.describe("AI categorization eval", () => {
  for (const c of categorizeCases) {
    test(`${c.id}: "${c.description}" → ${c.expected}`, { tag: [`@${c.locale}`] }, async ({ api }, testInfo) => {
      const answers: string[] = [];
      let retries = 0;
      for (let run = 0; run < RUNS; run++) {
        const call = await aiPost(api, "/api/ai/categorize", { description: c.description, locale: c.locale });
        retries += call.retries;
        expect(call.response.status(), "categorize status").toBe(200);
        answers.push(categorizeResponse.parse(await call.response.json()).category);
      }

      const counts = new Map<string, number>();
      for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1);
      const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const pass = majority === c.expected;

      recordEval(testInfo, {
        suite: "categorize",
        id: c.id,
        locale: c.locale,
        pass,
        input: c.description,
        expected: c.expected,
        actual: answers,
        checks: { consistent: counts.size === 1 },
        retries,
      });
      expect(majority, `answers over ${RUNS} runs: ${answers.join(", ")}`).toBe(c.expected);
    });
  }
});
