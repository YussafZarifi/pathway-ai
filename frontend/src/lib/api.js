// Backend calls shared across pages. The base URL comes from VITE_API_URL
// when set (ROADMAP N-5); the local default keeps today's dev setup working.
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/**
 * Generate a roadmap for a career and normalize its steps.
 * @returns {Promise<Array>} steps with step number and safe defaults
 */
export async function requestRoadmap(answers, career, { signal } = {}) {
  const res = await fetch(`${API_URL}/api/ai/roadmap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, career }),
    signal,
  });

  if (!res.ok) throw new Error("Roadmap AI request failed");

  const data = await res.json();

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
