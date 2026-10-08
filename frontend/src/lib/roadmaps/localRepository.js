/**
 * Local (guest) roadmap repository: the roadmap and progress saved in this
 * browser (ADR-013). Same storage, keys and formats as before Milestone 2;
 * pages reach it through useCurrentRoadmap() / repositoryFor().
 */

import { requestRoadmap } from "../api";
import { getStepStatuses } from "../dashboardData";
import { loadCurrentRoadmap, saveCurrentRoadmap, stepProgressKey } from "../roadmapStore";
import { getAllProgress, getEvents, trackProgress } from "../trackingEngine";

// Guests' step notes and target dates: { [roadmapId]: { [index]: {note, targetDate} } }.
const NOTES_KEY = "pathwayai_step_notes";

function readNotes() {
  try {
    const all = JSON.parse(localStorage.getItem(NOTES_KEY));
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
}

function notesFor(roadmapId, length) {
  const mine = readNotes()[roadmapId] || {};
  return Array.from({ length }, (_, i) => ({
    note: typeof mine[i]?.note === "string" ? mine[i].note : "",
    targetDate: typeof mine[i]?.targetDate === "string" ? mine[i].targetDate : "",
  }));
}

/**
 * Attach this browser's progress and event log to a stored roadmap.
 * @returns {object} a roadmap record (see useCurrentRoadmap.js)
 */
function toRecord(stored) {
  return {
    mode: "local",
    id: stored.id,
    career: stored.career,
    careerData: stored.careerData || null,
    answers: stored.answers || null,
    roadmap: stored.roadmap,
    generatedAt: stored.generatedAt || null,
    statuses: getStepStatuses(stored.roadmap, getAllProgress(), stored.id),
    notes: notesFor(stored.id, stored.roadmap.length),
    canRegenerate: Boolean(stored.answers),
    // Activity here counts days with any tracked event (visits included).
    events: getEvents(),
    activityKind: "visits",
  };
}

/** The router-state copy of a roadmap that couldn't be saved (ADR-013). */
function fromState(state) {
  if (state?.career && Array.isArray(state.roadmap) && state.roadmap.length > 0) {
    return toRecord({ id: "unsaved", career: state.career, roadmap: state.roadmap });
  }
  return null;
}

export const localRepository = {
  mode: "local",

  /** Synchronous: localStorage is available immediately (no loading state). */
  loadSync(fallbackState) {
    const stored = loadCurrentRoadmap();
    return stored ? toRecord(stored) : fromState(fallbackState);
  },

  async load(fallbackState) {
    return this.loadSync(fallbackState);
  },

  /** Generate a roadmap and make it this browser's current one. */
  async generate({ answers, career, careerData }) {
    const steps = await requestRoadmap(answers, career);
    if (steps.length === 0) throw new Error("Empty roadmap");
    return toRecord(saveCurrentRoadmap({ career, careerData, answers, roadmap: steps }));
  },

  /** A new roadmap for the same career and answers; replaces the current one. */
  async regenerate(record) {
    const steps = await requestRoadmap(record.answers, record.career);
    if (steps.length === 0) throw new Error("Empty roadmap");
    return toRecord(
      saveCurrentRoadmap({
        career: record.career,
        careerData: record.careerData,
        answers: record.answers,
        roadmap: steps,
      })
    );
  },

  /** Save a step's note and target date in this browser (only for this roadmap). */
  async setStepNote(record, index, { note, targetDate }) {
    const all = readNotes();
    const mine = { ...(all[record.id] || {}) };
    const cleanNote = (note || "").trim().slice(0, 2000);
    if (cleanNote || targetDate) mine[index] = { note: cleanNote, targetDate: targetDate || "" };
    else delete mine[index];
    // Keep notes for the current roadmap only (one roadmap per browser).
    const next = Object.keys(mine).length ? { [record.id]: mine } : {};
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    } catch (error) {
      console.error("[Roadmaps] Note save failed:", error?.name || "unknown");
      throw new Error("Couldn't save that note.");
    }
    return { ...record, notes: notesFor(record.id, record.roadmap.length) };
  },

  /** Mark a step done or not done; returns the updated record. */
  async setStepDone(record, index, done) {
    trackProgress(stepProgressKey(record.id, index), done ? "completed" : "incomplete");
    return {
      ...record,
      statuses: getStepStatuses(record.roadmap, getAllProgress(), record.id),
      events: getEvents(),
    };
  },
};
