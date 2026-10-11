import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const screenshotDir = ".resume-playwright-artifacts";

test.beforeEach(async () => {
  await mkdir(screenshotDir, { recursive: true });
});

test("Resume Analyzer signed-out state is visible and has no browser errors", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/resume");
  await expect(page.getByRole("heading", { name: "Resume Analyzer", level: 1 })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/Sign in to review your résumé|Resume Analyzer needs an account/);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${screenshotDir}/resume-after-desktop.png`, fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test("Resume Analyzer fits a mobile viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/resume");
  await expect(page.getByRole("heading", { name: "Resume Analyzer", level: 1 })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/Sign in to review your résumé|Resume Analyzer needs an account/);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${screenshotDir}/resume-after-mobile.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("sign-in navigation returns to Resume with browser Back and reload", async ({ page }) => {
  await page.goto("/resume");
  const signIn = page.getByRole("main").getByRole("button", { name: "Sign in" });
  test.skip(!(await signIn.isVisible().catch(() => false)), "The sign-in route is unavailable when accounts are off.");
  await signIn.click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/resume$/);
  await expect(page.getByRole("heading", { name: "Resume Analyzer", level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Resume Analyzer", level: 1 })).toBeVisible();
});
