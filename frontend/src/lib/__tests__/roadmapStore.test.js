import { beforeEach, describe, expect, it } from "vitest";
import { clearCurrentRoadmap, loadCurrentRoadmap, saveCurrentRoadmap, stepProgressKey, stepProgressPrefix } from "../roadmapStore";

beforeEach(() => localStorage.clear());

describe("roadmapStore", () => {
  it("saves and loads the current roadmap", () => {
    const saved = saveCurrentRoadmap({ career: "Data Analyst", roadmap: [{ title: "SQL" }] });
    expect(loadCurrentRoadmap()).toEqual(saved);
    expect(saved.id).toMatch(/^[a-z0-9]+$/);
  });

  it("treats corrupt, empty or foreign data as no roadmap", () => {
    localStorage.setItem("pathwayai_roadmap", "{not json");
    expect(loadCurrentRoadmap()).toBeNull();
    localStorage.setItem("pathwayai_roadmap", JSON.stringify({ version: 1, id: "x", career: "C", roadmap: [] }));
    expect(loadCurrentRoadmap()).toBeNull();
    localStorage.setItem("pathwayai_roadmap", JSON.stringify({ version: 99, id: "x", career: "C", roadmap: [{}] }));
    expect(loadCurrentRoadmap()).toBeNull();
  });

  it("clears the roadmap", () => {
    saveCurrentRoadmap({ career: "C", roadmap: [{}] });
    clearCurrentRoadmap();
    expect(loadCurrentRoadmap()).toBeNull();
  });

  it("scopes progress keys per roadmap", () => {
    expect(stepProgressKey("abc", 2)).toBe("roadmap_step_abc_2");
    expect(stepProgressKey("abc", 2).startsWith(stepProgressPrefix("abc"))).toBe(true);
    expect(stepProgressKey("abcd", 0).startsWith(stepProgressPrefix("abc"))).toBe(false);
  });
});
