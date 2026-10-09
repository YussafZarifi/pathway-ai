import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EVENT_TYPES,
  MAX_EVENTS,
  MAX_METRIC_VALUES,
  METRIC_NAMES,
  capEvents,
  getEvents,
  getMetric,
  trackEvent,
  trackMetric,
} from "../trackingEngine";

const KEY = "pathwayai_tracking";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("capEvents (B-18)", () => {
  it("leaves short logs untouched", () => {
    const events = [{ type: "a" }, { type: "b" }];
    expect(capEvents(events, 5)).toBe(events);
  });

  it("drops the oldest events but keeps each type's first one, in order", () => {
    const events = [
      { id: 1, type: "quiz_completed" },
      { id: 2, type: "page" },
      { id: 3, type: "page" },
      { id: 4, type: "career_selected" },
      { id: 5, type: "page" },
      { id: 6, type: "page" },
    ];
    expect(capEvents(events, 4).map((e) => e.id)).toEqual([1, 2, 4, 6]);
  });
});

describe("trackEvent and trackMetric caps", () => {
  it("never stores more than MAX_EVENTS events and keeps the first quiz completion", () => {
    trackEvent(EVENT_TYPES.QUIZ_COMPLETED, { answers: {}, timeSpent: 1 });
    const first = getEvents(EVENT_TYPES.QUIZ_COMPLETED)[0];
    for (let i = 0; i < MAX_EVENTS + 20; i++) trackEvent(EVENT_TYPES.QUIZ_STARTED, { totalQuestions: 5 });
    const events = getEvents();
    expect(events.length).toBe(MAX_EVENTS);
    expect(events[0].id).toBe(first.id);
  });

  it("keeps the last MAX_METRIC_VALUES values of a metric", () => {
    for (let i = 0; i < MAX_METRIC_VALUES + 5; i++) trackMetric(METRIC_NAMES.ROADMAP_STEPS_TOTAL, i);
    const metric = getMetric(METRIC_NAMES.ROADMAP_STEPS_TOTAL);
    expect(metric.values.length).toBe(MAX_METRIC_VALUES);
    expect(metric.current).toBe(MAX_METRIC_VALUES + 4);
  });
});

describe("reads don't write (B-18)", () => {
  it("doesn't rewrite complete stored data on every read", () => {
    trackEvent(EVENT_TYPES.QUIZ_COMPLETED, { answers: {}, timeSpent: 1 });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    getEvents();
    getMetric(METRIC_NAMES.ROADMAP_STEPS_TOTAL);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("still repairs data with missing fields", () => {
    localStorage.setItem(KEY, JSON.stringify({ events: [] }));
    getEvents();
    expect(JSON.parse(localStorage.getItem(KEY)).metrics).toEqual({});
  });
});
