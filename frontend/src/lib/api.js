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
 * rate limits), 503s (AI quota used up or busy) and timeouts carry a
 * specific, user-safe message from ApiError; everything else gets the
 * page's own fallback copy.
 */
export function errorMessage(error, fallback) {
  const specific =
    error instanceof ApiError &&
    (error.status === 0 ||
      error.status === 503 ||
      (error.status >= 400 && error.status < 500));
  return specific && error.message ? error.message : fallback;
}

/**
 * One backend call. JSON by default; `raw` sends a Blob/File as the body
 * unchanged with its own Content-Type (the résumé PDF, ADR-020), and
 * `method: "GET"` sends no body.
 */
async function request(path, body, { signal, token, method = "POST", raw = null, contentType } = {}) {
  if (!API_URL) {
    console.error("VITE_API_URL is not set; see frontend/.env.example");
    throw new ApiError("PathwayAI isn't configured correctly. Please try again later.", 500);
  }

  // Abort on the caller's signal (e.g. unmount) or on our own timeout.
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onAbort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort("timeout"), TIMEOUT_MS);

  let res;
  try {
    const hasBody = method !== "GET";
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(hasBody ? { "Content-Type": raw ? contentType : "application/json" } : {}),
        // Supabase access token for account routes (ADR-018/019); guests send none.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: hasBody ? (raw ?? JSON.stringify(body)) : undefined,
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
  return normalizeSteps(data?.roadmap);
}

/**
 * Roadmap steps with step numbers and safe defaults, from the API or from
 * the database (saved steps also carry `id` and `position`).
 */
export function normalizeSteps(steps) {
  return Array.isArray(steps)
    ? steps.map((step, idx) => ({
        ...step,
        step: idx + 1,
        time: step.time || "Varies",
        resources: step.resources || [],
        tasks: step.tasks || [],
        videos: Array.isArray(step.videos) ? step.videos : [],
      }))
    : [];
}

// --- Signed-in users: saved roadmaps (ADR-019) ------------------------------

/**
 * Generate a roadmap and save it to the signed-in user's account.
 * @returns {Promise<object>} the saved roadmap (id, career, roadmap[steps with id], …)
 */
export function createSavedRoadmap(token, { answers, career, careerData }, { signal } = {}) {
  return request(
    "/api/roadmaps",
    { answers, career, career_data: careerData || null },
    { signal, token }
  );
}

/** A new roadmap from a saved roadmap's stored answers; it becomes current. */
export function regenerateSavedRoadmap(token, roadmapId, { signal } = {}) {
  return request(`/api/roadmaps/${encodeURIComponent(roadmapId)}/regenerate`, {}, { signal, token });
}

/**
 * Save the browser's roadmap to the account once (201 new, 200 already saved).
 * @param {object} payload { local_id, career, career_data, answers, generated_at, steps, completed }
 */
export function importLocalRoadmap(token, payload, { signal } = {}) {
  return request("/api/roadmaps/import", payload, { signal, token });
}

// --- Signed-in users: résumé analysis (ADR-020) ------------------------------

/**
 * Whether this user can analyze a résumé now.
 * @returns {Promise<{available: boolean, reason: string|null, career: string|null}>}
 */
export function getResumeAvailability(token, { signal } = {}) {
  return request("/api/resume-analyses/availability", null, { signal, token, method: "GET" });
}

/**
 * Upload a résumé PDF for analysis. The file's bytes are the whole body:
 * no file name, form fields or other metadata are sent.
 * @returns {Promise<object>} the saved analysis row
 */
export function analyzeResume(token, file, { signal } = {}) {
  return request("/api/resume-analyses", null, {
    signal,
    token,
    raw: file,
    contentType: "application/pdf",
  });
}

// --- Signed-in users: AI Coach (ADR-021) --------------------------------------

/** @returns {Promise<{available: boolean, reason: string|null}>} */
export function getCoachAvailability(token, { signal } = {}) {
  return request("/api/coach/availability", null, { signal, token, method: "GET" });
}

/**
 * Send a message to the coach (a new conversation when threadId is null).
 * @returns {Promise<{thread_id: string, title: string, messages: Array}>}
 */
export function postCoachMessage(token, { threadId, message }, { signal } = {}) {
  return request(
    "/api/coach/messages",
    threadId ? { thread_id: threadId, message } : { message },
    { signal, token }
  );
}
