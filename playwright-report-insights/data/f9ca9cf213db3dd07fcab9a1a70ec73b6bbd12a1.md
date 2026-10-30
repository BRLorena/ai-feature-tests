# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/evals/insights.eval.spec.ts >> AI financial insights eval >> insights in pt (run 2)
- Location: tests/evals/insights.eval.spec.ts:80:7

# Error details

```
Error: amounts and percentages not found in the user's data

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "75%",
+ ]
```

# Test source

```ts
  20  |   { description: "Monthly train pass", amount: 120, category: "transportation", date: thisMonth },
  21  |   { description: "Concert", amount: 80, category: "entertainment", date: thisMonth },
  22  |   { description: "Groceries", amount: 300, category: "foodDining", date: lastMonth },
  23  |   { description: "Electricity and water", amount: 200, category: "billsUtilities", date: lastMonth },
  24  | ];
  25  | const INCOME = { description: "Salary", amount: 3000, category: "salary", date: thisMonth };
  26  | 
  27  | /** Every amount and percentage that can be read or simply derived from the seeded data. */
  28  | function allowedNumbers(): AllowedNumbers {
  29  |   const total = EXPENSES.reduce((s, e) => s + e.amount, 0); // 1150
  30  |   const current = EXPENSES.filter((e) => e.date === thisMonth).reduce((s, e) => s + e.amount, 0); // 650
  31  |   const previous = total - current; // 500
  32  |   const byCategory = new Map<string, number>();
  33  |   for (const e of EXPENSES) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  34  |   const perMonthByCategory = EXPENSES.map((e) => e.amount);
  35  |   const money = [
  36  |     total, current, previous, INCOME.amount, INCOME.amount - total, INCOME.amount - current, current - previous,
  37  |     ...byCategory.values(),
  38  |     ...[...byCategory.values()].map((v) => total - v), // "everything except food: $400"
  39  |     ...perMonthByCategory,
  40  |     450, // food this month
  41  |     ...[...byCategory.keys()].map((k) => byCategory.get(k)! / EXPENSES.filter((e) => e.category === k).length), // "$187.50 per transaction"
  42  |   ];
  43  |   const percent = [
  44  |     ((INCOME.amount - total) / INCOME.amount) * 100, // savings rate 61.7
  45  |     ((current - previous) / previous) * 100, // month-over-month +30
  46  |     (total / INCOME.amount) * 100,
  47  |     ...[...byCategory.values()].map((v) => (v / total) * 100),
  48  |     ...[...byCategory.values()].map((v) => (v / INCOME.amount) * 100),
  49  |   ];
  50  |   return { money, percent };
  51  | }
  52  | 
  53  | const test = base.extend<{}, { insightsApi: APIRequestContext }>({
  54  |   insightsApi: [
  55  |     async ({}, use, workerInfo) => {
  56  |       const baseURL = workerInfo.project.use.baseURL!;
  57  |       const user = await loginTestUser(baseURL, "insights");
  58  |       const api = await request.newContext({ baseURL, storageState: user.storageState });
  59  |       await wipeUserData(api);
  60  |       for (const e of EXPENSES) {
  61  |         const res = await api.post("/api/expenses", { data: { ...e, amount: String(e.amount) } });
  62  |         expect(res.status(), `seed expense ${e.description}`).toBe(201);
  63  |       }
  64  |       const res = await api.post("/api/incomes", { data: { ...INCOME, amount: String(INCOME.amount), recurring: false } });
  65  |       expect(res.status(), "seed income").toBe(201);
  66  |       await use(api);
  67  |       await api.dispose();
  68  |     },
  69  |     { scope: "worker" },
  70  |   ],
  71  | });
  72  | 
  73  | // One worker for the whole file: all tests share the seeded account. Fallback retries
  74  | // wait 30 s each, so a test can take a few minutes.
  75  | test.describe.configure({ mode: "default", timeout: 300_000 });
  76  | 
  77  | test.describe("AI financial insights eval", () => {
  78  |   for (const locale of LOCALES) {
  79  |     for (let run = 1; run <= RUNS; run++) {
  80  |       test(`insights in ${locale} (run ${run})`, { tag: [`@${locale}`] }, async ({ insightsApi }, testInfo) => {
  81  |         // A fallback answer (provider down) is retried, then recorded as such and not scored.
  82  |         const call = await postUntilModelAnswers(insightsApi, "/api/ai/insights", { locale }, (j) => insightsResponse.parse(j), isInsightsFallback);
  83  |         const { answer: insights, fallbackSeen } = call;
  84  |         expect(call.response.status(), "insights status").toBe(200);
  85  | 
  86  |         const descriptive = [insights.summary, ...insights.trends, ...insights.alerts].join("\n");
  87  |         const language = detectLanguage([insights.summary, ...insights.trends, ...insights.recommendations].join(" "));
  88  |         // Recommendations may propose new targets ("cut dining by $100"), so only
  89  |         // descriptive text (summary, trends, alerts) is checked for invented numbers.
  90  |         const allowed = allowedNumbers();
  91  |         const stated = extractStatedNumbers(descriptive);
  92  |         const untraced = stated.filter((n) => !isTraceable(n, allowed)).map((n) => n.raw);
  93  | 
  94  |         const checks = {
  95  |           fallback: call.fallback,
  96  |           fallbackSeen,
  97  |           language: language.language === locale,
  98  |           structure:
  99  |             insights.trends.length >= 2 && insights.trends.length <= 3 &&
  100 |             insights.recommendations.length >= 3 && insights.recommendations.length <= 4 &&
  101 |             insights.alerts.length <= 2,
  102 |           numbersStated: stated.length,
  103 |           numbersUntraced: untraced.length,
  104 |         };
  105 |         recordEval(testInfo, {
  106 |           suite: "insights",
  107 |           id: `${locale}-run${run}`,
  108 |           locale,
  109 |           pass: !checks.fallback && checks.language && checks.structure && untraced.length === 0,
  110 |           input: { locale },
  111 |           expected: { language: locale, numbersFrom: allowed },
  112 |           actual: { ...insights, detectedLanguage: language, untraced },
  113 |           checks,
  114 |           retries: call.retries,
  115 |         });
  116 | 
  117 |         expect.soft(checks.fallback, "model answer (not the hard-coded fallback)").toBe(false);
  118 |         expect.soft(language.language, `language (scores ${JSON.stringify(language.scores)})`).toBe(locale);
  119 |         expect.soft(checks.structure, `2-3 trends, 3-4 recommendations, 0-2 alerts`).toBe(true);
> 120 |         expect.soft(untraced, "amounts and percentages not found in the user's data").toEqual([]);
      |                                                                                       ^ Error: amounts and percentages not found in the user's data
  121 |       });
  122 |     }
  123 |   }
  124 | });
  125 | 
```