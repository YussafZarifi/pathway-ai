import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../../lib/api";

const auth = { enabled: true, loading: false, session: null, user: null };
vi.mock("../../lib/authContext", () => ({ useAuth: () => auth }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  Util: { transform: (_viewport, transform) => [1, 0, 0, 1, transform[4] || 30, transform[5] || 30] },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: async (pageNumber) => ({
        pageNumber,
        getViewport: () => ({ width: 600, height: 800, transform: [1, 0, 0, 1, 0, 800] }),
        render: () => ({ promise: Promise.resolve() }),
        getTextContent: async () => ({ items: [{ str: "Built an AI app", transform: [1, 0, 0, 1, 30, 30], width: 160 }] }),
      }),
    }),
  }),
}));

const api = {
  checkAvailability: vi.fn(),
  analyze: vi.fn(),
  listAnalyses: vi.fn(),
  deleteAnalysis: vi.fn(),
};
vi.mock("../../lib/resume", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    checkAvailability: (...a) => api.checkAvailability(...a),
    analyze: (...a) => api.analyze(...a),
    listAnalyses: (...a) => api.listAnalyses(...a),
    deleteAnalysis: (...a) => api.deleteAnalysis(...a),
  };
});

const { default: Resume } = await import("../Resume");
const { persistResumeFile, persistResumeSession, resetResumeSession, restoreResumeSession, resumeDemoSource, resumeSession } = await import("../../lib/resume/session");
const { normalizeAnalysis } = await import("../../lib/resume");

const AVAILABLE = { available: true, reason: null, career: "Data Analyst", roadmap_id: "r1" };
const ROW = {
  id: "a1",
  roadmap_id: "r1",
  career: "Data Analyst",
  created_at: "2026-10-07T12:00:00Z",
  analysis: {
    summary: "Solid SQL.",
    matched_skills: ["SQL"],
    missing_skills: ["Tableau"],
    strengths: [],
    gaps: [{ skill: "Tableau", why: "w", how_to_close: "h", related_step: 2 }],
    suggestions: [],
  },
};

function pdf(size = 4096, name = "jane-doe-cv.pdf", type = "application/pdf") {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function renderPage(initialEntry = "/resume") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Resume />
    </MemoryRouter>
  );
}

function signIn() {
  auth.enabled = true;
  auth.loading = false;
  auth.user = { id: "u1", email: "u1@example.test" };
}

async function chooseAndAnalyze(file = pdf()) {
  const input = await waitFor(() => {
    const el = document.querySelector("input[type=file]");
    if (!el) throw new Error("no input yet");
    return el;
  });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("Preview ready");
  fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));
}

beforeEach(() => {
  resetResumeSession();
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listAnalyses.mockResolvedValue([]);
  api.checkAvailability.mockResolvedValue(AVAILABLE);
  auth.enabled = true;
  auth.loading = false;
  auth.user = null;
  localStorage.clear();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,preview");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/resume access", () => {
  it("enables a demo PDF only with an explicit development flag", () => {
    expect(resumeDemoSource(false, "true", "/__resume-demo")).toBe("");
    expect(resumeDemoSource(true, "false", "/__resume-demo")).toBe("");
    expect(resumeDemoSource(true, "true", "")).toBe("");
    expect(resumeDemoSource(true, "true", "/__resume-demo")).toBe("/__resume-demo");
  });

  it("restores the PDF and analyzer position from this tab's session", async () => {
    signIn();
    const file = new File(["resume fixture"], "jane-doe-cv.pdf", { type: "application/pdf" });
    resumeSession.userId = auth.user.id;
    resumeSession.file = file;
    resumeSession.openId = "a1";
    resumeSession.analysis = normalizeAnalysis(ROW);
    resumeSession.selectedId = "rewrite-0";
    resumeSession.page = 2;
    resumeSession.scrollTop = 80;
    resumeSession.targetLevel = "internship";
    await persistResumeFile(file);
    persistResumeSession();

    const restored = restoreResumeSession();
    expect(restored.file.name).toBe("resume.pdf");
    expect(restored.file.size).toBe(file.size);
    expect(restored.userId).toBe(auth.user.id);
    expect(restored.openId).toBe("a1");
    expect(restored.analysis.summary).toBe("Solid SQL.");
    expect(restored.selectedId).toBe("rewrite-0");
    expect(restored.page).toBe(2);
    expect(restored.scrollTop).toBe(80);
    expect(restored.targetLevel).toBe("internship");
  });

  it("accounts off: honest state, nothing requested", () => {
    auth.enabled = false;
    renderPage();
    expect(screen.getByText("Resume Analyzer needs an account")).toBeTruthy();
    expect(document.querySelector("input[type=file]")).toBeNull();
    expect(api.checkAvailability).not.toHaveBeenCalled();
  });

  it("signed out: sign-in prompt, nothing requested", () => {
    renderPage();
    expect(screen.getByText("Sign in to review your résumé")).toBeTruthy();
    expect(document.querySelector("input[type=file]")).toBeNull();
    expect(api.checkAvailability).not.toHaveBeenCalled();
    expect(api.listAnalyses).not.toHaveBeenCalled();
  });
});

describe("/resume availability", () => {
  it("sends the selected target level when analyzing a preview", async () => {
    signIn();
    api.analyze.mockResolvedValue(ROW);
    renderPage();

    const input = await waitFor(() => {
      const element = document.querySelector("input[type=file]");
      if (!element) throw new Error("Upload input is not ready");
      return element;
    });
    fireEvent.change(input, { target: { files: [pdf()] } });
    await screen.findByText("Preview ready");
    const targetLevel = await screen.findByLabelText("Target level");
    fireEvent.change(targetLevel, { target: { value: "internship" } });
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    await waitFor(() => expect(api.analyze).toHaveBeenCalledWith(
      expect.any(File), expect.objectContaining({ targetLevel: "internship" })
    ));
  });

  it("feature disabled: no upload, history still shown", async () => {
    signIn();
    api.checkAvailability.mockResolvedValue({ available: false, reason: "feature_disabled", career: null, roadmap_id: null });
    api.listAnalyses.mockResolvedValue([normalizeAnalysis(ROW)]);
    renderPage();
    expect(await screen.findByText("Resume Analyzer isn't available yet")).toBeTruthy();
    expect(document.querySelector("input[type=file]")).toBeNull();
    expect(await screen.findByText("1 saved")).toBeTruthy();
  });

  it("no active roadmap: asks for one", async () => {
    signIn();
    api.checkAvailability.mockResolvedValue({ available: false, reason: "no_active_roadmap", career: null, roadmap_id: null });
    renderPage();
    expect(await screen.findByText("Create a roadmap first")).toBeTruthy();
    expect(document.querySelector("input[type=file]")).toBeNull();
  });

  it("availability failure: message and retry", async () => {
    signIn();
    api.checkAvailability.mockRejectedValueOnce(new ApiError("Please sign in again.", 401));
    renderPage();
    expect(await screen.findByText("Please sign in again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeTruthy();
  });

  it("times out a stalled availability request and offers retry", async () => {
    signIn();
    vi.useFakeTimers();
    let requestSignal;
    api.checkAvailability.mockImplementation(({ signal }) => {
      requestSignal = signal;
      return new Promise(() => {});
    });
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(screen.getByText("The availability check took too long. Check your connection and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(requestSignal.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("shows a retry state for a network error", async () => {
    signIn();
    api.checkAvailability.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderPage();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("We couldn't check whether");
    api.checkAvailability.mockResolvedValueOnce(AVAILABLE);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Review tailored to/)).toBeTruthy();
    expect(api.checkAvailability).toHaveBeenCalledTimes(2);
  });

  it("treats an expired session as sign-in required", async () => {
    signIn();
    api.checkAvailability.mockRejectedValueOnce(new ApiError("Please sign in again.", 401));
    renderPage();
    expect(await screen.findByText("Please sign in again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeTruthy();
    expect(document.querySelector("input[type=file]")).toBeNull();
  });

  it("recovers after an availability request is aborted during auth change", async () => {
    signIn();
    api.checkAvailability.mockImplementationOnce(({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const view = renderPage();
    await waitFor(() => expect(api.checkAvailability).toHaveBeenCalledTimes(1));
    auth.user = null;
    view.rerender(<MemoryRouter><Resume /></MemoryRouter>);
    expect(await screen.findByText(/Sign in to review your/)).toBeTruthy();
    signIn();
    api.checkAvailability.mockResolvedValueOnce(AVAILABLE);
    view.rerender(<MemoryRouter><Resume /></MemoryRouter>);
    expect(await screen.findByText(/Review tailored to/)).toBeTruthy();
  });

  it("ends an auth session check that never resolves", async () => {
    auth.enabled = true;
    auth.loading = true;
    vi.useFakeTimers();
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(screen.getByText("Sign-in check is taking too long")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry sign in" })).toBeTruthy();
    vi.useRealTimers();
  });

  it("available: shows the career and the privacy note", async () => {
    signIn();
    renderPage();
    expect(await screen.findByText("Data Analyst")).toBeTruthy();
    expect(screen.getByText(/Your original PDF stays in this browser tab's session, not on PathwayAI's servers/)).toBeTruthy();
    fireEvent.click(screen.getByText("Privacy and data use"));
    expect(screen.getByText(/Scores use verified evidence and your selected career rubric/)).toBeTruthy();
    expect(await screen.findByText(/No reviews yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload resume" })).toBeTruthy();
  });
});

describe("/resume upload", () => {
  it("auto-starts analysis from the dashboard action after restoring and rendering the existing PDF", async () => {
    signIn();
    api.analyze.mockResolvedValue(ROW);
    const file = pdf();
    resumeSession.userId = auth.user.id;
    resumeSession.file = file;
    renderPage({ pathname: "/resume", state: { autoAnalyze: true } });

    expect(await screen.findByText("Preview ready")).toBeTruthy();
    expect(await screen.findByText("Edit what matters")).toBeTruthy();
    expect(api.analyze).toHaveBeenCalledTimes(1);
    expect(api.analyze.mock.calls[0][0]).toBe(file);
  });

  it("rejects a non-PDF and an oversized file without uploading", async () => {
    signIn();
    renderPage();
    await screen.findByText("Data Analyst");
    const input = document.querySelector("input[type=file]");
    const message = () => document.getElementById("resumeUploadMessage")?.textContent || document.body.textContent;
    fireEvent.change(input, { target: { files: [pdf(4096, "notes.txt", "text/plain")] } });
    expect(message()).toContain("Please choose a PDF");
    expect(screen.getByRole("button", { name: /Analyze resume/ }).disabled).toBe(true);
    fireEvent.change(input, { target: { files: [pdf(3 * 1024 * 1024)] } });
    expect(message()).toContain("larger than 2 MB");
    expect(api.analyze).not.toHaveBeenCalled();
  });

  it("shows the chosen file name and size, supports removal, and gates Analyze", async () => {
    signIn();
    renderPage();
    await screen.findByText("Data Analyst");
    const analyzeButton = () => screen.getByRole("button", { name: /Analyze/ });
    expect(screen.getByRole("button", { name: /Analyze/ }).disabled).toBe(true);
    fireEvent.change(document.querySelector("input[type=file]"), { target: { files: [pdf(4096, "jane-doe-cv.pdf")] } });
    expect(screen.getByText("jane-doe-cv.pdf")).toBeTruthy();
    await screen.findByText("Preview ready");
    expect(analyzeButton().disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Choose another PDF" }));
    expect(screen.getByText("jane-doe-cv.pdf")).toBeTruthy();
  });

  it("renders one PDF page at a time with compact navigation", async () => {
    signIn();
    renderPage();
    await screen.findByText("Data Analyst");
    fireEvent.change(document.querySelector("input[type=file]"), { target: { files: [pdf()] } });
    expect(await screen.findByText("Page 1 of 3")).toBeTruthy();
    expect(document.querySelectorAll(".resumePdfPage")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Page 2 of 3")).toBeTruthy();
    expect(document.querySelectorAll(".resumePdfPage")).toHaveLength(1);
  });

  it("opens the native file picker from the prominent upload button", async () => {
    signIn();
    renderPage();
    await screen.findByText("Data Analyst");
    const input = document.querySelector("input[type=file]");
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Upload resume" }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("uploads, then shows the saved review expanded with a step link", async () => {
    signIn();
    api.analyze.mockResolvedValue(ROW);
    renderPage();
    await screen.findByText("Data Analyst");
    const file = pdf();
    await chooseAndAnalyze(file);
    expect(await screen.findByText("AI Resume Coach")).toBeTruthy();
    const workspaceInput = document.querySelector(".resumeReviewWorkspace input[type=file]");
    expect(workspaceInput.classList.contains("resumeWorkspaceFileInput")).toBe(true);
    expect(workspaceInput.classList.contains("resumeFileInput")).toBe(false);
    expect(api.analyze.mock.calls[0][0]).toBe(file);
    expect(screen.getByText("1 saved")).toBeTruthy();
  });

  it("shows three coach priorities and keeps supporting evidence collapsed", async () => {
    signIn();
    api.analyze.mockResolvedValue({
      ...ROW,
      analysis: {
        ...ROW.analysis,
        project_reviews: ["One", "Two", "Three", "Four"].map((title, index) => ({
          title: `Project ${title}`,
          summary: `Improve project ${title}.`,
          missing_checks: ["project_impact"],
          bullet_rewrite: { before: "Built an AI app", after: "Built and deployed an AI app", page: index + 1 },
        })),
      },
    });
    renderPage();
    await chooseAndAnalyze();

    expect(await screen.findByText("Top improvements")).toBeTruthy();
    expect(within(document.querySelector(".resumeTopIssueList")).getAllByRole("listitem")).toHaveLength(3);
    const priorityButtons = within(document.querySelector(".resumeTopIssueList")).getAllByRole("button");
    expect(priorityButtons[0].className).toContain("is-rank-1");
    expect(priorityButtons[1].className).toContain("is-rank-2");
    expect(priorityButtons[2].className).toContain("is-rank-3");
    expect(document.querySelector(".resumeCoachDetails").open).toBe(false);
    expect(document.querySelectorAll(".resumeTopIssueItem.is-selected")).toHaveLength(1);
    const activeIssue = document.querySelector(".resumeTopIssueItem.is-selected");
    expect(within(activeIssue).getByText("Problem")).toBeTruthy();
    expect(within(activeIssue).getByText("Why it matters")).toBeTruthy();
    expect(within(activeIssue).getByText("How to improve")).toBeTruthy();
    expect(within(activeIssue).getByText("Expected impact")).toBeTruthy();
    expect(screen.queryByText(/Next:/)).toBeNull();

    fireEvent.click(await screen.findByText("Supporting evidence and actions"));
    expect(screen.getByText("Current text")).toBeTruthy();
    fireEvent.click(priorityButtons[1]);
    expect(await screen.findByText("Page 2 of 3")).toBeTruthy();
  });

  it("gives the Resume Score visual priority over ATS and confidence", async () => {
    signIn();
    api.analyze.mockResolvedValue({
      ...ROW,
      analysis: {
        ...ROW.analysis,
        score_report: { display_overall: 78, ats: { display_score: 82 }, confidence: { level: "high", score: 90 }, categories: [] },
      },
    });
    renderPage();
    await chooseAndAnalyze();

    expect(await screen.findByLabelText("Resume score 78")).toBeTruthy();
    expect(screen.getByLabelText("Strong resume, score 78 out of 100")).toBeTruthy();
    expect(screen.getByLabelText("ATS score 82")).toBeTruthy();
    expect(screen.getByLabelText("high confidence, 90%")).toBeTruthy();
  });

  it("shows the curated guidance source behind grounded coaching", async () => {
    signIn();
    api.analyze.mockResolvedValue({
      ...ROW,
      analysis: { ...ROW.analysis, score_report: { overall: 70, categories: [] } },
      ai_coaching: { status: "available", items: [{
        criterion_id: "project_impact", title: "Show the project outcome", problem: "No result is shown.",
        why_it_matters: "Reviewers need an outcome.", improve_by: "Add the observed result.",
        expected_impact: "Makes the project easier to assess.", suggested_rewrite: null,
        resume_citations: [{ page: 1, quote: "Built an AI app" }],
        guidance_citations: [{ id: "guide", title: "Project outcome bullets" }], confidence: "high",
      }] },
    });
    renderPage();
    await chooseAndAnalyze();

    fireEvent.click(await screen.findByText("Supporting evidence and actions"));
    expect(screen.getByText(/PathwayAI searched its resume-writing guidance/)).toBeTruthy();
    expect(screen.getByText(/Project outcome bullets/)).toBeTruthy();
    expect(screen.getByText("Makes the project easier to assess.")).toBeTruthy();
  });

  it("restores the analyzed PDF, feedback, highlight, page, and scroll after auth bootstrap remount", async () => {
    signIn();
    api.analyze.mockResolvedValue({
      ...ROW,
      analysis: {
        ...ROW.analysis,
        project_reviews: [{
          title: "Portfolio app",
          summary: "Show the project outcome.",
          missing_checks: ["project_impact"],
          bullet_rewrite: { before: "Built an AI app", after: "Built and deployed an AI app", page: 2 },
        }],
      },
    });
    const first = renderPage();
    await screen.findByText("Data Analyst");
    await chooseAndAnalyze();
    expect((await screen.findAllByText("A measurable project outcome is missing.")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Page 2 of 3")).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".resumePdfHighlight")).toBeTruthy());
    const viewport = document.querySelector(".resumePdfPageViewport");
    viewport.scrollTop = 80;
    fireEvent.scroll(viewport);
    first.unmount();

    auth.user = null;
    auth.loading = true;
    const second = renderPage();
    expect(await screen.findByText(/Loading/)).toBeTruthy();
    auth.user = { id: "u1", email: "u1@example.test" };
    auth.loading = false;
    second.rerender(<MemoryRouter><Resume /></MemoryRouter>);

    expect((await screen.findAllByText("A measurable project outcome is missing.")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Page 2 of 3")).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".resumePdfHighlight")).toBeTruthy());
    await waitFor(() => expect(document.querySelector(".resumePdfPageViewport").scrollTop).toBe(80));
    expect(screen.getByRole("button", { name: "Upload New Resume" })).toBeTruthy();
    expect(api.analyze).toHaveBeenCalledTimes(1);
  });

  it("accepts a dropped PDF and displays upload progress", async () => {
    signIn();
    let completeUpload;
    api.analyze.mockImplementation((_file, { onUploadProgress }) => new Promise((resolve) => {
      completeUpload = resolve;
      onUploadProgress({ phase: "uploading", percent: 47 });
    }));
    renderPage();
    await screen.findByText("Data Analyst");
    const file = pdf();
    fireEvent.drop(document.querySelector(".resumeDrop"), { dataTransfer: { files: [file] } });
    await screen.findByText("Preview ready");
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));
    expect(await screen.findByText("47%")).toBeTruthy();
    completeUpload(ROW);
    expect(await screen.findByText("AI Resume Coach")).toBeTruthy();
  });

  it("shows the selected file name locally but never stores or logs it", async () => {
    signIn();
    api.analyze.mockResolvedValue(ROW);
    const log = vi.spyOn(console, "log");
    const err = vi.spyOn(console, "error");
    const { container } = renderPage();
    await screen.findByText("Data Analyst");
    fireEvent.change(document.querySelector("input[type=file]"), { target: { files: [pdf(4096, "jane-doe-cv.pdf")] } });
    expect(container.textContent).toContain("jane-doe-cv.pdf");
    expect(JSON.stringify({ ...localStorage })).not.toContain("jane-doe");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("jane-doe");
    expect([...log.mock.calls, ...err.mock.calls].flat().join(" ")).not.toContain("jane-doe");
  });

  it.each([
    [413, "Your PDF is larger than 2 MB. Please upload a smaller file."],
    [415, "Please upload your résumé as a PDF file."],
    [422, "This file isn't a valid PDF."],
    [429, "You've analyzed several résumés in the last hour. Please try again later."],
  ])("%i shows the server's message", async (status, message) => {
    signIn();
    api.analyze.mockRejectedValue(new ApiError(message, status));
    renderPage();
    await screen.findByText("Data Analyst");
    await chooseAndAnalyze();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(api.checkAvailability).toHaveBeenCalledTimes(1);
  });

  it("502 (invalid AI output) shows the backend's safe message", async () => {
    signIn();
    api.analyze.mockRejectedValue(new ApiError("The AI couldn't format your résumé review. Please try again.", 502));
    renderPage();
    await screen.findByText("Data Analyst");
    await chooseAndAnalyze();
    expect(await screen.findByText("The AI couldn't format your résumé review. Please try again.")).toBeTruthy();
    expect(screen.queryByText("internal detail")).toBeNull();
  });

  it.each([
    [503, "Résumé analysis isn't available yet.", { available: false, reason: "feature_disabled" }, "Resume Analyzer isn't available yet"],
    [409, "Create a roadmap first.", { available: false, reason: "no_active_roadmap" }, "Create a roadmap first"],
  ])("%i re-checks availability and follows the new state", async (status, message, next, heading) => {
    signIn();
    api.analyze.mockRejectedValue(new ApiError(message, status));
    renderPage();
    await screen.findByText("Data Analyst");
    api.checkAvailability.mockResolvedValue({ career: null, roadmap_id: null, ...next });
    await chooseAndAnalyze();
    expect(await screen.findByText(heading)).toBeTruthy();
    expect(api.checkAvailability).toHaveBeenCalledTimes(2);
    expect(document.querySelector("input[type=file]")).toBeNull();
  });
});

describe("/resume history", () => {
  it("times out a stalled history request and offers retry", async () => {
    signIn();
    vi.useFakeTimers();
    api.listAnalyses.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(screen.getByText("Loading your saved reviews took too long. Check your connection and try again.")).toBeTruthy();
    api.listAnalyses.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("No reviews yet")).toBeTruthy();
  });

  it("shows a load error with retry", async () => {
    signIn();
    api.listAnalyses.mockRejectedValueOnce(new ApiError("We couldn't load your previous reviews. Please try again.", 503));
    renderPage();
    expect(await screen.findByText("We couldn't load your previous reviews. Please try again.")).toBeTruthy();
    api.listAnalyses.mockResolvedValue([normalizeAnalysis(ROW)]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1 saved")).toBeTruthy();
  });

  it("deletes a review only after confirmation", async () => {
    signIn();
    api.listAnalyses.mockResolvedValue([normalizeAnalysis(ROW)]);
    api.deleteAnalysis.mockResolvedValue();
    renderPage();
    await screen.findByText("1 saved");
    fireEvent.click(screen.getByRole("button", { name: /Delete the review/ }));
    const dialog = document.querySelector("dialog");
    expect(dialog.open).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.deleteAnalysis).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Delete the review/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteAnalysis).toHaveBeenCalledWith("a1"));
    expect(await screen.findByText(/No reviews yet/)).toBeTruthy();
  });

  it("keeps the review and explains when deleting fails", async () => {
    signIn();
    api.listAnalyses.mockResolvedValue([normalizeAnalysis(ROW)]);
    api.deleteAnalysis.mockRejectedValue(new ApiError("We couldn't delete that review. Please try again.", 503));
    renderPage();
    await screen.findByText("1 saved");
    fireEvent.click(screen.getByRole("button", { name: /Delete the review/ }));
    fireEvent.click(within(document.querySelector("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("We couldn't delete that review. Please try again.")).toBeTruthy();
    expect(screen.getByText("1 saved")).toBeTruthy();
  });
});
