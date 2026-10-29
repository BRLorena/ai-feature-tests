import { test as base, expect, request, type APIRequestContext } from "@playwright/test";
import { loginTestUser, wipeUserData } from "../../src/app-api";
import { isInsightsFallback, postUntilModelAnswers } from "../../src/fallback";
import { recordEval } from "../../src/eval-record";
import { insightsResponse } from "../../src/schemas";
import { detectLanguage } from "../../evals/language";
import { extractStatedNumbers, isTraceable, type AllowedNumbers } from "../../evals/numbers";

const RUNS = Number(process.env.INSIGHTS_RUNS ?? 2);
const LOCALES = ["en", "pt", "es", "fr"] as const;

// Known data for a dedicated account: this month vs the 15th of last month.
const now = new Date();
const thisMonth = now.toISOString().slice(0, 10);
const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString().slice(0, 10);
const EXPENSES = [
  { description: "Supermarket", amount: 150, category: "foodDining", date: thisMonth },
  { description: "Restaurant", amount: 150, category: "foodDining", date: thisMonth },
  { description: "Groceries", amount: 150, category: "foodDining", date: thisMonth },
  { description: "Monthly train pass", amount: 120, category: "transportation", date: thisMonth },
  { description: "Concert", amount: 80, category: "entertainment", date: thisMonth },
  { description: "Groceries", amount: 300, category: "foodDining", date: lastMonth },
  { description: "Electricity and water", amount: 200, category: "billsUtilities", date: lastMonth },
];
const INCOME = { description: "Salary", amount: 3000, category: "salary", date: thisMonth };

/** Every amount and percentage that can be read or simply derived from the seeded data. */
function allowedNumbers(): AllowedNumbers {
  const total = EXPENSES.reduce((s, e) => s + e.amount, 0); // 1150
  const current = EXPENSES.filter((e) => e.date === thisMonth).reduce((s, e) => s + e.amount, 0); // 650
  const previous = total - current; // 500
  const byCategory = new Map<string, number>();
  for (const e of EXPENSES) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const perMonthByCategory = EXPENSES.map((e) => e.amount);
  const money = [
    total, current, previous, INCOME.amount, INCOME.amount - total, INCOME.amount - current, current - previous,
    ...byCategory.values(),
    ...[...byCategory.values()].map((v) => total - v), // "everything except food: $400"
    ...perMonthByCategory,
    450, // food this month
    ...[...byCategory.keys()].map((k) => byCategory.get(k)! / EXPENSES.filter((e) => e.category === k).length), // "$187.50 per transaction"
  ];
  const percent = [
    ((INCOME.amount - total) / INCOME.amount) * 100, // savings rate 61.7
    ((current - previous) / previous) * 100, // month-over-month +30
    (total / INCOME.amount) * 100,
    ...[...byCategory.values()].map((v) => (v / total) * 100),
    ...[...byCategory.values()].map((v) => (v / INCOME.amount) * 100),
  ];
  return { money, percent };
}

const test = base.extend<{}, { insightsApi: APIRequestContext }>({
  insightsApi: [
    async ({}, use, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL!;
      const user = await loginTestUser(baseURL, "insights");
      const api = await request.newContext({ baseURL, storageState: user.storageState });
      await wipeUserData(api);
      for (const e of EXPENSES) {
        const res = await api.post("/api/expenses", { data: { ...e, amount: String(e.amount) } });
        expect(res.status(), `seed expense ${e.description}`).toBe(201);
      }
      const res = await api.post("/api/incomes", { data: { ...INCOME, amount: String(INCOME.amount), recurring: false } });
      expect(res.status(), "seed income").toBe(201);
      await use(api);
      await api.dispose();
    },
    { scope: "worker" },
  ],
});

// One worker for the whole file: all tests share the seeded account. Fallback retries
// wait 30 s each, so a test can take a few minutes.
test.describe.configure({ mode: "default", timeout: 300_000 });

test.describe("AI financial insights eval", () => {
  for (const locale of LOCALES) {
    for (let run = 1; run <= RUNS; run++) {
      test(`insights in ${locale} (run ${run})`, { tag: [`@${locale}`] }, async ({ insightsApi }, testInfo) => {
        // A fallback answer (provider down) is retried, then recorded as such and not scored.
        const call = await postUntilModelAnswers(insightsApi, "/api/ai/insights", { locale }, (j) => insightsResponse.parse(j), isInsightsFallback);
        const { answer: insights, fallbackSeen } = call;
        expect(call.response.status(), "insights status").toBe(200);

        const descriptive = [insights.summary, ...insights.trends, ...insights.alerts].join("\n");
        const language = detectLanguage([insights.summary, ...insights.trends, ...insights.recommendations].join(" "));
        // Recommendations may propose new targets ("cut dining by $100"), so only
        // descriptive text (summary, trends, alerts) is checked for invented numbers.
        const allowed = allowedNumbers();
        const stated = extractStatedNumbers(descriptive);
        const untraced = stated.filter((n) => !isTraceable(n, allowed)).map((n) => n.raw);

        const checks = {
          fallback: call.fallback,
          fallbackSeen,
          language: language.language === locale,
          structure:
            insights.trends.length >= 2 && insights.trends.length <= 3 &&
            insights.recommendations.length >= 3 && insights.recommendations.length <= 4 &&
            insights.alerts.length <= 2,
          numbersStated: stated.length,
          numbersUntraced: untraced.length,
        };
        recordEval(testInfo, {
          suite: "insights",
          id: `${locale}-run${run}`,
          locale,
          pass: !checks.fallback && checks.language && checks.structure && untraced.length === 0,
          input: { locale },
          expected: { language: locale, numbersFrom: allowed },
          actual: { ...insights, detectedLanguage: language, untraced },
          checks,
          retries: call.retries,
        });

        expect.soft(checks.fallback, "model answer (not the hard-coded fallback)").toBe(false);
        expect.soft(language.language, `language (scores ${JSON.stringify(language.scores)})`).toBe(locale);
        expect.soft(checks.structure, `2-3 trends, 3-4 recommendations, 0-2 alerts`).toBe(true);
        expect.soft(untraced, "amounts and percentages not found in the user's data").toEqual([]);
      });
    }
  }
});
