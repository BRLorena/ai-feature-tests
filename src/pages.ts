import { expect, type Page, type Route } from "@playwright/test";

type Locale = "en" | "pt";
const LABELS = {
  en: { addExpense: "Add New Expense", aiSuggest: "AI Suggest", aiSuggesting: "AI Suggesting...", quickAdd: "Quick Add", describe: "Describe your expense", parse: "Parse with AI", insights: "Click to view AI-powered analysis" },
  pt: { addExpense: "Adicionar Nova Despesa", aiSuggest: "Sugestão IA", aiSuggesting: "IA Sugerindo...", quickAdd: "Adicionar Rápido", describe: "Descreva sua despesa", parse: "Analisar com IA", insights: "Clique para ver análise com IA" },
};

/** Fulfils an AI endpoint with a canned answer, an error, or after a delay. No model is called. */
export async function mockAi(
  page: Page,
  endpoint: "categorize" | "parse-expense" | "insights",
  reply: { status?: number; json: unknown; delayMs?: number },
) {
  const requests: unknown[] = [];
  await page.route(`**/api/ai/${endpoint}`, async (route: Route) => {
    requests.push(route.request().postDataJSON());
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
    await route.fulfill({ status: reply.status ?? 200, json: reply.json });
  });
  return requests;
}

export class ExpenseForm {
  readonly labels;
  constructor(readonly page: Page, readonly locale: Locale = "en") {
    this.labels = LABELS[locale];
  }
  readonly toast = () => this.page.locator("[data-sonner-toast]");

  async open() {
    await this.page.goto(this.locale === "en" ? "/expenses" : `/${this.locale}/expenses`);
    await this.page.getByRole("button", { name: this.labels.addExpense }).first().click();
    await expect(this.page.getByRole("combobox", { name: /Category|Categoria/ })).toBeVisible();
  }
  category = () => this.page.getByRole("combobox", { name: /Category|Categoria/ });
  description = () => this.page.getByRole("textbox", { name: /^(Description|Descrição)$/ });
  amount = () => this.page.getByRole("spinbutton", { name: /Amount|Valor/ });
  date = () => this.page.getByRole("textbox", { name: /^(Date|Data)$/ });
  aiSuggestButton = () => this.page.getByRole("button", { name: new RegExp(`${this.labels.aiSuggest}|${this.labels.aiSuggesting.replace(/\./g, "\\.")}`) });

  async suggestCategory(description: string) {
    await this.description().fill(description);
    // The button is enabled by React once it sees the description: this also waits for hydration.
    await expect(this.aiSuggestButton()).toBeEnabled();
    await this.aiSuggestButton().click();
  }

  async quickAdd(text: string) {
    await this.page.getByRole("button", { name: this.labels.quickAdd }).click();
    await this.page.getByLabel(this.labels.describe).fill(text);
    await this.page.getByRole("button", { name: this.labels.parse }).click();
  }
}

export class InsightsPanel {
  constructor(readonly page: Page, readonly locale: Locale = "en") {}
  async open() {
    await this.page.goto(this.locale === "en" ? "/summary" : `/${this.locale}/summary`);
    await this.page.getByText(LABELS[this.locale].insights).click();
  }
}
