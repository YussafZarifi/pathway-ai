/**
 * Dashboard Data
 * Pure functions that turn real stored data (the roadmap, step progress,
 * the event log) into what the dashboard shows. No React, no storage
 * access, no invented numbers: anything that can't be derived returns
 * null/empty so the UI can show an empty state.
 */

import { stepProgressKey } from "./roadmapStore";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_PER_MONTH = 4.345;

/**
 * Completion state of every step in a roadmap.
 * @returns {Array<{index:number, done:boolean, completedAt:number|null}>}
 */
export function getStepStatuses(roadmap, progress, roadmapId) {
  return (roadmap || []).map((_, index) => {
    const entry = progress?.[stepProgressKey(roadmapId, index)];
    const completedAt = entry?.completed || null;
    return { index, done: Boolean(completedAt), completedAt };
  });
}

/**
 * Overall progress from step statuses. Percent is out of the roadmap's
 * real length, so 1 of 5 steps is 20% (fixes TD-07).
 */
export function summarizeProgress(statuses) {
  const total = statuses.length;
  const done = statuses.filter((s) => s.done).length;
  const next = statuses.find((s) => !s.done);
  return {
    done,
    total,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    currentIndex: next ? next.index : -1,
    complete: total > 0 && done === total,
  };
}

/**
 * Parse an AI time estimate such as "2-4 weeks", "1–2 months", "10 days"
 * or "3 weeks" into a range in weeks. Returns null for text it can't read
 * (e.g. "Varies"), so unknown estimates are never guessed.
 */
export function parseDurationWeeks(text) {
  if (typeof text !== "string") return null;
  const match = text
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|—|to)\s*(\d+(?:\.\d+)?))?\s*(day|week|wk|month|mo)/);
  if (!match) return null;

  const min = parseFloat(match[1]);
  const max = match[2] ? parseFloat(match[2]) : min;
  const unit = match[3];
  const factor = unit === "day" ? 1 / 7 : unit.startsWith("mo") ? WEEKS_PER_MONTH : 1;

  return { min: min * factor, max: max * factor };
}

/**
 * Sum the AI estimates of the steps not yet done.
 * @returns {{min:number, max:number, unknown:number}|null} null when no
 *   remaining step has a readable estimate
 */
export function estimateRemaining(roadmap, statuses) {
  let min = 0;
  let max = 0;
  let known = 0;
  let unknown = 0;

  statuses.forEach((status) => {
    if (status.done) return;
    const range = parseDurationWeeks(roadmap[status.index]?.time);
    if (range) {
      min += range.min;
      max += range.max;
      known += 1;
    } else {
      unknown += 1;
    }
  });

  return known > 0 ? { min, max, unknown } : null;
}

/** "6–11 weeks", "3 weeks", "2–3 months" */
export function formatWeeksRange({ min, max }) {
  if (max >= 10) {
    const lo = Math.max(1, Math.round(min / WEEKS_PER_MONTH));
    const hi = Math.max(lo, Math.round(max / WEEKS_PER_MONTH));
    return lo === hi ? `${lo} month${lo === 1 ? "" : "s"}` : `${lo}–${hi} months`;
  }
  const lo = Math.max(1, Math.round(min));
  const hi = Math.max(lo, Math.round(max));
  return lo === hi ? `${lo} week${lo === 1 ? "" : "s"}` : `${lo}–${hi} weeks`;
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Activity from an event list. For guests that is the local event log (days
 * the user used PathwayAI); for signed-in users it is built from saved
 * progress (ADR-019). Never study time, and the UI labels it accordingly.
 * @returns {{days:Array<{date:number,count:number}>, activeDays:number, streak:number}}
 */
export function getActivity(events, { days = 14, now = Date.now() } = {}) {
  const counts = new Map();
  (events || []).forEach((e) => {
    if (typeof e?.timestamp !== "number") return;
    const day = startOfDay(e.timestamp);
    counts.set(day, (counts.get(day) || 0) + 1);
  });

  const today = startOfDay(now);
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = startOfDay(today - i * DAY_MS + DAY_MS / 2);
    series.push({ date, count: counts.get(date) || 0 });
  }

  // Consecutive active days ending today (or yesterday, so the streak
  // doesn't read 0 before the user's first action of the day).
  let streak = 0;
  let cursor = counts.has(today) ? today : startOfDay(today - DAY_MS / 2);
  while (counts.has(cursor)) {
    streak += 1;
    cursor = startOfDay(cursor - DAY_MS / 2);
  }

  return { days: series, activeDays: counts.size, streak };
}

function firstTimestamp(events, type) {
  const times = (events || [])
    .filter((e) => e?.type === type && typeof e.timestamp === "number")
    .map((e) => e.timestamp);
  return times.length ? Math.min(...times) : null;
}

/**
 * Milestones, each earned only from real data, with the date it happened.
 * @returns {Array<{id, label, description, earnedAt:number|null}>}
 */
export function getAchievements({ events, statuses, generatedAt }) {
  const completions = statuses
    .filter((s) => s.done)
    .map((s) => s.completedAt)
    .sort((a, b) => a - b);
  const total = statuses.length;
  const halfway = Math.ceil(total / 2);

  return [
    {
      id: "quiz",
      label: "Quiz completed",
      description: "Take the quiz",
      earnedAt: firstTimestamp(events, "quiz_completed"),
    },
    {
      id: "career",
      label: "Career selected",
      description: "Pick a career",
      earnedAt: firstTimestamp(events, "career_selected"),
    },
    {
      id: "roadmap",
      label: "Roadmap ready",
      description: "Generate one",
      earnedAt: generatedAt || firstTimestamp(events, "roadmap_generated"),
    },
    {
      id: "first-step",
      label: "First step",
      description: "Finish a step",
      earnedAt: completions[0] || null,
    },
    {
      id: "halfway",
      label: "Halfway there",
      description: `${halfway} of ${total} steps`,
      earnedAt: total > 0 && completions.length >= halfway ? completions[halfway - 1] : null,
    },
    {
      id: "complete",
      label: "Finished",
      description: `All ${total} steps`,
      earnedAt: total > 0 && completions.length === total ? completions[total - 1] : null,
    },
  ];
}

/** A short, state-based message. It describes progress; it never claims pace. */
export function getMotivation(summary) {
  if (summary.complete) return "Roadmap complete. That's real, finished work.";
  if (summary.done === 0) return "Every path starts with one step. Yours is ready.";
  if (summary.percent >= 50) return "Past the halfway point. Keep going.";
  return "Good start. One step at a time.";
}

/**
 * The single recommended next action: the first task of the first
 * unfinished step (or its description when it has no tasks).
 */
export function getTodayFocus(roadmap, summary) {
  if (summary.currentIndex < 0) return null;
  const step = roadmap[summary.currentIndex];
  if (!step) return null;
  return {
    stepIndex: summary.currentIndex,
    stepTitle: step.title,
    task: step.tasks?.[0] || step.description || step.title,
    time: step.time && step.time !== "Varies" ? step.time : null,
    video: step.videos?.[0] || null,
    searchUrl: step.video_search_url || null,
  };
}

/**
 * Up to 3 insights, each a plain statement of real data. Rule-based, so
 * the UI calls them "Insights", not "AI insights".
 * @returns {Array<{id:string, text:string}>}
 */
export function getInsights({
  roadmap,
  statuses,
  summary,
  remaining,
  activity,
  activityKind = "visits",
  now = Date.now(),
}) {
  const insights = [];

  if (summary.complete) {
    insights.push({
      id: "complete",
      text: "You've finished every step. Retake the quiz to plan what comes next.",
    });
  }

  const weekAgo = now - 7 * DAY_MS;
  const recent = statuses.filter((s) => s.done && s.completedAt >= weekAgo).length;
  if (recent > 0) {
    insights.push({
      id: "recent",
      text: `You completed ${recent} step${recent === 1 ? "" : "s"} in the last 7 days.`,
    });
  } else if (summary.done === 0 && roadmap[0]) {
    insights.push({
      id: "start",
      text: `Start with "${roadmap[0].title}"${roadmap[0].time && roadmap[0].time !== "Varies" ? `, estimated at ${roadmap[0].time}` : ""}.`,
    });
  }

  // The next step is also the shortest one left. Steps build on each other,
  // so a later short step is never suggested out of order (TD-62).
  const remainingSteps = statuses
    .filter((s) => !s.done)
    .map((s) => ({ s, range: parseDurationWeeks(roadmap[s.index]?.time) }))
    .filter((x) => x.range);
  const shortest = remainingSteps.length > 1
    ? remainingSteps.reduce((a, b) => (b.range.max < a.range.max ? b : a))
    : null;
  if (shortest && summary.done > 0 && shortest.s.index === summary.currentIndex) {
    const step = roadmap[shortest.s.index];
    insights.push({
      id: "shortest",
      text: `Quick win: your next step, "${step.title}", is the shortest one left (${step.time}).`,
    });
  }

  if (remaining && !summary.complete) {
    insights.push({
      id: "remaining",
      text:
        `About ${formatWeeksRange(remaining)} of work left, based on the AI's step estimates` +
        (remaining.unknown > 0
          ? ` (${remaining.unknown} step${remaining.unknown === 1 ? " has" : "s have"} no estimate).`
          : "."),
    });
  }

  if (activity?.streak >= 2) {
    insights.push({
      id: "streak",
      // Signed-in activity comes from real progress (ADR-019); guests' from visits.
      text:
        activityKind === "progress"
          ? `You've made progress ${activity.streak} days in a row.`
          : `You've used PathwayAI ${activity.streak} days in a row.`,
    });
  }

  return insights.slice(0, 3);
}

/** "YYYY-MM-DD" → local midnight (ms), or null for anything else. */
export function parseTargetDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || "");
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) || date.getDate() !== Number(match[3]) ? null : date.getTime();
}

/**
 * In-app reminders from the user's own target dates: unfinished steps that
 * are overdue or due within `withinDays` days, soonest first.
 * @returns {Array<{index:number, title:string, targetDate:string, daysLeft:number, overdue:boolean}>}
 */
export function getReminders(roadmap, statuses, notes, { now = Date.now(), withinDays = 3 } = {}) {
  const today = startOfDay(now);
  return (roadmap || [])
    .map((step, index) => {
      const due = parseTargetDate(notes?.[index]?.targetDate);
      if (due === null || statuses?.[index]?.done) return null;
      const daysLeft = Math.round((due - today) / DAY_MS);
      if (daysLeft > withinDays) return null;
      return { index, title: step.title, targetDate: notes[index].targetDate, daysLeft, overdue: daysLeft < 0 };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
