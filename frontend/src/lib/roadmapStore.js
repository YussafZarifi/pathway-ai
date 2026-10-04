/**
 * Roadmap Store
 * Persists the user's current roadmap in localStorage so /dashboard works
 * after a reload or in a new tab (ADR-013). One roadmap at a time until
 * accounts exist (F-7/F-8).
 */

const STORAGE_KEY = "pathwayai_roadmap";
const VERSION = 1;

function makeId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Save a newly generated roadmap as the current one.
 * @param {object} input - { career, careerData, answers, roadmap }
 * @returns {object} the stored record (with id and generatedAt)
 */
export function saveCurrentRoadmap({ career, careerData = null, answers = null, roadmap }) {
  const record = {
    version: VERSION,
    id: makeId(),
    career,
    careerData,
    answers,
    roadmap: Array.isArray(roadmap) ? roadmap : [],
    generatedAt: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (error) {
    console.error("[Roadmap Store] Failed to save roadmap:", error);
  }
  return record;
}

/**
 * @returns {object|null} the current roadmap record, or null if none/corrupt
 */
export function loadCurrentRoadmap() {
  try {
    const record = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      record &&
      record.version === VERSION &&
      typeof record.id === "string" &&
      typeof record.career === "string" &&
      Array.isArray(record.roadmap) &&
      record.roadmap.length > 0
    ) {
      return record;
    }
  } catch {
    // Corrupt or blocked storage: treat as no roadmap.
  }
  return null;
}

/**
 * Progress key for one step of one roadmap. Keeps the "roadmap_step_"
 * prefix that scoringEngine counts, but is unique per roadmap so progress
 * no longer leaks between careers (TD-08).
 */
export function stepProgressKey(roadmapId, index) {
  return `roadmap_step_${roadmapId}_${index}`;
}

/**
 * Forget the current roadmap (after it was saved to the user's account,
 * ADR-019). Its progress keys are removed separately (trackingEngine).
 */
export function clearCurrentRoadmap() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("[Roadmap Store] Failed to clear roadmap:", error);
  }
}

/** Prefix of every progress key of one roadmap (see stepProgressKey). */
export function stepProgressPrefix(roadmapId) {
  return `roadmap_step_${roadmapId}_`;
}
