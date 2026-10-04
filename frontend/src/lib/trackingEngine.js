/**
 * Tracking Engine
 * Core tracking system for career progression
 * Persists data to localStorage
 */

import { validateEvent, EVENT_TYPES, METRIC_NAMES } from "../data/trackingSchema";

const STORAGE_KEY = "pathwayai_tracking";
const VERSION = "1.0.0";

// ✅ Re-export so pages can do: import { EVENT_TYPES, METRIC_NAMES } from "../lib/trackingEngine"
export { EVENT_TYPES, METRIC_NAMES };

/**
 * Safe JSON parse with fallback
 */
function safeParseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * Build default tracking object
 */
function defaultTrackingData() {
  const now = Date.now();
  return {
    version: VERSION,

    // Core stores
    events: [],
    metrics: {}, // keyed by metric string value, each stores {values[], current, average, max, min, lastUpdated}
    progress: {}, // keyed by action id

    // Session/stats
    sessionStartTime: now,
    lastSessionStart: now,
    totalSessions: 0,
    totalScreensViewed: 0,
    actionsCompleted: 0,
  };
}

/**
 * Initialize tracking data structure in localStorage (if missing / corrupt)
 */
function initializeTrackingData() {
  const existing = safeParseJson(localStorage.getItem(STORAGE_KEY), null);

  if (existing && typeof existing === "object" && Array.isArray(existing.events) && existing.metrics) {
    // Ensure new fields exist (forward compatible)
    const merged = {
      ...defaultTrackingData(),
      ...existing,
      version: existing.version || VERSION,
      events: Array.isArray(existing.events) ? existing.events : [],
      metrics: existing.metrics && typeof existing.metrics === "object" ? existing.metrics : {},
      progress: existing.progress && typeof existing.progress === "object" ? existing.progress : {},
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  const initial = defaultTrackingData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

/**
 * Get tracking data from localStorage
 */
function getTrackingData() {
  const data = safeParseJson(localStorage.getItem(STORAGE_KEY), null);
  if (!data || typeof data !== "object") return initializeTrackingData();

  // Patch missing fields safely
  const patched = {
    ...defaultTrackingData(),
    ...data,
    events: Array.isArray(data.events) ? data.events : [],
    metrics: data.metrics && typeof data.metrics === "object" ? data.metrics : {},
    progress: data.progress && typeof data.progress === "object" ? data.progress : {},
  };

  // Persist patch if something was missing
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patched));
  return patched;
}

/**
 * Save tracking data to localStorage
 */
function saveTrackingData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("[Tracking Engine] Failed to save data:", error);
    return false;
  }
}

/**
 * Utility: generate unique id
 */
function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Utility: checks if name is one of the METRIC_NAMES values
 */
function isValidMetricName(metricName) {
  const allowed = Object.values(METRIC_NAMES);
  return allowed.includes(metricName);
}

/**
 * Track an event with optional payload
 * @param {string} type - Event type (value from EVENT_TYPES)
 * @param {object} payload - Event data payload
 * @returns {boolean} - Success status
 */
export function trackEvent(type, payload = {}) {
  try {
    if (!validateEvent(type, payload)) return false;

    const data = getTrackingData();

    const event = {
      id: makeId(),
      type,
      payload,
      timestamp: Date.now(),
    };

    data.events.push(event);

    // Basic counters (safe)
    data.totalScreensViewed = (data.totalScreensViewed || 0) + 1;
    data.actionsCompleted = (data.actionsCompleted || 0) + 1;

    const saved = saveTrackingData(data);
    return saved;
  } catch (error) {
    console.error("[Tracking Engine] trackEvent failed:", error);
    return false;
  }
}

/**
 * Track a metric with a numerical value.
 * Metrics are stored as arrays to track history over time.
 * @param {string} name - Metric name (value from METRIC_NAMES)
 * @param {number} value - Metric value
 * @returns {boolean} - Success status
 */
export function trackMetric(name, value) {
  try {
    // ✅ name should be like "resume_score", not "RESUME_SCORE"
    if (!isValidMetricName(name)) {
      console.error(`[Tracking Engine] Unknown metric name: ${name}`);
      return false;
    }

    if (typeof value !== "number" || Number.isNaN(value)) {
      console.error(`[Tracking Engine] Invalid metric value: ${value}`);
      return false;
    }

    const data = getTrackingData();

    if (!data.metrics[name]) {
      data.metrics[name] = {
        values: [],
        current: null,
        average: null,
        max: null,
        min: null,
        lastUpdated: null,
      };
    }

    const metric = data.metrics[name];

    metric.values.push({
      value,
      timestamp: Date.now(),
    });

    const values = metric.values.map((v) => v.value);
    const sum = values.reduce((s, v) => s + v, 0);

    metric.current = value;
    metric.average = values.length ? sum / values.length : value;
    metric.max = Math.max(...values);
    metric.min = Math.min(...values);
    metric.lastUpdated = Date.now();

    return saveTrackingData(data);
  } catch (error) {
    console.error("[Tracking Engine] trackMetric failed:", error);
    return false;
  }
}

/**
 * Track progress for an action (e.g., roadmap step)
 * @param {string} action - Action identifier (e.g., "roadmap_step_1" or "step_3")
 * @param {string} status - "started" | "completed" | "skipped"
 * @param {object} metadata - Optional metadata
 * @returns {boolean} - Success status
 */
export function trackProgress(action, status, metadata = {}) {
  try {
    if (!action) return false;

    const allowedStatus = ["started", "completed", "skipped", "incomplete"];
    if (!allowedStatus.includes(status)) {
      console.error(`[Tracking Engine] Invalid progress status: ${status}`);
      return false;
    }

    const data = getTrackingData();

    if (!data.progress) data.progress = {};

    if (!data.progress[action]) {
      data.progress[action] = {
        started: null,
        completed: null,
        skipped: false,
        attempts: 0,
        lastStatus: null,
        lastUpdated: null,
        metadata: {},
      };
    }

    const progress = data.progress[action];
    const ts = Date.now();

    if (status === "started") {
      progress.started = ts;
      progress.attempts = (progress.attempts || 0) + 1;
    } else if (status === "completed") {
      progress.completed = ts;
      progress.skipped = false;
    } else if (status === "skipped") {
      progress.skipped = true;
    } else if (status === "incomplete") {
      progress.completed = null;
      progress.skipped = false;
    }

    progress.lastStatus = status;
    progress.lastUpdated = ts;

    if (metadata && typeof metadata === "object" && Object.keys(metadata).length > 0) {
      progress.metadata = { ...progress.metadata, ...metadata };
    }

    return saveTrackingData(data);
  } catch (error) {
    console.error("[Tracking Engine] trackProgress failed:", error);
    return false;
  }
}

/**
 * Get all tracked events, optionally filtered by type
 * @param {string|null} type - Optional event type filter (value from EVENT_TYPES)
 * @returns {Array}
 */
export function getEvents(type = null) {
  const data = getTrackingData();
  if (type) return data.events.filter((e) => e.type === type);
  return data.events;
}

/**
 * Get metric data by name
 * @param {string} name - Metric name (value from METRIC_NAMES)
 * @returns {object|null}
 */
export function getMetric(name) {
  const data = getTrackingData();
  return data.metrics?.[name] || null;
}

/**
 * Get progress data for an action
 * @param {string} action
 * @returns {object|null}
 */
export function getProgress(action) {
  const data = getTrackingData();
  return data.progress?.[action] || null;
}

/**
 * Get all progress data
 * @returns {object}
 */
export function getAllProgress() {
  const data = getTrackingData();
  return data.progress || {};
}

/**
 * Remove every progress entry whose key starts with `prefix` (e.g. one
 * roadmap's steps after it was saved to the user's account). Events stay.
 * @param {string} prefix
 * @returns {boolean} - Success status
 */
export function clearProgress(prefix) {
  if (!prefix) return false;
  const data = getTrackingData();
  Object.keys(data.progress || {}).forEach((key) => {
    if (key.startsWith(prefix)) delete data.progress[key];
  });
  return saveTrackingData(data);
}

/**
 * Get tracking statistics
 * @returns {object}
 */
export function getTrackingStats() {
  const data = getTrackingData();
  const now = Date.now();
  const start = data.sessionStartTime || now;

  return {
    totalEvents: data.events?.length || 0,
    totalMetrics: data.metrics ? Object.keys(data.metrics).length : 0,
    totalProgressItems: data.progress ? Object.keys(data.progress).length : 0,
    sessionStartTime: start,
    sessionDuration: now - start,
    lastSessionStart: data.lastSessionStart || start,
    totalSessions: data.totalSessions || 0,
    totalScreensViewed: data.totalScreensViewed || 0,
    actionsCompleted: data.actionsCompleted || 0,
    version: data.version || VERSION,
  };
}

/**
 * Start a new tracking session
 */
export function startSession() {
  const data = getTrackingData();
  const now = Date.now();

  data.sessionStartTime = now;
  data.lastSessionStart = now;
  data.totalSessions = (data.totalSessions || 0) + 1;

  saveTrackingData(data);

  // schema allows empty payload
  trackEvent(EVENT_TYPES.SESSION_START, {});
}

/**
 * End current tracking session
 */
export function endSession() {
  const data = getTrackingData();
  const now = Date.now();
  const duration = now - (data.sessionStartTime || now);

  // schema requires duration for session_end
  trackMetric(METRIC_NAMES.SESSION_DURATION, duration);
  trackEvent(EVENT_TYPES.SESSION_END, { duration });
}

/**
 * Clear all tracking data (for testing or reset)
 */
export function clearTrackingData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Re-init so app continues smoothly
    initializeTrackingData();
    return true;
  } catch (error) {
    console.error("[Tracking Engine] Failed to clear data:", error);
    return false;
  }
}

/**
 * Export tracking data (for backup or analysis)
 * @returns {object}
 */
export function exportTrackingData() {
  const data = getTrackingData();
  return {
    ...data,
    exportDate: new Date().toISOString(),
  };
}

/**
 * Import tracking data (for restoring from backup)
 * @param {object} importedData
 * @returns {boolean}
 */
export function importTrackingData(importedData) {
  try {
    if (!importedData || !Array.isArray(importedData.events) || typeof importedData.metrics !== "object") {
      console.error("[Tracking Engine] Invalid imported data");
      return false;
    }

    // Patch to ensure required fields exist
    const merged = {
      ...defaultTrackingData(),
      ...importedData,
      events: importedData.events,
      metrics: importedData.metrics,
      progress: importedData.progress && typeof importedData.progress === "object" ? importedData.progress : {},
      version: importedData.version || VERSION,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return true;
  } catch (error) {
    console.error("[Tracking Engine] Failed to import data:", error);
    return false;
  }
}

// Initialize tracking on load (non-crashing)
initializeTrackingData();
