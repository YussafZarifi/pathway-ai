// The single client for the PathwayAI backend. Every request goes through
// request() so the base URL, timeout and error handling live in one place.
// The base URL comes from VITE_API_URL (see frontend/.env.example); the
// build fails without it (vite.config.js).
const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

// Gemini can take a while, a roadmap also waits on YouTube lookups, and a
// free Render backend needs up to about a minute to wake from sleep.
const TIMEOUT_MS = 90_000;

export class ApiError extends Error {
  /**
   * @param {string} message safe to show to the user
   * @param {number} status HTTP status, or 0 for timeouts and network errors
   */
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * The message to show for a failed request. Client errors (bad answers,
 * rate limits) and timeouts carry a specific, user-safe message from
 * ApiError; everything else gets the page's own fallback copy.
 */
export function errorMessage(error, fallback) {
  const specific =
    error instanceof ApiError &&
    (error.status === 0 || (error.status >= 400 && error.status < 500));
  return specific && error.message ? error.message : fallback;
}

async function request(path, body, { signal } = {}) {
  if (!API_URL) {
    console.error("VITE_API_URL is not set; see frontend/.env.example");
    throw new ApiError("PathwayAI isn't configured correctly. Please try again later.", 503);
  }

  // Abort on the caller's signal (e.g. unmount) or on our own timeout.
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onAbort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort("timeout"), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e; // the caller cancelled: keep the AbortError
    if (controller.signal.reason === "timeout") {
      throw new ApiError("This is taking longer than expected. Please try again.");
    }
    throw new ApiError("Couldn't reach PathwayAI. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : "";
    throw new ApiError(detail || "Something went wrong. Please try again.", res.status);
  }
  return data;
}

/**
 * Suggest three tech careers for a set of quiz answers.
 * @returns {Promise<{careers: Array, explanation: string}>}
 */
export async function requestCareers(answers, { signal } = {}) {
  const data = await request("/api/ai/career", { answers }, { signal });
  return {
    careers: Array.isArray(data?.careers) ? data.careers : [],
    explanation: data?.explanation || "",
  };
}

/**
 * Generate a roadmap for a career and normalize its steps.
 * @returns {Promise<Array>} steps with step number and safe defaults
 */
export async function requestRoadmap(answers, career, { signal } = {}) {
  const data = await request("/api/ai/roadmap", { answers, career }, { signal });

  return Array.isArray(data?.roadmap)
    ? data.roadmap.map((step, idx) => ({
        ...step,
        step: idx + 1,
        time: step.time || "Varies",
        resources: step.resources || [],
        tasks: step.tasks || [],
        videos: Array.isArray(step.videos) ? step.videos : [],
      }))
    : [];
}
