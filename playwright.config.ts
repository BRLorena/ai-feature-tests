import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "https://finance-app-nine-dusky.vercel.app";
const suffix = process.env.RUN_NAME ? `-${process.env.RUN_NAME}` : "";

export default defineConfig({
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retries would hide model variance: evals measure it explicitly (EVAL_RUNS) instead.
  retries: 0,
  reporter: [
    ["list"],
    // RUN_NAME separates the reports of runs made one after the other (see npm run test:evals).
    ["html", { open: "never", outputFolder: `reports/playwright-report${suffix}` }],
    ["json", { outputFile: `reports/results${suffix}.json` }],
  ],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    // API contract: status codes, auth and response schemas. Answers are not judged.
    { name: "contract", testDir: "tests/contract" },
    // Quality of the real model, scored against datasets. The gate (npm run gate) decides the job.
    { name: "evals", testDir: "tests/evals", testIgnore: "insights.eval.spec.ts" },
    // Insights prompts are large: run alone, after the other evals, so the provider's
    // tokens-per-minute limit doesn't turn answers into the app's fallback.
    { name: "insights", testDir: "tests/evals", testMatch: "insights.eval.spec.ts" },
    // Prompt injection and hostile input against the real model.
    { name: "adversarial", testDir: "tests/adversarial" },
    // The UI with the LLM mocked: deterministic, no model calls.
    { name: "ui", testDir: "tests/ui", use: { ...devices["Desktop Chrome"] } },
  ],
});
