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

const SCORE_REPORT = {
  status: "scored",
  overall: 76,
  ats: { score: 75, earned: 3.8, weight: 5 },
  rubric: { family: "data_science", label: "Data science & analytics" },
  confidence: { level: "High", reason: "Cited text was checked against each PDF page." },
  readiness: { internship: 82, junior: 61, mid_level: 28 },
  categories: [{
    id: "skills", label: "Relevant technical skills", score: 50, earned: 15, weight: 30,
    criteria: [
      { id: "skill_1", label: "SQL", found: true, points: 15, max_points: 15, note: "Evidence found.", evidence: [{ page: 1, quote: "Used SQL for reporting." }] },
      { id: "skill_2", label: "Tableau", found: false, points: 0, max_points: 15, note: "No Tableau evidence was found.", evidence: [] },
    ],
  }, {
    id: "ats", label: "ATS optimization", score: 75, earned: 3.8, weight: 5,
    criteria: [{ id: "text_parseability", label: "Selectable text", found: true, points: 1.3, max_points: 1.3, note: "Text extracted.", evidence: [] }],
  }],
  roadmap: {
    steps: [{ position: 1, title: "SQL foundations", status: "completed" }, { position: 2, title: "Tableau dashboards", status: "in_progress" }],
    skills: [{ skill: "SQL", found: true, evidence: [], roadmap_steps: [1] }, { skill: "Tableau", found: false, evidence: [], roadmap_steps: [2] }],
  },
  recommendations: [{ title: "Add a Tableau project", action: "Build and document a dashboard.", potential_points: 15, criterion_ids: ["skill_2"] }],
};

function view(props) {
  return render(<MemoryRouter><AnalysisView analysis={ANALYSIS} {...props} /></MemoryRouter>);
}

describe("AnalysisView", () => {
  it("keeps previous qualitative reports readable without inventing a score", () => {
    const { container } = view({});
    expect(screen.getByText("Previous review")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d+\s*(%|\/\s*100)|score/i);
    expect(screen.getByText("This earlier review predates the evidence-based scoring rubric.")).toBeTruthy();
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

  it("renders only backend score fields with cited evidence and visible missing-evidence reasons", () => {
    const { container } = render(
      <MemoryRouter><AnalysisView analysis={{ ...ANALYSIS, scoreReport: SCORE_REPORT }} currentRoadmapId="r1" /></MemoryRouter>
    );
    expect(screen.getByText("76")).toBeTruthy();
    expect(screen.getByText("Good foundation")).toBeTruthy();
    screen.getByText("Scoring, ATS, source evidence, and roadmap details").click();
    expect(screen.getByRole("heading", { name: "Skills in your roadmap" })).toBeTruthy();
    expect(screen.getByText("Demonstrated")).toBeTruthy();
    expect(screen.getByText("Not evidenced yet")).toBeTruthy();
    screen.getAllByText("Relevant technical skills")[0].click();
    expect(screen.getByText(/Used SQL for reporting\./)).toBeTruthy();
    expect(screen.getByText("No Tableau evidence was found.")).toBeTruthy();
    expect(screen.getByText("Tableau dashboards")).toBeTruthy();
    expect(screen.getByText("Add a Tableau project")).toBeTruthy();
    expect(screen.getByText(/not a measure of your ability or hiring chances/i)).toBeTruthy();
    expect(container.querySelector('svg[aria-label^="Category evidence profile"]')).toBeTruthy();
  });

  it("renders separately verified project and experience cards without invented scores", () => {
    view({ currentRoadmapId: "r1", analysis: {
      ...ANALYSIS,
      scoreReport: SCORE_REPORT,
      projectReviews: [{ title: "Inventory system", summary: "Tracked stock across locations.", score: 62,
        technologies: ["Spring Boot", "React"], foundChecks: ["project_purpose", "project_stack"],
        missingChecks: ["project_testing", "project_deployment"],
        evidence: { quote: "Built an inventory system with Spring Boot and React.", page: 1 },
        bulletRewrite: { before: "Built an inventory system.", after: "Built a Spring Boot inventory system; add a measured outcome.", page: 1 } }],
      experienceReviews: [{ title: "Software developer intern", summary: "Built API integrations.", score: 45,
        technologies: [], foundChecks: ["experience_actions"], missingChecks: ["experience_results"],
        evidence: null, bulletRewrite: null }],
    } });
    expect(screen.getByRole("heading", { name: "Projects" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Experience" })).toBeTruthy();
    expect(screen.getByText("Inventory system")).toBeTruthy();
    expect(screen.getByText("Software developer intern")).toBeTruthy();
    expect(screen.getByText("Spring Boot")).toBeTruthy();
    expect(screen.getByText("Testing is documented")).toBeTruthy();
    expect(screen.getByText("Built a Spring Boot inventory system; add a measured outcome.")).toBeTruthy();
    expect(screen.getByText("62")).toBeTruthy();
  });
});
