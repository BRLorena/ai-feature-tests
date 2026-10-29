/**
 * When the model provider fails (rate limit, quota, outage), the app still answers
 * HTTP 200 with a hard-coded fallback from src/lib/groq.ts. Those answers are not
 * the model's, so evals retry them and never score them as right or wrong.
 */
import type { APIRequestContext } from "@playwright/test";
import { aiPost } from "./app-api";

/** A model answer always has a category (the app maps any number to a key); the regex fallback has none. */
export const isParseFallback = (r: { category: string | null }) => r.category === null;

/** The insights fallback always starts its recommendations with this sentence, in English. */
export const isInsightsFallback = (r: { recommendations: string[] }) =>
  r.recommendations[0] === "Review your top spending categories for optimization opportunities";

/**
 * Calls an AI endpoint and repeats the call while the answer is the fallback.
 * The provider's limits are per minute, so the wait is long enough for the window to move.
 */
export async function postUntilModelAnswers<T>(
  api: APIRequestContext,
  url: string,
  data: unknown,
  parse: (json: unknown) => T,
  isFallback: (answer: T) => boolean,
  { attempts = 3, waitMs = 30_000 } = {},
) {
  let call = await aiPost(api, url, data);
  let answer = parse(await call.response.json());
  let fallbackSeen = 0;
  while (isFallback(answer) && fallbackSeen < attempts) {
    fallbackSeen++;
    await new Promise((r) => setTimeout(r, waitMs));
    call = await aiPost(api, url, data);
    answer = parse(await call.response.json());
  }
  return { response: call.response, retries: call.retries, answer, fallback: isFallback(answer), fallbackSeen };
}
