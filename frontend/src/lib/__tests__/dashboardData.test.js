import { describe, expect, it } from "vitest";
import {
  estimateRemaining,
  formatWeeksRange,
  getActivity,
  getReminders,
  parseTargetDate,
  getStepStatuses,
  getTodayFocus,
  parseDurationWeeks,
  summarizeProgress,
} from "../dashboardData";
import { stepProgressKey } from "../roadmapStore";

const ROADMAP = [{ time: "2-4 weeks" }, { time: "1 month" }, { time: "Varies" }, { time: "10 days" }, { time: "3 weeks" }];

describe("summarizeProgress", () => {
  it("counts against the roadmap's real length (TD-07 regression)", () => {
    const statuses = [true, false, false, false, false].map((done, index) => ({ index, done }));
    expect(summarizeProgress(statuses)).toMatchObject({ done: 1, total: 5, percent: 20, currentIndex: 1, complete: false });
  });

  it("handles an empty and a finished roadmap", () => {
    expect(summarizeProgress([])).toMatchObject({ percent: 0, currentIndex: -1, complete: false });
    expect(summarizeProgress([{ index: 0, done: true }])).toMatchObject({ percent: 100, complete: true, currentIndex: -1 });
  });
});

describe("getStepStatuses", () => {
  it("reads only this roadmap's progress keys (TD-08 regression)", () => {
    const progress = {
      [stepProgressKey("r1", 0)]: { completed: 1000 },
      [stepProgressKey("other", 1)]: { completed: 2000 },
    };
    const statuses = getStepStatuses([{}, {}], progress, "r1");
    expect(statuses).toEqual([
      { index: 0, done: true, completedAt: 1000 },
      { index: 1, done: false, completedAt: null },
    ]);
  });
});

describe("parseDurationWeeks", () => {
  it.each([
    ["2-4 weeks", { min: 2, max: 4 }],
    ["3 weeks", { min: 3, max: 3 }],
    ["14 days", { min: 2, max: 2 }],
  ])("%s", (text, expected) => {
    expect(parseDurationWeeks(text)).toEqual(expected);
  });

  it("reads months and en dashes", () => {
    const range = parseDurationWeeks("1–2 months");
    expect(range.min).toBeCloseTo(4.345);
    expect(range.max).toBeCloseTo(8.69);
  });

  it("never guesses unreadable estimates", () => {
    expect(parseDurationWeeks("Varies")).toBeNull();
    expect(parseDurationWeeks(undefined)).toBeNull();
  });
});

describe("estimateRemaining", () => {
  it("sums only steps not done and counts unknown ones", () => {
    const statuses = ROADMAP.map((_, index) => ({ index, done: index === 0 }));
    const result = estimateRemaining(ROADMAP, statuses);
    expect(result.unknown).toBe(1);
    expect(result.min).toBeCloseTo(4.345 + 10 / 7 + 3);
  });

  it("returns null when nothing is readable", () => {
    expect(estimateRemaining([{ time: "Varies" }], [{ index: 0, done: false }])).toBeNull();
  });
});

describe("formatWeeksRange", () => {
  it("formats weeks and months", () => {
    expect(formatWeeksRange({ min: 3, max: 3 })).toBe("3 weeks");
    expect(formatWeeksRange({ min: 1, max: 1 })).toBe("1 week");
    expect(formatWeeksRange({ min: 6, max: 11 })).toBe("1–3 months");
  });
});

describe("getActivity", () => {
  it("counts days with events and the current streak", () => {
    const now = new Date(2026, 9, 7, 15).getTime();
    const day = 24 * 60 * 60 * 1000;
    const events = [now, now - day, now - 2 * day, now - 5 * day].map((timestamp) => ({ timestamp }));
    const activity = getActivity(events, { now });
    expect(activity.days).toHaveLength(14);
    expect(activity.activeDays).toBe(4);
    expect(activity.streak).toBe(3);
  });

  it("ignores malformed events", () => {
    expect(getActivity([{}, null, { timestamp: "x" }], { now: Date.now() }).activeDays).toBe(0);
  });
});

describe("getTodayFocus", () => {
  it("is null with no roadmap or when every step is done", () => {
    expect(getTodayFocus([], summarizeProgress([]))).toBeNull();
    expect(getTodayFocus([{ title: "A" }], summarizeProgress([{ index: 0, done: true }]))).toBeNull();
  });

  it("picks the first task of the first unfinished step", () => {
    const roadmap = [
      { title: "A", tasks: ["a1"] },
      { title: "B", tasks: ["b1", "b2"], time: "2 weeks", video_search_url: "https://www.youtube.com/results?search_query=b" },
    ];
    const focus = getTodayFocus(roadmap, summarizeProgress([{ index: 0, done: true }, { index: 1, done: false }]));
    expect(focus).toMatchObject({ stepIndex: 1, stepTitle: "B", task: "b1", time: "2 weeks" });
  });

  it("falls back to the description and hides 'Varies'", () => {
    const focus = getTodayFocus([{ title: "A", description: "Read", time: "Varies" }], summarizeProgress([{ index: 0, done: false }]));
    expect(focus).toMatchObject({ task: "Read", time: null });
  });
});

describe("getReminders", () => {
  const roadmap = [{ title: "A" }, { title: "B" }, { title: "C" }, { title: "D" }];
  const now = new Date(2026, 9, 7, 15).getTime(); // Oct 7, 2026 afternoon
  const notes = [
    { targetDate: "2026-10-05" }, // overdue
    { targetDate: "2026-10-09" }, // in 2 days
    { targetDate: "2026-10-20" }, // too far
    { targetDate: "2026-10-07" }, // today
  ];

  it("lists overdue and soon-due unfinished steps, soonest first", () => {
    const statuses = roadmap.map((_, index) => ({ index, done: false }));
    expect(getReminders(roadmap, statuses, notes, { now })).toEqual([
      { index: 0, title: "A", targetDate: "2026-10-05", daysLeft: -2, overdue: true },
      { index: 3, title: "D", targetDate: "2026-10-07", daysLeft: 0, overdue: false },
      { index: 1, title: "B", targetDate: "2026-10-09", daysLeft: 2, overdue: false },
    ]);
  });

  it("skips finished steps, missing and invalid dates", () => {
    const statuses = roadmap.map((_, index) => ({ index, done: index === 0 }));
    const bad = [{ targetDate: "2026-10-05" }, { targetDate: "2026-02-30" }, { targetDate: "soon" }, {}];
    expect(getReminders(roadmap, statuses, bad, { now })).toEqual([]);
    expect(getReminders(roadmap, statuses, undefined, { now })).toEqual([]);
  });
});

describe("parseTargetDate", () => {
  it("accepts real calendar dates only", () => {
    expect(parseTargetDate("2026-10-07")).toBe(new Date(2026, 9, 7).getTime());
    expect(parseTargetDate("2026-02-30")).toBeNull();
    expect(parseTargetDate("10/07/2026")).toBeNull();
    expect(parseTargetDate("")).toBeNull();
  });
});
