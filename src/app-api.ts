/**
 * Talking to the Finance App over HTTP: test accounts, login and the AI endpoints.
 */
import { request, type APIRequestContext, type APIResponse } from "@playwright/test";

export type StorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;

export interface TestUser {
  email: string;
  password: string;
  storageState: StorageState;
}

// `||`: an unset GitHub secret arrives as an empty string.
const PASSWORD = process.env.AI_TEST_PASSWORD || "ai-tests-password-1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Logs in a fixed test account, registering it on first use.
 * Fixed accounts (one per worker, plus one per data-dependent suite) keep the
 * production database from growing on every run.
 */
export async function loginTestUser(baseURL: string, name: string): Promise<TestUser> {
  const email = `ai-tests-${name}@example.com`;
  const ctx = await request.newContext({ baseURL });
  try {
    for (let attempt = 0; ; attempt++) {
      const res = await ctx.post("/api/register", { data: { name: `AI tests ${name}`, email, password: PASSWORD } });
      // 201 = created; 400 = already exists. 429 = the IP-based limit of 10/min.
      if (res.status() !== 429 || attempt >= 3) break;
      await sleep(20_000);
    }
    const { csrfToken } = await (await ctx.get("/api/auth/csrf")).json();
    await ctx.post("/api/auth/callback/credentials", {
      form: { csrfToken, email, password: PASSWORD, callbackUrl: baseURL },
      maxRedirects: 0,
    });
    const storageState = await ctx.storageState();
    if (!storageState.cookies.some((c) => c.name.endsWith("authjs.session-token"))) {
      throw new Error(`Login failed for ${email}: no session cookie`);
    }
    return { email, password: PASSWORD, storageState };
  } finally {
    await ctx.dispose();
  }
}

export interface AiCallResult {
  response: APIResponse;
  /** Attempts that hit a rate limit or a server error before the final response. */
  retries: number;
}

/**
 * POSTs to an AI endpoint. 429s (the app's limit is 10/min per user and endpoint)
 * and 5xx (usually the model provider's own rate limit) are retried with backoff,
 * so infrastructure noise is counted separately instead of being scored as a wrong answer.
 */
export async function aiPost(api: APIRequestContext, url: string, data: unknown): Promise<AiCallResult> {
  for (let retries = 0; ; retries++) {
    const response = await api.post(url, { data, timeout: 60_000 });
    const status = response.status();
    if ((status !== 429 && status < 500) || retries >= 4) return { response, retries };
    const reset = Number(response.headers()["x-ratelimit-reset"]);
    await sleep(status === 429 && reset > 0 ? reset * 1000 + 500 : 5_000 * 2 ** retries);
  }
}

/** Deletes every expense and income of the logged-in user (for suites whose output depends on the data). */
export async function wipeUserData(api: APIRequestContext) {
  for (const kind of ["expenses", "incomes"] as const) {
    for (;;) {
      const list = await (await api.get(`/api/${kind}?limit=100`)).json();
      const items: { id: string }[] = list[kind] ?? [];
      if (items.length === 0) break;
      for (const item of items) await api.delete(`/api/${kind}/${item.id}`);
    }
  }
}
