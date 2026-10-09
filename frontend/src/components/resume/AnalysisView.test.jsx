import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AnalysisView from "./AnalysisView";

const ANALYSIS = {
  id: "1", roadmapId: "r1", career: "Data Analyst", createdAt: 0,
  summary: "Solid SQL, little visualization.",
  matchedSkills: ["SQL"], missingSkills: [], strengths: ["Quantified impact."],
  gaps: [{ skill: "Tableau", why: "Dashboards.", howToClose: "Build one.", relatedStep: 2 }],
  suggestions: [{ section: "projects", text: "Lead with the question." }],
};

function view(props) {
  return render(<MemoryRouter><AnalysisView analysis={ANALYSIS} {...props} /></MemoryRouter>);
}

describe("AnalysisView", () => {
  it("labels the review as AI feedback and shows no score", () => {
    const { container } = view({});
    expect(screen.getByText("AI-generated review")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d+\s*(%|\/\s*100)|score/i);
    expect(screen.getByText("No specific skills called out in this category.")).toBeTruthy(); // empty missing skills
  });

  it("links a gap to the dashboard step for the current roadmap", () => {
    view({ currentRoadmapId: "r1" });
    expect(screen.getByRole("link", { name: "Roadmap step 2" }).getAttribute("href")).toBe("/dashboard#step-2");
  });

  it("doesn't link steps of a review made against another roadmap", () => {
    view({ currentRoadmapId: "other" });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Roadmap step 2")).toBeTruthy();
  });

  it("renders model text as text, never as HTML", () => {
    const { container } = render(
      <MemoryRouter>
        <AnalysisView analysis={{ ...ANALYSIS, summary: "<img src=x onerror=alert(1)>" }} />
      </MemoryRouter>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
