import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../../lib/api";

const auth = { enabled: true, loading: false, session: null, user: null };
vi.mock("../../lib/authContext", () => ({ useAuth: () => auth }));

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

function renderPage() {
  return render(
    <MemoryRouter>
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
  fireEvent.click(screen.getByRole("button", { name: /Analyze resume/ }));
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listAnalyses.mockResolvedValue([]);
  api.checkAvailability.mockResolvedValue(AVAILABLE);
  auth.enabled = true;
  auth.loading = false;
  auth.user = null;
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/resume access", () => {
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
    expect(screen.getByText(/does not store the original PDF, its full text or its name/)).toBeTruthy();
    fireEvent.click(screen.getByText("Privacy and data use"));
    expect(screen.getByText(/Scores use verified evidence and your selected career rubric/)).toBeTruthy();
    expect(await screen.findByText(/No reviews yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload resume" })).toBeTruthy();
  });
});

describe("/resume upload", () => {
  it("rejects a non-PDF and an oversized file without uploading", async () => {
    signIn();
    renderPage();
    await screen.findByText("Data Analyst");
    const input = document.querySelector("input[type=file]");
    const message = () => document.getElementById("resumeUploadMessage").textContent;
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
    const analyzeButton = document.querySelector(".resumeSubmit");
    expect(analyzeButton.disabled).toBe(true);
    fireEvent.change(document.querySelector("input[type=file]"), { target: { files: [pdf(4096, "jane-doe-cv.pdf")] } });
    expect(screen.getByText("jane-doe-cv.pdf")).toBeTruthy();
    expect(screen.getByText(/4 KB/)).toBeTruthy();
    expect(analyzeButton.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("jane-doe-cv.pdf")).toBeNull();
    expect(analyzeButton.disabled).toBe(true);
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
    expect(await screen.findByText("Solid SQL.")).toBeTruthy();
    expect(api.analyze.mock.calls[0][0]).toBe(file);
    expect(screen.getByRole("link", { name: "Roadmap step 2" }).getAttribute("href")).toBe("/dashboard#step-2");
    expect(screen.getByText("1 saved")).toBeTruthy();
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
    expect(screen.getByText("PDF ready to review")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));
    expect(await screen.findByText("47%")).toBeTruthy();
    completeUpload(ROW);
    expect(await screen.findByText("Solid SQL.")).toBeTruthy();
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

  it("502 (Gemini failure) shows the page's own message", async () => {
    signIn();
    api.analyze.mockRejectedValue(new ApiError("internal detail", 502));
    renderPage();
    await screen.findByText("Data Analyst");
    await chooseAndAnalyze();
    expect(await screen.findByText("We couldn't analyze your résumé right now. Please try again.")).toBeTruthy();
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
