import { test, expect, type Page } from "@playwright/test";

/**
 * The critical path through the real UI: create students, assign the same 1st
 * assessor until they hit their maximum, and confirm the picker refuses the one
 * that would exceed it.
 *
 * The session comes from e2e/auth.setup.ts. Expects the seeded development data
 * (`npm run db:seed`), where the assessor "Bo Jansen" (Team 2) has a maximum of
 * 1 as 1st assessor and "Chris Bakker" (Team 1) has 3.
 */

// Namespaces this run's students so repeated runs never collide.
const RUN = Date.now().toString().slice(-6);

async function createStudent(page: Page, suffix: string) {
  await page.goto("/students/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Student number").fill(`e2e-${RUN}-${suffix}`);
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill(`Student ${suffix}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL("/students", { timeout: 15_000 });
}

async function openStudent(page: Page, suffix: string) {
  await page.goto("/students");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: `e2e-${RUN}-${suffix}` }).click();
  await expect(
    page.getByRole("heading", { name: `E2E Student ${suffix}` })
  ).toBeVisible();
}

const firstPicker = (page: Page) => page.getByTestId("assessor-picker-first");

test("reaches the dashboard with a restored session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("assigns a 1st assessor and then blocks the one that would exceed the maximum", async ({
  page,
}) => {
  // Give the capped assessor (max 1) their one and only student.
  await createStudent(page, "a");
  await openStudent(page, "a");
  await firstPicker(page).click();
  await page.getByRole("option", { name: /Bo Jansen/ }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Student saved/i)).toBeVisible();

  // A second student cannot get the same 1st assessor: the option is visible
  // but disabled, and shows the load that blocks it.
  await createStudent(page, "b");
  await openStudent(page, "b");
  await firstPicker(page).click();
  const blocked = page.getByRole("option", { name: /Bo Jansen/ });
  await expect(blocked).toBeVisible();
  await expect(blocked).toHaveAttribute("aria-disabled", "true");
  await expect(blocked).toContainText("1 / 1");
});

test("allows an off-team assessor but shows a warning", async ({ page }) => {
  await createStudent(page, "c");
  await openStudent(page, "c");

  // Topic owned by Team 2 …
  await page.getByLabel("Semester topic").click();
  await page.getByRole("option", { name: /^FED/ }).click();

  // … an assessor from Team 1 is still selectable, with a warning.
  await firstPicker(page).click();
  await page.getByRole("option", { name: /Chris Bakker/ }).click();
  await expect(page.getByText(/does not manage/i)).toBeVisible();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Student saved/i)).toBeVisible();
});

test("the planning board reflects remaining capacity", async ({ page }) => {
  await page.goto("/planning");
  await expect(page.getByText("Capacity per assessor")).toBeVisible();
  // Bo Jansen has a maximum of 1 and holds a student from the test above, so
  // the board shows them at their limit.
  await expect(page.getByRole("row", { name: /Bo Jansen/ })).toContainText(
    "1 / 1"
  );
});
