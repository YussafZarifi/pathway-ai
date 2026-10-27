import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";

const user = {
  id: "aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@example.test",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const syntheticResume = resolve("..", "backend", "tests", "fixtures", "resume_benchmarks", "cases", "multi_page_resume", "resume.pdf");

function sessionToken() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.e2e`;
}

async function signedInPage(page) {
  const token = sessionToken();
  await page.route("http://127.0.0.1:9999/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/token")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: token, token_type: "bearer", expires_in: 3600, refresh_token: "e2e-refresh-token", user }) });
      return;
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("http://127.0.0.1:8003/api/resume-analyses/availability", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ available: true, reason: null, career: "Data Analyst", roadmap_id: "r1" }),
  }));
  await page.goto("/home");
}

function analysisResponse() {
  return {
    id: "analysis-synthetic", roadmap_id: "r1", career: "Data Analyst", created_at: new Date().toISOString(),
    analysis: {
      summary: "Synthetic fixture analysis.", matched_skills: ["SQL"], missing_skills: [], strengths: [], gaps: [], suggestions: [],
      project_reviews: [], experience_reviews: [],
      score_report: {
        status: "scored", overall: 76, display_overall: 76,
        ats: { score: 80, display_score: 80 }, readiness: { internship: 74, junior: 68, mid_level: 42 },
        confidence: { level: "high", reason: "Synthetic fixture." }, categories: [], recommendations: [], roadmap: { steps: [], skills: [] },
      },
    },
    ai_coaching: { status: "available", items: [{
      criterion_id: "project_impact", title: "Show the project outcome", problem: "The outcome is not explicit.",
      why_it_matters: "Reviewers need a result.", improve_by: "Add the observed reporting result.",
      expected_impact: "Makes the project easier to assess.", suggested_rewrite: null,
      resume_citations: [{ page: 2, quote: "Built a SQL dashboard that improved weekly reporting accuracy by 20%." }],
      guidance_citations: [{ id: "guidance-project-outcome", title: "Project outcome bullets" }], confidence: "high",
    }] },
  };
}

test("synthetic multi-page resume stays in the focused review workspace", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await signedInPage(page);
  await page.route("http://127.0.0.1:8003/api/resume-analyses", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(analysisResponse()) });
  });

  await page.goto("/resume");
  await page.locator("input[type=file]").setInputFiles(syntheticResume);
  await expect(page.getByText("Preview ready")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Analyze résumé/ })).toBeEnabled();
  await page.getByRole("button", { name: /Analyze résumé/ }).click();

  await expect(page.getByRole("button", { name: /Problem: The outcome is not explicit/ })).toBeVisible();
  await expect(page.locator(".resumePdfPage")).toHaveCount(1);
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await page.getByText("Supporting evidence and actions").click();
  await expect(page.getByText(/PathwayAI searched its resume-writing guidance/)).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("coach improvements stay reachable in the fixed review workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await signedInPage(page);
  const response = analysisResponse();
  response.ai_coaching.items = Array.from({ length: 3 }, (_, index) => ({
    ...response.ai_coaching.items[0],
    criterion_id: `project_impact_${index}`,
    title: `Priority improvement ${index + 1}`,
    problem: "The project outcome is not explicit enough for a recruiter to verify the result.",
    why_it_matters: "A concrete outcome helps a recruiter understand the value and scope of the work.",
    improve_by: "Add the verified result, scale, and the action that produced it.",
    expected_impact: "Makes the project easier to assess against the role rubric.",
    suggested_rewrite: "Built a reporting workflow that reduced manual weekly updates and gave the team a reliable view of progress.",
    resume_citations: [{ page: 1, quote: "Built a SQL dashboard that improved weekly reporting accuracy by 20%." }],
  }));
  await page.route("http://127.0.0.1:8003/api/resume-analyses", (route) => route.fulfill({
    status: 201, contentType: "application/json", body: JSON.stringify(response),
  }));

  await page.goto("/resume");
  await page.locator("input[type=file]").setInputFiles(syntheticResume);
  await expect(page.getByText("Preview ready")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Analyze/ }).click();

  const sizing = await page.locator(".resumeSuggestionPane").evaluate((coach) => {
    const workspace = coach.closest(".resumeReviewWorkspace");
    return {
      coachHeight: coach.getBoundingClientRect().height,
      workspaceHeight: workspace.getBoundingClientRect().height,
      clientHeight: coach.clientHeight,
      scrollHeight: coach.scrollHeight,
      scrollTop: (coach.scrollTop = coach.scrollHeight),
    };
  });
  expect(sizing.coachHeight).toBeLessThanOrEqual(sizing.workspaceHeight);
  expect(sizing.scrollHeight).toBeGreaterThan(sizing.clientHeight);
  expect(sizing.scrollTop).toBeGreaterThan(0);
});
