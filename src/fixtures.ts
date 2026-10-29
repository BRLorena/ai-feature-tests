import { test as base, request, type APIRequestContext } from "@playwright/test";
import { loginTestUser, type TestUser } from "./app-api";

/**
 * - `user` (worker scope): one logged-in test account per worker. The app rate-limits
 *   AI calls per user, so each worker gets its own budget.
 * - `api`: an API client with that user's session.
 * - `storageState`: browser tests start logged in as the same user.
 */
export const test = base.extend<{ api: APIRequestContext }, { user: TestUser }>({
  user: [
    async ({}, use, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL!;
      await use(await loginTestUser(baseURL, `w${workerInfo.parallelIndex}`));
    },
    { scope: "worker" },
  ],
  api: async ({ user, baseURL }, use) => {
    const api = await request.newContext({ baseURL, storageState: user.storageState });
    await use(api);
    await api.dispose();
  },
  storageState: async ({ user }, use) => use(user.storageState),
});

export { expect } from "@playwright/test";
