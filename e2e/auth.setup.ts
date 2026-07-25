import { test as setup, expect } from "@playwright/test";

/**
 * Sign in once and save the session, so the specs reuse it instead of logging
 * in repeatedly — Better Auth rate-limits sign-in, which is exactly what we
 * want in production but would fail a suite that authenticates per test.
 */
export const STORAGE_STATE = "e2e/.auth/coordinator.json";

const EMAIL = process.env.COORDINATOR_EMAIL ?? "coordinator@example.com";
const PASSWORD = process.env.COORDINATOR_PASSWORD ?? "coordinator123";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  // Wait for hydration: before React attaches its submit handler the form would
  // submit natively and simply reload /login.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
