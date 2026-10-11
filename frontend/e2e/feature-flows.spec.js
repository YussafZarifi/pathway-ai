import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

const user = {
  id: "aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@example.test",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

function sessionToken() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.e2e`;
}

async function signedInPage(page) {
  const token = sessionToken();
  await page.route("http://127.0.0.1:9999/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/token")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: token, token_type: "bearer", expires_in: 3600,
          refresh_token: "e2e-refresh-token", user }),
      });
      return;
    }
    if (url.pathname.includes("resume_analyses") || url.pathname.includes("coach_threads") || url.pathname.includes("coach_messages")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("http://127.0.0.1:8003/api/resume-analyses/availability", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: true, reason: null, career: "Software Engineer Intern", roadmap_id: "r1" }),
  }));
  await page.route("http://127.0.0.1:8003/api/coach/availability", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: true, reason: null }),
  }));

  // Sign in through the real form and SDK, with only the auth server stubbed.
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("e2e-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page).toHaveURL(/\/home$/);
}

test("Resume upload interaction and Coach navigation survive reload and browser history", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await signedInPage(page);

  await page.goto("/resume");
  await expect(page.getByRole("heading", { name: /Build a stronger/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload Resume (PDF)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Analyze résumé/ })).toBeDisabled();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".resume-playwright-artifacts/resume-upload-before-selection.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".resume-playwright-artifacts/resume-upload-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const pdfBytes = Buffer.from(`%PDF-1.4\n${"synthetic fixture text ".repeat(100)}\n%%EOF`);
  await page.locator("input[type=file]").setInputFiles({
    name: "synthetic-resume.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes,
  });
  await expect(page.getByText("synthetic-resume.pdf")).toBeVisible();
  await expect(page.getByText(/3 KB/)).toBeVisible();
  await page.screenshot({ path: ".resume-playwright-artifacts/resume-selected-file.png", fullPage: true });
  await expect(page.getByRole("button", { name: /Analyze résumé/ })).toBeEnabled();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: /Analyze résumé/ })).toBeDisabled();
  await page.locator("input[type=file]").setInputFiles({
    name: "synthetic-resume.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes,
  });

  await page.route("http://127.0.0.1:8003/api/resume-analyses", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataBuffer()?.subarray(0, 5).toString()).toBe("%PDF-");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "analysis-1",
        roadmap_id: "r1",
        career: "Software Engineer Intern",
        created_at: new Date().toISOString(),
        analysis: {
          summary: "Synthetic fixture report.", matched_skills: ["Python"], missing_skills: ["Testing"],
          strengths: [], gaps: [], suggestions: [],
          score_report: {
            status: "scored",
            overall: 72,
            ats: { score: 80, earned: 4, weight: 5 },
            readiness: { internship: 72, junior: 65, mid_level: 42 },
            confidence: { level: "high", reason: "Synthetic report fixture." },
            rubric: { family: "software_engineering", label: "Software Engineering" },
            categories: [
              { id: "skills", label: "Relevant technical skills", weight: 30, earned: 20, score: 67, criteria: [
                { id: "python", label: "Python", found: true, max_points: 10, points: 10, evidence: [{ quote: "Used Python", page: 1 }], note: "" },
                { id: "testing", label: "Unit testing", found: false, max_points: 10, points: 0, evidence: [], note: "No testing detail listed." },
              ] },
              { id: "projects", label: "Projects", weight: 20, earned: 10, score: 50, criteria: [
                { id: "project", label: "Portfolio project", found: true, max_points: 10, points: 10, evidence: [{ quote: "Built a portfolio project", page: 1 }], note: "" },
                { id: "deployment", label: "Deployment", found: false, max_points: 10, points: 0, evidence: [], note: "No public deployment was listed." },
              ] },
            ],
            recommendations: [{ title: "Add unit tests", action: "Show a tested project.", potential_points: 10 }],
            roadmap: { steps: [{ position: 1, title: "Python", status: "in_progress" }], skills: [{ skill: "Python", found: true, evidence: [], roadmap_steps: [1] }] },
          },
        },
      }),
    });
  });
  await page.getByRole("button", { name: /Analyze résumé/ }).click();
  await expect(page.getByText("Synthetic fixture report.")).toBeVisible();
  await expect(page.getByText("Resume evidence score")).toBeVisible();
  await page.screenshot({ path: ".resume-playwright-artifacts/resume-analysis-result.png", fullPage: true });
  await expect(page.getByRole("button", { name: /Upload Resume \(PDF\)/ })).toBeVisible();

  await page.getByRole("link", { name: /Coach/ }).click();
  await expect(page).toHaveURL(/\/coach$/);
  await expect(page.getByRole("heading", { name: "Your next move, made clearer" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".resume-playwright-artifacts/coach-workspace.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your next move, made clearer" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/resume$/);
  await expect(page.getByRole("heading", { name: "Resume Analyzer", level: 1 })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/coach$/);
  await expect(page.getByRole("heading", { name: "AI Coach", level: 1 })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("sparse PDF upload renders a no-score warning instead of a zero-point gauge", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await signedInPage(page);
  await page.goto("/resume");
  await expect(page.getByRole("heading", { name: /Build a stronger/ })).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "synthetic-brief-profile.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(`%PDF-1.4\n${"brief profile ".repeat(180)}\n%%EOF`),
  });
  await page.route("http://127.0.0.1:8003/api/resume-analyses", (route) => route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({
      id: "analysis-sparse", roadmap_id: "r1", career: "Software Engineer Intern",
      created_at: new Date().toISOString(),
      analysis: {
        summary: "Unable to score reliably: this PDF contains too little readable résumé content.",
        matched_skills: [], missing_skills: ["Python"], strengths: [], gaps: [], suggestions: [],
        score_report: {
          status: "insufficient_evidence", overall: 0, ats: { score: 0 },
          readiness: { internship: 0, junior: 0, mid_level: 0 },
          confidence: { level: "very_low", score: 5, reason: "There is not enough source evidence." },
          rubric: { family: "software_engineering", label: "Software engineering" },
          insufficient_reasons: ["The PDF contains too little readable résumé text for a reliable review."],
          recommendations: [],
          categories: [{ id: "skills", label: "Relevant technical skills", weight: 30, earned: 0, score: 0,
            criteria: [{ id: "skill_1", label: "Python", found: false, max_points: 30, points: 0, evidence: [], note: "Not enough readable text." }] }],
          roadmap: { steps: [], skills: [] },
        },
      },
    }),
  }));
  await page.getByRole("button", { name: /Analyze/ }).click();
  await expect(page.getByRole("heading", { name: "Not enough content to score reliably" })).toBeVisible();
  await expect(page.getByText("Not scored")).toBeVisible();
  await expect(page.getByText("very low confidence")).toBeVisible();
  await expect(page.getByRole("img", { name: /Resume evidence score: 0 out of 100/ })).toHaveCount(0);
  await expect(page.locator(".resumeMoreDetails")).not.toHaveAttribute("open", "");
  expect(browserErrors).toEqual([]);
});
