/**
 * The AI features in the browser, with the model replaced by canned answers.
 * These tests check what the UI does with an answer, an error or a slow reply,
 * so they are deterministic and cost nothing. Model quality is covered by tests/evals.
 */
import { test, expect } from "../../src/fixtures";
import { ExpenseForm, InsightsPanel, mockAi } from "../../src/pages";

test.describe("AI Suggest (categorization)", () => {
  test("fills the category with the model's answer", async ({ page }) => {
    await mockAi(page, "categorize", { json: { category: "travel" } });
    const form = new ExpenseForm(page);
    await form.open();
    await form.suggestCategory("Hotel in Lisbon");
    await expect(form.category()).toHaveValue("travel");
  });

  test("sends the description and the UI language to the API", async ({ page }) => {
    const requests = await mockAi(page, "categorize", { json: { category: "foodDining" } });
    const form = new ExpenseForm(page, "pt");
    await form.open();
    await form.suggestCategory("Almoço no restaurante");
    await expect(form.category()).toHaveValue("foodDining");
    expect(requests).toEqual([{ description: "Almoço no restaurante", locale: "pt" }]);
  });

  test("shows a disabled loading button while the model answers", async ({ page }) => {
    await mockAi(page, "categorize", { json: { category: "shopping" }, delayMs: 2_000 });
    const form = new ExpenseForm(page);
    await form.open();
    await form.suggestCategory("New running shoes");
    await expect(form.aiSuggestButton()).toHaveText(/AI Suggesting/);
    await expect(form.aiSuggestButton()).toBeDisabled();
    await expect(form.category()).toHaveValue("shopping");
    await expect(form.aiSuggestButton()).toBeEnabled();
  });

  test("keeps the user's choice when the model fails", async ({ page }) => {
    await mockAi(page, "categorize", { status: 500, json: { error: "Failed to categorize expense" } });
    const form = new ExpenseForm(page);
    await form.open();
    await form.category().selectOption("education");
    await form.suggestCategory("Piano lessons");
    await expect(form.toast()).toBeVisible();
    await expect(form.category()).toHaveValue("education");
  });
});

test.describe("Quick Add (natural-language parsing)", () => {
  test("fills amount, description, category and date", async ({ page }) => {
    await mockAi(page, "parse-expense", {
      json: { amount: 45.5, description: "Groceries", category: "foodDining", date: "2026-10-28" },
    });
    const form = new ExpenseForm(page);
    await form.open();
    await form.quickAdd("Spent $45.50 on groceries yesterday");
    await expect(form.amount()).toHaveValue("45.5");
    await expect(form.description()).toHaveValue("Groceries");
    await expect(form.category()).toHaveValue("foodDining");
    await expect(form.date()).toHaveValue("2026-10-28");
  });

  test("leaves the amount empty when the model found none", async ({ page }) => {
    await mockAi(page, "parse-expense", {
      json: { amount: null, description: "Lunch with the team", category: "foodDining", date: "2026-10-29" },
    });
    const form = new ExpenseForm(page);
    await form.open();
    await form.quickAdd("Lunch with the team");
    await expect(form.description()).toHaveValue("Lunch with the team");
    await expect(form.amount()).toHaveValue("");
  });
});

const INSIGHTS = {
  summary: "You spent $650 this month, 30% more than last month.",
  trends: ["Food & Dining is your largest category", "Spending rose 30% month over month"],
  recommendations: ["Plan meals for the week", "Set a dining budget", "Review subscriptions"],
  alerts: ["Spending increased 30% this month"],
};

test.describe("AI Financial Insights", () => {
  test("renders summary, trends, recommendations and alerts", async ({ page }) => {
    await mockAi(page, "insights", { json: INSIGHTS });
    await new InsightsPanel(page).open();
    await expect(page.getByText(INSIGHTS.summary)).toBeVisible();
    for (const line of [...INSIGHTS.trends, ...INSIGHTS.recommendations, ...INSIGHTS.alerts]) {
      await expect(page.getByText(line, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: /Alerts/ })).toBeVisible();
  });

  test("hides the alerts section when there are none", async ({ page }) => {
    await mockAi(page, "insights", { json: { ...INSIGHTS, alerts: [] } });
    await new InsightsPanel(page).open();
    await expect(page.getByText(INSIGHTS.summary)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Alerts/ })).toHaveCount(0);
  });

  test("shows an error instead of crashing when the model fails", async ({ page }) => {
    await mockAi(page, "insights", { status: 500, json: { error: "Failed to generate insights" } });
    await new InsightsPanel(page).open();
    await expect(page.getByText("Failed to fetch insights")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Total Expenses" })).toBeVisible();
  });
});

/**
 * Known bugs, found by this suite. `test.fail()` keeps the suite green while the bug
 * exists and turns red when it is fixed, so the marker is removed with the fix.
 */
test.describe("Known bugs", () => {
  test("BUG-1: the AI Suggest toast shows the category label, not its internal key", async ({ page }) => {
    test.fail(true, "Shows 'AI suggested: billsUtilities' instead of 'Bills & Utilities'");
    await mockAi(page, "categorize", { json: { category: "billsUtilities" } });
    const form = new ExpenseForm(page);
    await form.open();
    await form.suggestCategory("Electricity bill");
    await expect(form.toast()).toContainText("AI suggested");
    await expect(form.toast()).toContainText("Bills & Utilities", { timeout: 2_000 });
  });

  test("BUG-2: AI error messages don't tell users to start Ollama", async ({ page }) => {
    test.fail(true, "The app uses Groq, but the error toasts say 'Make sure Ollama is running.'");
    await mockAi(page, "categorize", { status: 500, json: { error: "Failed to categorize expense" } });
    const form = new ExpenseForm(page);
    await form.open();
    await form.suggestCategory("Coffee");
    await expect(form.toast()).toBeVisible();
    await expect(form.toast()).not.toContainText("Ollama", { timeout: 2_000 });
  });

  test("BUG-3: AI messages in the expense form are translated", async ({ page }) => {
    test.fail(true, "Toasts are hard-coded in English, also in the Portuguese UI");
    await mockAi(page, "categorize", { status: 500, json: { error: "Failed to categorize expense" } });
    const form = new ExpenseForm(page, "pt");
    await form.open();
    await form.suggestCategory("Café");
    await expect(form.toast()).toBeVisible();
    await expect(form.toast()).not.toContainText("Failed to get AI suggestion", { timeout: 2_000 });
  });

  test("BUG-4: the insights error is translated", async ({ page }) => {
    test.fail(true, "The Portuguese summary page shows 'Failed to fetch insights'");
    await mockAi(page, "insights", { status: 500, json: { error: "Failed to generate insights" } });
    await new InsightsPanel(page, "pt").open();
    const error = page.locator("p.text-red-400");
    await expect(error).toBeVisible();
    await expect(error).not.toHaveText("Failed to fetch insights", { timeout: 2_000 });
  });
});
