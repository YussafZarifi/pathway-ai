/**
 * Account roadmap repository (ADR-019): signed-in users' roadmaps in
 * Supabase Postgres.
 *
 * - Reads go straight to Supabase with the user's session; row-level
 *   security returns only their own rows (the browser can't see quiz
 *   answers at all).
 * - Step progress (user-owned state) is written directly through RLS.
 * - Anything AI-generated is created by FastAPI (lib/api.js), never here.
 *
 * Activity for signed-in users is derived from saved rows (roadmaps created,
 * steps completed), so the streak counts days with progress, not visits.
 */

import {
  ApiError,
  createSavedRoadmap,
  normalizeSteps,
  regenerateSavedRoadmap,
} from "../api";
import { supabase } from "../supabase";

// Enough history for the 14-day activity view and achievements.
const MAX_ROADMAPS = 20;

const LOAD_FAILED = "We couldn't load your saved roadmaps. Please try again.";
const SAVE_FAILED = "Couldn't save that change. Please try again.";

const SELECT = `
  id, career, career_data, status, source, quiz_submission_id, created_at,
  roadmap_steps (
    id, position, title, description, time_estimate, tasks, resources,
    video_query, video_search_url, videos,
    step_progress ( completed_at )
  )
`;

async function currentSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError("Please sign in again.", 401);
  return data.session;
}

/** step_progress embeds as one object (1:1 on its key) or a list. */
function progressOf(step) {
  const p = Array.isArray(step.step_progress) ? step.step_progress[0] : step.step_progress;
  return p?.completed_at ? Date.parse(p.completed_at) : null;
}

function sortedSteps(row) {
  return [...(row.roadmap_steps || [])].sort((a, b) => a.position - b.position);
}

/**
 * Activity events built from saved rows, in the shape dashboardData expects.
 * Each saved roadmap was generated from a completed quiz and a chosen career,
 * so the earliest one dates those achievements.
 */
function eventsFrom(rows) {
  const events = [];
  rows.forEach((row) => {
    const created = Date.parse(row.created_at);
    events.push({ type: "roadmap_generated", timestamp: created });
    sortedSteps(row).forEach((step) => {
      const done = progressOf(step);
      if (done) events.push({ type: "roadmap_step_completed", timestamp: done });
    });
  });
  const first = rows.map((r) => Date.parse(r.created_at)).sort((a, b) => a - b)[0];
  if (first) {
    events.push({ type: "quiz_completed", timestamp: first });
    events.push({ type: "career_selected", timestamp: first });
  }
  return events;
}

function toRecord(row, rows) {
  const steps = sortedSteps(row);
  return {
    mode: "account",
    id: row.id,
    career: row.career,
    careerData: row.career_data || null,
    answers: null, // server-only (quiz_submissions)
    roadmap: normalizeSteps(
      steps.map((step) => ({
        id: step.id,
        position: step.position,
        title: step.title,
        description: step.description,
        time: step.time_estimate,
        tasks: step.tasks,
        resources: step.resources,
        video_query: step.video_query,
        video_search_url: step.video_search_url,
        videos: step.videos,
      }))
    ),
    generatedAt: Date.parse(row.created_at),
    statuses: steps.map((step, index) => {
      const completedAt = progressOf(step);
      return { index, done: Boolean(completedAt), completedAt };
    }),
    canRegenerate: Boolean(row.quiz_submission_id),
    events: eventsFrom(rows),
    activityKind: "progress",
  };
}

async function fetchRows() {
  const { data, error } = await supabase
    .from("roadmaps")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(MAX_ROADMAPS);
  if (error) {
    console.error("[Roadmaps] Load failed:", error.code || error.message);
    throw new ApiError(LOAD_FAILED, 503);
  }
  return data || [];
}

export const accountRepository = {
  mode: "account",

  /** The user's current (active) roadmap, or null. */
  async load() {
    const rows = await fetchRows();
    const current = rows.find((r) => r.status === "active");
    return current ? toRecord(current, rows) : null;
  },

  /** Generate with FastAPI (it saves the roadmap), then read it back. */
  async generate({ answers, career, careerData }) {
    const session = await currentSession();
    await createSavedRoadmap(session.access_token, { answers, career, careerData });
    return this.load();
  },

  /** A new roadmap from the saved answers (server side); it becomes current. */
  async regenerate(record) {
    const session = await currentSession();
    await regenerateSavedRoadmap(session.access_token, record.id);
    return this.load();
  },

  /** Mark or unmark a step through RLS; completion time is the database's. */
  async setStepDone(record, index, done) {
    const session = await currentSession();
    const stepId = record.roadmap[index]?.id;
    if (!stepId) throw new ApiError(SAVE_FAILED, 400);

    const { error } = done
      ? await supabase.from("step_progress").insert({ step_id: stepId, user_id: session.user.id })
      : await supabase.from("step_progress").delete().eq("step_id", stepId);

    // 23505: already marked (another tab) — the step is done either way.
    if (error && error.code !== "23505") {
      console.error("[Roadmaps] Progress save failed:", error.code || error.message);
      throw new ApiError(SAVE_FAILED, 503);
    }
    return this.load();
  },
};
