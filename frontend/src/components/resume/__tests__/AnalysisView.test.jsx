import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AnalysisView from "../AnalysisView";

const insufficient = {
  id: "sparse-1",
  career: "Software Engineer",
  summary: "Unable to score reliably: not enough readable résumé content.",
  scoreReport: {
    status: "insufficient_evidence",
    overall: 0,
    ats: { score: 0 },
    readiness: { internship: 0, junior: 0, mid_level: 0 },
    confidence: { level: "very_low", score: 5, reason: "Too little source evidence." },
    rubric: { label: "Software engineering" },
    insufficient_reasons: ["The PDF contains too little readable résumé text for a reliable review."],
    recommendations: [],
    categories: [{ id: "skills", label: "Relevant technical skills", score: 0, criteria: [
      { id: "skill_1", label: "Python", found: false, note: "Not found.", evidence: [], points: 0, max_points: 10 },
    ] }],
    roadmap: { steps: [], skills: [] },
  },
};

function show(analysis = insufficient) {
  return render(<MemoryRouter><AnalysisView analysis={analysis} /></MemoryRouter>);
}

describe("Resume Analyzer score report", () => {
  it("replaces an empty numeric gauge with an explicit no-score state and very low confidence", () => {
    show();
    expect(screen.getByRole("heading", { name: "Not enough content to score reliably" })).toBeTruthy();
    expect(screen.getByText("Not scored")).toBeTruthy();
    expect(screen.getByText(/very low confidence/i)).toBeTruthy();
    expect(screen.getByText(/5\/100/)).toBeTruthy();
    expect(screen.getByText(/not enough readable, verifiable resume evidence/i)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Resume evidence score: 0 out of 100/ })).toBeNull();
  });

  it("keeps detailed evidence and ATS data collapsed until requested", () => {
    show();
    const details = document.querySelector(".resumeMoreDetails");
    expect(details.open).toBe(false);
    expect(screen.getByText("Scoring, ATS, source evidence, and roadmap details")).toBeTruthy();
    expect(screen.getByText(/describes the PDF, not your actual ability/)).toBeTruthy();
  });
});
