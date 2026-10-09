import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  analyzeResume,
  errorMessage,
  getResumeAvailability,
  normalizeSteps,
  requestCareers,
} from "../api";

function respond(status, body) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("posts JSON to VITE_API_URL without a token for guests", async () => {
    const fetch = respond(200, { careers: [{ title: "X" }], explanation: "e" });
    vi.stubGlobal("fetch", fetch);
    const data = await requestCareers({ goal: "x" });
    expect(data.careers).toHaveLength(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://api.test/api/ai/career");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ answers: { goal: "x" } });
  });

  it("turns error responses into ApiError with the server's message", async () => {
    vi.stubGlobal("fetch", respond(429, { detail: "Too many requests." }));
    await expect(requestCareers({})).rejects.toMatchObject({ name: "ApiError", status: 429, message: "Too many requests." });
  });

  it("uses a generic message when the server sends none", async () => {
    vi.stubGlobal("fetch", respond(500, null));
    await expect(requestCareers({})).rejects.toMatchObject({ status: 500, message: "Something went wrong. Please try again." });
  });

  it("reports network failures as status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(requestCareers({})).rejects.toMatchObject({ status: 0 });
  });
});

describe("résumé calls", () => {
  it("availability is a GET with the bearer token and no body", async () => {
    const fetch = respond(200, { available: true, reason: null, career: "X", roadmap_id: "r" });
    vi.stubGlobal("fetch", fetch);
    await getResumeAvailability("tok");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://api.test/api/resume-analyses/availability");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("uploads only the file's bytes as application/pdf", async () => {
    const fetch = respond(201, { id: "1" });
    vi.stubGlobal("fetch", fetch);
    const file = new File(["%PDF-1.4"], "jane-doe-cv.pdf", { type: "application/pdf" });
    await analyzeResume("tok", file);
    const [, init] = fetch.mock.calls[0];
    expect(init.body).toBe(file);
    expect(init.headers).toEqual({ "Content-Type": "application/pdf", Authorization: "Bearer tok" });
    expect(JSON.stringify(init.headers)).not.toContain("jane-doe");
  });

  it("reports real upload progress while keeping the raw PDF request", async () => {
    let lastRequest;
    class ProgressRequest {
      constructor() {
        lastRequest = this;
        this.uploadListeners = {};
        this.upload = { addEventListener: (name, callback) => { this.uploadListeners[name] = callback; } };
      }
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn((body) => {
        this.body = body;
        this.status = 201;
        this.responseText = JSON.stringify({ id: "saved" });
        this.uploadListeners.progress({ lengthComputable: true, loaded: 25, total: 100 });
        this.uploadListeners.load();
        this.onload();
      });
    }
    const onUploadProgress = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("XMLHttpRequest", ProgressRequest);
    vi.stubGlobal("fetch", fetch);
    const file = new File(["%PDF-1.4"], "private-name.pdf", { type: "application/pdf" });

    await expect(analyzeResume("tok", file, { onUploadProgress })).resolves.toEqual({ id: "saved" });

    expect(lastRequest.open).toHaveBeenCalledWith("POST", "http://api.test/api/resume-analyses");
    expect(lastRequest.body).toBe(file);
    expect(lastRequest.setRequestHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(lastRequest.setRequestHeader).toHaveBeenCalledWith("Authorization", "Bearer tok");
    expect(onUploadProgress).toHaveBeenNthCalledWith(1, { phase: "uploading", percent: 25 });
    expect(onUploadProgress).toHaveBeenNthCalledWith(2, { phase: "reviewing", percent: 100 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("errorMessage", () => {
  it("shows specific messages for client errors, 503 and network failures", () => {
    expect(errorMessage(new ApiError("Too big", 413), "fallback")).toBe("Too big");
    expect(errorMessage(new ApiError("Busy", 503), "fallback")).toBe("Busy");
    expect(errorMessage(new ApiError("Offline", 0), "fallback")).toBe("Offline");
  });

  it("uses the page's fallback for server errors and unknown errors", () => {
    expect(errorMessage(new ApiError("trace…", 502), "fallback")).toBe("fallback");
    expect(errorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});

describe("normalizeSteps", () => {
  it("numbers steps and fills safe defaults", () => {
    expect(normalizeSteps([{ title: "A" }])).toEqual([
      { title: "A", step: 1, time: "Varies", resources: [], tasks: [], videos: [] },
    ]);
    expect(normalizeSteps(null)).toEqual([]);
  });
});
