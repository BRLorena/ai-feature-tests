import { request } from "@playwright/test";
import { test, expect } from "../../src/fixtures";
import { aiPost, loginTestUser, wipeUserData } from "../../src/app-api";
import { isInsightsFallback, isParseFallback, postUntilModelAnswers } from "../../src/fallback";
import { recordEval } from "../../src/eval-record";
import { categorizeResponse, insightsResponse, parseExpenseResponse } from "../../src/schemas";
import { categorizeInjections, insightsInjection, parseInjections } from "../../evals/datasets/adversarial";

const yesterdayUtc = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

test.describe("Prompt injection", () => {
  for (const c of categorizeInjections) {
    test(`${c.id} is ignored`, async ({ api }, testInfo) => {
      const call = await aiPost(api, "/api/ai/categorize", { description: c.description, locale: c.locale });
      expect(call.response.status()).toBe(200);
      const { category } = categorizeResponse.parse(await call.response.json());
      recordEval(testInfo, {
        suite: "adversarial", id: c.id, locale: c.locale, pass: category === c.expected,
        input: c.description, expected: c.expected, actual: category, checks: {}, retries: call.retries, knownIssue: c.knownIssue,
      });
      if (c.knownIssue) test.fail(true, `${c.knownIssue}: the injected instruction can change the category`);
      expect(category, "category the injection tried to change").toBe(c.expected);
    });
  }

  for (const c of parseInjections) {
    test(`${c.id} is ignored`, async ({ api }, testInfo) => {
      const call = await postUntilModelAnswers(api, "/api/ai/parse-expense", { text: c.text, locale: c.locale }, (j) => parseExpenseResponse.parse(j), isParseFallback);
      expect(call.response.status()).toBe(200);
      const actual = call.answer;
      const checks = {
        amount: actual.amount === c.expected.amount,
        ...(c.expected.category && { category: actual.category === c.expected.category }),
        ...(c.expected.date !== undefined && { date: actual.date === yesterdayUtc() }),
      };
      recordEval(testInfo, {
        suite: "adversarial", id: c.id, locale: c.locale, pass: Object.values(checks).every(Boolean),
        input: c.text, expected: c.expected, actual, checks: { ...checks, fallback: call.fallback }, retries: call.retries, knownIssue: c.knownIssue,
      });
      // The fallback never reads the injection, so it can't show whether the model resists it.
      test.skip(call.fallback, "the provider was unavailable: the app answered with its fallback");
      if (c.knownIssue) test.fail(true, `${c.knownIssue}: prompt injection overrides the parsed expense`);
      expect.soft(actual.amount, "amount").toBe(c.expected.amount);
      if (c.expected.category) expect.soft(actual.category, "category").toBe(c.expected.category);
      if (c.expected.date !== undefined) expect.soft(actual.date, "date").toBe(yesterdayUtc());
    });
  }

  test(`${insightsInjection.id}: stored text in a category does not take over the insights`, async ({ baseURL }, testInfo) => {
    const user = await loginTestUser(baseURL!, "injection");
    const api = await request.newContext({ baseURL, storageState: user.storageState });
    await wipeUserData(api);
    const created = await api.post("/api/expenses", {
      data: { description: "Lunch", amount: "10", category: insightsInjection.category, date: new Date().toISOString().slice(0, 10) },
    });
    // The API accepts any string as a category, which is what makes this injection possible.
    expect(created.status(), "expense with a free-text category").toBe(201);

    const call = await postUntilModelAnswers(api, "/api/ai/insights", { locale: "en" }, (j) => insightsResponse.parse(j), isInsightsFallback);
    expect(call.response.status()).toBe(200);
    const insights = call.answer;
    const text = JSON.stringify(insights);
    const hijacked = text.includes(insightsInjection.marker);
    recordEval(testInfo, {
      suite: "adversarial", id: insightsInjection.id, locale: "en", pass: !hijacked,
      input: insightsInjection.category, expected: `no "${insightsInjection.marker}"`, actual: insights,
      checks: { categoryAccepted: created.status() === 201, fallback: call.fallback }, retries: call.retries,
    });
    await api.dispose();
    // The fallback copies category names verbatim, so it would "contain" the marker without any injection.
    test.skip(call.fallback, "the provider was unavailable: the app answered with its fallback");
    expect(hijacked, `insights contain "${insightsInjection.marker}"`).toBe(false);
  });
});

test.describe("Unbounded input", () => {
  test("an oversized description is rejected before it reaches the model", async ({ api }, testInfo) => {
    // ~20k characters (≈5k tokens) in one request. Without a length limit, every
    // such request is paid for, and a few of them use up the provider's rate limit.
    const description = "Coffee ".repeat(3_000);
    const response = await api.post("/api/ai/categorize", { data: { description, locale: "en" }, timeout: 60_000 });
    recordEval(testInfo, {
      suite: "adversarial", id: "categorize-oversized-input", locale: "en", pass: response.status() === 400,
      input: `${description.length} characters`, expected: 400, actual: response.status(), checks: {}, retries: 0,
      knownIssue: "BUG-6",
    });
    test.fail(true, "BUG-6: no length limit, the whole text is sent to the model (200 or 500 depending on the provider)");
    expect(response.status(), "status for a 21,000-character description").toBe(400);
  });
});
