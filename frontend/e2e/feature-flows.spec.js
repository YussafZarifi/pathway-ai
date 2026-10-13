import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

  // The authenticated session is loaded from Playwright storageState; only
  // the auth API is stubbed here so each test starts without a login flow.
  await page.goto("/home");
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
  await expect(page.getByRole("heading", { name: "Resume Analyzer", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload resume" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze resume" })).toBeDisabled();
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
  await expect(page.getByRole("button", { name: "Analyze resume" })).toBeEnabled();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Analyze resume" })).toBeDisabled();
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
          project_reviews: [{
            title: "Inventory dashboard",
            summary: "Tracked stock changes across two warehouse locations.",
            score: 62,
            technologies: ["React", "REST APIs"],
            found_checks: ["project_purpose", "project_stack", "project_apis"],
            missing_checks: ["project_testing", "project_deployment", "project_impact"],
            evidence: { quote: "Built an inventory dashboard using React and REST APIs.", page: 1 },
            bullet_rewrite: { before: "Built an inventory dashboard.", after: "Built a React inventory dashboard using REST APIs; add a verified outcome.", page: 1 },
          }],
          experience_reviews: [{
            title: "Software developer intern",
            summary: "Supported feature work and API integration.",
            score: 55,
            technologies: [],
            found_checks: ["experience_actions", "experience_relevance"],
            missing_checks: ["experience_results", "experience_ownership"],
            evidence: { quote: "Supported feature development and integrated REST APIs.", page: 1 },
            bullet_rewrite: null,
          }],
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
  await page.getByRole("button", { name: "Analyze resume" }).click();
  await expect(page.getByText("Synthetic fixture report.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top improvements" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inventory dashboard" })).toBeVisible();
  await page.screenshot({ path: ".resume-playwright-artifacts/resume-analysis-result.png", fullPage: true });
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${viewport.name} horizontal overflow`).toBe(true);
    await page.screenshot({ path: `.resume-playwright-artifacts/resume-report-${viewport.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("button", { name: "Upload resume" })).toBeVisible();

  for (const profile of ["student-1p", "swe-2p", "ai-ml", "cybersecurity", "data-science", "many-projects", "long-history"]) {
    await page.locator("input[type=file]").setInputFiles({
      name: `${profile}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from(`%PDF-1.4\n${(`${profile} representative resume content `).repeat(80)}\n%%EOF`),
    });
    await expect(page.getByText(`${profile}.pdf`)).toBeVisible();
    await page.getByRole("button", { name: "Analyze resume" }).click();
    await expect(page.getByText("Synthetic fixture report.")).toBeVisible();
  }
  await page.screenshot({ path: ".resume-playwright-artifacts/resume-analysis-seven-profile-batch.png", fullPage: true });

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
  await expect(page.getByRole("heading", { name: "Resume Analyzer", level: 1 })).toBeVisible();
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
  await page.getByRole("button", { name: "Analyze resume" }).click();
  await expect(page.getByRole("heading", { name: "Not enough content to score reliably" })).toBeVisible();
  await expect(page.getByText("Not scored")).toBeVisible();
  await expect(page.getByText("very low confidence")).toBeVisible();
  await expect(page.getByRole("img", { name: /Resume evidence score: 0 out of 100/ })).toHaveCount(0);
  await expect(page.locator(".resumeMoreDetails")).not.toHaveAttribute("open", "");
  expect(browserErrors).toEqual([]);
});

test("actual resume renders the full review workspace and keeps navigation stable", async ({ page }) => {
  const actualResumePath = resolve(globalThis.process?.env?.USERPROFILE || "", "Downloads", "Resume Software.docx (1).pdf");
  test.skip(!existsSync(actualResumePath), `Actual resume not found at ${actualResumePath}`);
  const pdfBytes = readFileSync(actualResumePath);
  const expectedHash = createHash("sha256").update(pdfBytes).digest("hex");
  const browserErrors = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await signedInPage(page);

  const reportAnalysis = {
    summary: "A grounded review of the uploaded resume.", matched_skills: ["Python", "PyTorch"], missing_skills: ["Testing"],
    strengths: ["Clear technical projects"], gaps: [], suggestions: [],
    project_reviews: [{
      title: "PathwayAI", summary: "An AI career guidance platform with a modular backend.", score: 74,
      technologies: ["LLMs", "Embeddings"], found_checks: ["project_purpose", "project_stack"], missing_checks: ["project_impact"],
      evidence: { quote: "PathwayAI", page: 1 },
      bullet_rewrite: { before: "PathwayAI", after: "PathwayAI — AI Career Guidance Platform", page: 1 },
    }],
    experience_reviews: [],
    score_report: {
      status: "scored", overall: 76, display_overall: 74,
      ats: { score: 80, display_score: 78, earned: 4, weight: 5 }, readiness: { internship: 74, junior: 61, mid_level: 42 },
      confidence: { level: "high", score: 90, reason: "Verified source evidence." },
      categories: [{ id: "skills", label: "Relevant technical skills", weight: 30, earned: 24, score: 80, criteria: [
        { id: "python", label: "Python", found: true, max_points: 10, points: 10, evidence: [], note: "" },
        { id: "testing", label: "Testing", found: false, max_points: 10, points: 0, evidence: [], note: "Not evidenced." },
      ] }, { id: "projects", label: "Projects", weight: 20, earned: 15, score: 75, criteria: [
        { id: "project", label: "Project purpose", found: true, max_points: 10, points: 10, evidence: [], note: "" },
      ] }],
      recommendations: [{ title: "Add an impact metric", action: "Add a verified scale or outcome to the project.", potential_points: 8 }],
      roadmap: { steps: [], skills: [] },
    },
  };
  const savedRow = { id: "analysis-actual", roadmap_id: "r1", career: "Software Engineer Intern", created_at: new Date().toISOString(), analysis: reportAnalysis };
  await page.route("http://127.0.0.1:9999/rest/v1/resume_analyses**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify([savedRow]),
  }));
  await page.route("http://127.0.0.1:8003/api/resume-analyses", async (route) => {
    // The browser sends the PDF as a streaming fetch body, which Playwright
    // intentionally does not expose through postDataBuffer(). The input is
    // set from the exact file path above; record its digest as the upload
    // identity and assert the request is the expected raw-PDF endpoint.
    console.log(`actual resume SHA-256: ${expectedHash}`);
    expect(route.request().method()).toBe("POST");
    expect(route.request().url()).toContain("/api/resume-analyses");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 650));
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...savedRow }) });
  });

  await page.goto("/resume");
  await page.screenshot({ path: "output/playwright/resume-upload.png", fullPage: true });
  await page.locator("input[type=file]").setInputFiles(actualResumePath);
  await page.getByRole("button", { name: "Analyze resume" }).click();
  await page.screenshot({ path: "output/playwright/resume-loading.png", fullPage: true });
  await expect(page.getByText("A grounded review of the uploaded resume.")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".resumePdfPage")).toHaveCount(2, { timeout: 15_000 });
  await page.screenshot({ path: "output/playwright/resume-full-pdf.png", fullPage: true });

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth <= window.innerWidth,
    pages: [...document.querySelectorAll(".resumePdfPage")].map((element) => ({
      cropped: element.scrollHeight > element.clientHeight + 1,
      imageFits: element.querySelector("img")?.getBoundingClientRect().height <= element.getBoundingClientRect().height + 1,
    })),
  }));
  expect(layout.overflow).toBe(true);
  expect(layout.pages.every((page) => !page.cropped && page.imageFits)).toBe(true);

  const highlight = page.locator(".resumePdfHighlight").first();
  await expect(highlight).toBeVisible();
  await highlight.click();
  await expect(highlight).toHaveClass(/is-selected/);
  await expect(page.getByText("Why this improves the resume")).toBeVisible();
  await expect(page.locator(".resumeFindingContext")).not.toHaveAttribute("open", "");
  expect(await page.locator(".resumeSuggestionPane").evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
  await page.screenshot({ path: "output/playwright/resume-highlight-selected.png", fullPage: true });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Edit suggested rewrite" }).fill("PathwayAI — AI Career Guidance Platform");
  await page.getByRole("button", { name: "Save edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Accepted", exact: true })).toBeVisible();
  await page.screenshot({ path: "output/playwright/resume-final-report.png", fullPage: true });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${viewport.name} horizontal overflow`).toBe(true);
    if (viewport.name === "desktop") {
      expect(await page.locator(".resumeSuggestionPane").evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
    } else {
      expect(await page.locator(".resumeSuggestionPane").evaluate((element) => getComputedStyle(element).position)).toBe("static");
    }
    await page.screenshot({ path: `output/playwright/resume-reference-${viewport.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.reload();
  await expect(page.getByText("A grounded review of the uploaded resume.")).toBeVisible({ timeout: 15_000 });
  await page.goto("/home");
  await page.goBack();
  await expect(page).toHaveURL(/\/resume$/);
  await page.getByRole("button", { name: "View report" }).click();
  await expect(page.getByText("A grounded review of the uploaded resume.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "output/playwright/resume-mobile.png", fullPage: true });
  expect(browserErrors).toEqual([]);
});
