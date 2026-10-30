import { request } from "@playwright/test";
import { test, expect } from "../../src/fixtures";
import { aiPost, loginTestUser } from "../../src/app-api";
import { categorizeResponse, errorResponse, insightsResponse, parseExpenseResponse } from "../../src/schemas";

const ENDPOINTS = [
  { url: "/api/ai/categorize", valid: { description: "Coffee", locale: "en" }, field: "description" },
  { url: "/api/ai/parse-expense", valid: { text: "Coffee $3", locale: "en" }, field: "text" },
  { url: "/api/ai/insights", valid: { locale: "en" }, field: null },
] as const;

test.describe("Authentication", () => {
  for (const e of ENDPOINTS) {
    test(`${e.url} returns 401 without a session`, async ({ baseURL }) => {
      // An explicit empty state: inside the test runner, new contexts inherit the project's storageState.
      const anonymous = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
      const response = await anonymous.post(e.url, { data: e.valid });
      expect(response.status()).toBe(401);
      expect(errorResponse.parse(await response.json()).error).toBe("Unauthorized");
      await anonymous.dispose();
    });
  }
});

test.describe("Input validation", () => {
  for (const e of ENDPOINTS.filter((e) => e.field)) {
    for (const [label, value] of [["missing", undefined], ["empty", ""], ["a number", 42], ["an object", { a: 1 }]] as const) {
      test(`${e.url} returns 400 when ${e.field} is ${label}`, async ({ api }) => {
        const response = await api.post(e.url, { data: { ...e.valid, [e.field!]: value } });
        expect(response.status()).toBe(400);
        errorResponse.parse(await response.json());
      });
    }
  }
});

test.describe("Response schemas", () => {
  test("categorize returns one of the 10 category keys", async ({ api }) => {
    const { response } = await aiPost(api, "/api/ai/categorize", { description: "Bus ticket", locale: "en" });
    expect(response.status()).toBe(200);
    categorizeResponse.parse(await response.json());
  });

  test("parse-expense returns amount, description, category and an ISO date", async ({ api }) => {
    const { response } = await aiPost(api, "/api/ai/parse-expense", { text: "Bus ticket $2.50 today", locale: "en" });
    expect(response.status()).toBe(200);
    parseExpenseResponse.parse(await response.json());
  });

  test("insights returns summary, trends, recommendations and alerts", async ({ api }) => {
    const { response } = await aiPost(api, "/api/ai/insights", { locale: "en" });
    expect(response.status()).toBe(200);
    insightsResponse.parse(await response.json());
  });

  test("an unsupported locale falls back instead of failing", async ({ api }) => {
    const { response } = await aiPost(api, "/api/ai/categorize", { description: "Bus ticket", locale: "de" });
    expect(response.status()).toBe(200);
    categorizeResponse.parse(await response.json());
  });
});

test.describe("Rate limiting", () => {
  test("repeated AI requests get 429 with rate-limit headers", async ({ baseURL }) => {
    // The limit is 10 per minute, per user and endpoint, but kept in memory per server
    // instance: requests spread over several instances each meet a fresh counter, so the
    // 11th request is not reliably the limited one. The test asks until a 429 arrives.
    // The limit is checked before the body is validated, so an empty body is counted
    // without calling the model.
    // A dedicated account, so using up its budget doesn't slow down the other tests.
    const user = await loginTestUser(baseURL!, "rate-limit");
    const api = await request.newContext({ baseURL, storageState: user.storageState });
    const statuses: number[] = [];
    let limited;
    for (let i = 0; i < 50 && !limited; i++) {
      const res = await api.post("/api/ai/categorize", { data: {} });
      statuses.push(res.status());
      if (res.status() === 429) limited = res;
    }
    await api.dispose();
    expect(limited, `no 429 in ${statuses.length} requests: ${statuses.join(", ")}`).toBeDefined();
    expect(limited!.headers()["x-ratelimit-limit"]).toBe("10");
    expect(limited!.headers()["x-ratelimit-remaining"]).toBe("0");
    expect(Number(limited!.headers()["x-ratelimit-reset"])).toBeGreaterThan(0);
  });
});
