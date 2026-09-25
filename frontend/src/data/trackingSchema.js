/**
 * Tracking Schema
 * Defines all allowed event types, metric names, and their validation rules
 */

export const EVENT_TYPES = {
  // Quiz events
  QUIZ_STARTED: "quiz_started",
  QUIZ_COMPLETED: "quiz_completed",
  QUIZ_QUESTION_ANSWERED: "quiz_question_answered",

  // Career events
  CAREER_SUGGESTIONS_GENERATED: "career_suggestions_generated",
  CAREER_SELECTED: "career_selected",
  CAREER_COMPARED: "career_compared",
  CAREER_REGENERATED: "career_regenerated",

  // Roadmap events
  ROADMAP_GENERATED: "roadmap_generated",
  ROADMAP_STEP_STARTED: "roadmap_step_started",
  ROADMAP_STEP_COMPLETED: "roadmap_step_completed",
  ROADMAP_STEP_SKIPPED: "roadmap_step_skipped",

  // Resume events
  RESUME_UPLOADED: "resume_uploaded",
  RESUME_ANALYZED: "resume_analyzed",
  RESUME_IMPROVED: "resume_improved",

  // Dashboard events
  DASHBOARD_VIEWED: "dashboard_viewed",
  DASHBOARD_TAB_SWITCHED: "dashboard_tab_switched",

  // System events
  SESSION_START: "session_start",
  SESSION_END: "session_end",
};

export const METRIC_NAMES = {
  // Quiz metrics
  QUIZ_SCORE: "quiz_score",
  QUIZ_TIME_SPENT: "quiz_time_spent",
  QUIZ_QUESTIONS_ANSWERED: "quiz_questions_answered",

  // Career metrics
  CAREER_MATCH_SCORE: "career_match_score",
  CAREER_SALARY_RANGE: "career_salary_range",
  CAREER_GROWTH_RATE: "career_growth_rate",

  // Roadmap metrics
  ROADMAP_PROGRESS: "roadmap_progress",
  ROADMAP_STEPS_TOTAL: "roadmap_steps_total",
  ROADMAP_STEPS_COMPLETED: "roadmap_steps_completed",
  ROADMAP_STEPS_SKIPPED: "roadmap_steps_skipped",
  ROADMAP_TIME_SPENT: "roadmap_time_spent",

  // Resume metrics
  RESUME_SCORE: "resume_score",
  RESUME_IMPROVEMENT: "resume_improvement",
  RESUME_ANALYSIS_COUNT: "resume_analysis_count",

  // System metrics
  SESSION_DURATION: "session_duration",
  TOTAL_SCREENS_VIEWED: "total_screens_viewed",
  ACTIONS_COMPLETED: "actions_completed",
};

/**
 * Validation schema for event payloads
 */
export const EVENT_SCHEMA = {
  [EVENT_TYPES.QUIZ_STARTED]: {
    required: [],
    optional: ["totalQuestions"],
  },
  [EVENT_TYPES.QUIZ_COMPLETED]: {
    required: ["answers", "timeSpent"],
    optional: ["totalQuestions"],
  },
  [EVENT_TYPES.QUIZ_QUESTION_ANSWERED]: {
    required: ["questionId", "answer"],
    optional: ["timeSpent"],
  },
  [EVENT_TYPES.CAREER_SUGGESTIONS_GENERATED]: {
    required: ["careers"],
    optional: ["explanation"],
  },
  [EVENT_TYPES.CAREER_SELECTED]: {
    required: ["careerTitle", "matchScore"],
    optional: ["salaryRange", "growthRate"],
  },
  [EVENT_TYPES.CAREER_COMPARED]: {
    required: ["careers"],
    optional: [],
  },
  [EVENT_TYPES.CAREER_REGENERATED]: {
    required: [],
    optional: [],
  },
  [EVENT_TYPES.ROADMAP_GENERATED]: {
    required: ["careerTitle", "totalSteps"],
    optional: [],
  },
  [EVENT_TYPES.ROADMAP_STEP_STARTED]: {
    required: ["stepId", "stepTitle"],
    optional: [],
  },
  [EVENT_TYPES.ROADMAP_STEP_COMPLETED]: {
    required: ["stepId", "stepTitle"],
    optional: ["timeSpent"],
  },
  [EVENT_TYPES.ROADMAP_STEP_SKIPPED]: {
    required: ["stepId", "stepTitle"],
    optional: [],
  },
  [EVENT_TYPES.RESUME_UPLOADED]: {
    required: ["fileName"],
    optional: [],
  },
  [EVENT_TYPES.RESUME_ANALYZED]: {
    required: ["score"],
    optional: ["issues", "suggestions"],
  },
  [EVENT_TYPES.RESUME_IMPROVED]: {
    required: ["previousScore", "newScore"],
    optional: [],
  },
  [EVENT_TYPES.DASHBOARD_VIEWED]: {
    required: ["activeTab"],
    optional: [],
  },
  [EVENT_TYPES.DASHBOARD_TAB_SWITCHED]: {
    required: ["fromTab", "toTab"],
    optional: [],
  },
  [EVENT_TYPES.SESSION_START]: {
    required: [],
    optional: [],
  },
  [EVENT_TYPES.SESSION_END]: {
    required: ["duration"],
    optional: [],
  },
};

/**
 * Validates event payload against schema
 */
export function validateEvent(type, payload) {
  const schema = EVENT_SCHEMA[type];
  if (!schema) {
    console.error(`[Tracking Schema] Unknown event type: ${type}`);
    return false;
  }

  for (const field of schema.required) {
    if (!(field in payload)) {
      console.error(`[Tracking Schema] Missing required field: ${field}`);
      return false;
    }
  }

  return true;
}
