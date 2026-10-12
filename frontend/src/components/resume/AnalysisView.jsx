import { Link } from "react-router-dom";
import { ArrowUpRight, Check, ChevronDown, CircleHelp, FileCheck2, Map, ShieldCheck } from "lucide-react";

function scoreLabel(score) {
  if (score >= 90) return "Excellent evidence";
  if (score >= 80) return "Strong evidence";
  if (score >= 65) return "Good foundation";
  if (score >= 50) return "Developing";
  return "Needs more evidence";
}

const PROJECT_DIMENSIONS = {
  project_purpose: "Purpose is clear",
  project_stack: "Tools are named in context",
  project_complexity: "Technical depth is explained",
  project_architecture: "Architecture is described",
  project_apis: "APIs or integrations are clear",
  project_deployment: "Deployment is stated",
  project_testing: "Testing is documented",
  project_impact: "Impact is demonstrated",
  project_career_fit: "Relevant to the target career",
};

const EXPERIENCE_DIMENSIONS = {
  experience_relevance: "Role relevance is clear",
  experience_ownership: "Ownership is described",
  experience_actions: "Specific actions are used",
  experience_results: "Results are demonstrated",
  experience_transferable: "Transferable skills are shown",
  experience_career_fit: "Relevant to the target career",
};

const DIMENSION_ADVICE = {
  project_purpose: "Explain the user or problem the project serves.",
  project_stack: "Name the frameworks and tools used in this project.",
  project_complexity: "Describe the technical challenge or scale.",
  project_architecture: "Add a sentence about components and data flow.",
  project_apis: "Name the APIs or integrations and what they do.",
  project_deployment: "State where it runs and add a demo link if public.",
  project_testing: "Mention tests or validation you actually performed.",
  project_impact: "Add a result you can support; do not estimate one.",
  project_career_fit: "Connect the project to a skill required for this career.",
  experience_relevance: "Connect the responsibility to the target role.",
  experience_ownership: "Clarify what you owned or delivered yourself.",
  experience_actions: "Lead with a precise verb and name your contribution.",
  experience_results: "Add a measurable outcome when you can substantiate it.",
  experience_transferable: "Show a transferable skill through a specific example.",
  experience_career_fit: "Connect this experience to the target career.",
};

function RadarChart({ categories }) {
  const points = categories.map((category, index) => {
    const angle = (Math.PI * 2 * index) / categories.length - Math.PI / 2;
    const radius = 68 * Math.max(0, Math.min(100, Number(category.score) || 0)) / 100;
    return `${90 + Math.cos(angle) * radius},${90 + Math.sin(angle) * radius}`;
  }).join(" ");
  const spokes = categories.map((category, index) => {
    const angle = (Math.PI * 2 * index) / categories.length - Math.PI / 2;
    return <line key={category.id} x1="90" y1="90" x2={90 + Math.cos(angle) * 68} y2={90 + Math.sin(angle) * 68} />;
  });
  return <svg className="resumeRadar" viewBox="0 0 180 180" role="img"
    aria-label={`Category evidence profile: ${categories.map((item) => `${item.label} ${item.score} percent`).join(", ")}`}>
    {[17, 34, 51, 68].map((radius) => <circle key={radius} cx="90" cy="90" r={radius} />)}
    {spokes}<polygon points={points} />
  </svg>;
}

function CategoryCard({ category }) {
  return <details className="resumeCategory">
    <summary>
      <span className="resumeCategoryTitle"><strong>{category.label}</strong><small>{category.weight} points available</small></span>
      <span className="resumeCategoryScore"><strong>{category.earned}</strong><small> / {category.weight}</small></span>
      <span className="resumeCategoryBar" aria-hidden="true"><span style={{ width: `${category.score}%` }} /></span>
      <ChevronDown size={15} aria-hidden="true" />
    </summary>
    <ul className="resumeEvidenceList">{category.criteria.map((criterion) => <li className="resumeEvidenceRow" key={criterion.id}>
      <span aria-hidden="true">{criterion.found ? <Check size={13} /> : <CircleHelp size={13} />}</span>
      <div><strong>{criterion.label}</strong><small>{criterion.note || (criterion.found ? "Verified in the source PDF." : "Not evidenced in the source PDF.")}</small>
        {criterion.evidence?.map((item, index) => <blockquote key={`${criterion.id}-${index}`}>“{item.quote}” <cite>Page {item.page}</cite></blockquote>)}
      </div>
    </li>)}</ul>
  </details>;
}

function Readiness({ readiness }) {
  const labels = [["internship", "Internship"], ["junior", "Junior"], ["mid_level", "Mid-level"]];
  return <ul className="resumeReadinessList">{labels.map(([key, label]) => <li key={key}>
    <span>{label}</span><progress max="100" value={Number(readiness[key]) || 0} aria-label={`${label} evidence coverage`} />
    <strong>{Number(readiness[key]) || 0}%</strong>
  </li>)}</ul>;
}

function RoadmapAlignment({ roadmap, linkSteps }) {
  const steps = roadmap?.steps || [];
  return <section className="resumeDetailBlock" aria-labelledby="resumeRoadmapHeading">
    <h4 id="resumeRoadmapHeading">Roadmap alignment</h4>
    {steps.length ? <ol className="resumeRoadmapSteps">{steps.map((step) => <li key={step.position}>
      <span>{step.position}</span><strong>{step.title}</strong><small>{step.status.replaceAll("_", " ")}</small>
      {linkSteps && <Link to={`/dashboard#step-${step.position}`} aria-label={`Open roadmap step ${step.position}`}><ArrowUpRight size={15} /></Link>}
    </li>)}</ol> : <p>No roadmap steps were available for this review.</p>}
  </section>;
}

function WorkSampleCard({ item, kind }) {
  const labels = kind === "project" ? PROJECT_DIMENSIONS : EXPERIENCE_DIMENSIONS;
  const found = item.foundChecks.map((id) => labels[id] || id);
  const missing = item.missingChecks.map((id) => ({ id, label: labels[id] || id }));
  return <article className="resumeWorkCard">
    <header className="resumeWorkCardHead"><div><p>{kind === "project" ? "PROJECT" : "EXPERIENCE"}</p><h4>{item.title}</h4></div>
      {item.score !== null && <div className="resumeWorkScore"><strong>{item.score}</strong><span>/100</span></div>}
    </header>
    {item.summary && <p className="resumeWorkSummary">{item.summary}</p>}
    {kind === "project" && item.technologies.length > 0 && <div className="resumeWorkTech">
      <span>Tools evidenced in this project</span><ul>{item.technologies.map((technology) => <li key={technology}>{technology}</li>)}</ul>
    </div>}
    <div className="resumeWorkSignals">
      {found.length > 0 && <section><h5>Strengths</h5><ul>{found.slice(0, 4).map((label) => <li key={label}><Check size={14} aria-hidden="true" />{label}</li>)}</ul></section>}
      {missing.length > 0 && <section><h5>Improve</h5><ul>{missing.slice(0, 4).map(({ id, label }) => <li key={id}>
        <span aria-hidden="true">+</span><div><strong>{label}</strong><small>{DIMENSION_ADVICE[id]}</small></div>
      </li>)}</ul></section>}
    </div>
    {item.bulletRewrite && <details className="resumeRewrite"><summary>See a grounded bullet edit</summary><div>
      <span>Current</span><p>{item.bulletRewrite.before}</p>
      <span>Suggested — verify before using</span><p>{item.bulletRewrite.after}</p>
    </div></details>}
    {item.evidence && <details className="resumeItemEvidence"><summary>View checked source · page {item.evidence.page}</summary>
      <blockquote>“{item.evidence.quote}”</blockquote></details>}
  </article>;
}

function SkillMatch({ category }) {
  if (!category) return null;
  const found = category.criteria.filter((item) => item.found);
  const missing = category.criteria.filter((item) => !item.found);
  return <section className="resumeSkillsSection" aria-label="Career skill evidence">
    <div className="resumeSectionHeading"><div><p>CAREER FIT</p><h3>Skills in your roadmap</h3></div></div>
    <div className="resumeSkillChipGroups">
      <div><h4>Demonstrated</h4>{found.length ? <ul>{found.map((item) => <li className="is-found" key={item.id}><Check size={13} />{item.label}</li>)}</ul> : <p>None verified in context</p>}</div>
      <div><h4>Not evidenced yet</h4>{missing.length ? <ul>{missing.slice(0, 8).map((item) => <li className="is-missing" key={item.id}><span>+</span>{item.label}</li>)}</ul> : <p>All listed skills have supporting evidence</p>}</div>
    </div>
    <p className="resumeReportNote">“Not evidenced” describes the PDF, not your actual ability.</p>
  </section>;
}

function ScoreReport({ analysis, currentRoadmapId }) {
  const report = analysis.scoreReport;
  const id = analysis.id || "latest";
  const categories = report.categories || [];
  const strengths = categories.flatMap((category) => category.criteria
    .filter((criterion) => criterion.found)
    .map((criterion) => ({ ...criterion, categoryId: category.id })))
    .sort((a, b) => ({ projects: 0, experience: 1, skills: 2, education: 3, formatting: 4, ats: 5 }[a.categoryId]
      - ({ projects: 0, experience: 1, skills: 2, education: 3, formatting: 4, ats: 5 }[b.categoryId]))).slice(0, 4);
  const linkSteps = Boolean(currentRoadmapId) && analysis.roadmapId === currentRoadmapId;
  const confidence = report.confidence || {};
  const skillCategory = categories.find((item) => item.id === "skills");
  const insufficient = report.status === "insufficient_evidence";
  const score = Number(report.overall) || 0;
  const recommendations = report.recommendations?.length
    ? report.recommendations.slice(0, 5)
    : (report.insufficient_reasons || []).slice(0, 5).map((action, index) => ({
      title: ["Add readable resume content", "Show core sections", "Include verifiable examples"][index] || "Add more evidence",
      action,
    }));
  const sections = [
    { key: "project", label: "Projects", items: analysis.projectReviews || [] },
    { key: "experience", label: "Experience", items: analysis.experienceReviews || [] },
  ];

  return <div className="resumeScoreReport">
    <section className={`resumeOverview ${insufficient ? "is-insufficient" : ""}`} aria-labelledby={`resumeScoreTitle-${id}`}>
      <div className="resumeOverviewScore"><p>OVERALL SCORE</p>
        <div>{insufficient ? <strong className="resumeNoScore">—</strong> : <strong>{score}</strong>}<span>/100</span></div>
        <b>{insufficient ? "Not scored" : scoreLabel(score)}</b>
      </div>
      <div className="resumeOverviewCopy"><p className="resumeOverviewEyebrow">{analysis.career} · evidence-based review</p>
        <h3 id={`resumeScoreTitle-${id}`}>{insufficient ? "Not enough content to score reliably" : "Your resume, reviewed"}</h3>
        <p>{insufficient
          ? "There is not enough readable, verifiable resume evidence to assign a competitive score."
          : analysis.summary || "Score calculated from verified resume evidence against this career's rubric."}</p>
        <div className="resumeConfidence"><ShieldCheck size={15} aria-hidden="true" /><span>
          <strong>{String(confidence.level || "low").replaceAll("_", " ")} confidence</strong>
          {Number.isFinite(confidence.score) && <small>{confidence.score}/100 evidence confidence</small>}
        </span></div>
      </div>
      <p className="resumeOverviewFootnote">A document review—not a measure of your ability or hiring chances.</p>
    </section>

    <section className="resumeReportSection resumeRecommendations" aria-labelledby={`resumeRecommendationsHeading-${id}`}>
      <div className="resumeSectionHeading"><div><p>START HERE</p><h3 id={`resumeRecommendationsHeading-${id}`}>Top improvements</h3></div>
        <span className="resumeSectionCount">{recommendations.length}</span></div>
      {recommendations.length ? <ol className="resumePriorityList">{recommendations.map((item, index) => <li key={`${item.title}-${index}`}>
        <span className="resumePriorityNumber">{String(index + 1).padStart(2, "0")}</span>
        <div><strong>{item.title}</strong><p>{item.action}</p></div>
      </li>)}</ol> : <p className="resumeReportNote">No priority changes were identified.</p>}
    </section>

    <section className="resumeReportSection resumeStrengthsSection" aria-labelledby={`resumeStrengthHeading-${id}`}>
      <div className="resumeSectionHeading"><div><p>VERIFIED IN THE DOCUMENT</p><h3 id={`resumeStrengthHeading-${id}`}>Strengths</h3></div></div>
      {strengths.length ? <ul className="resumeStrengthChips">{strengths.map((item) => <li key={item.id}><Check size={14} aria-hidden="true" /><span>{item.label}</span></li>)}</ul>
        : <p className="resumeReportNote">No strengths could be verified from this document.</p>}
    </section>

    {sections.map(({ key, label, items }) => <section className="resumeReportSection resumeWorkSection" key={key} aria-labelledby={`${key}ReviewHeading-${id}`}>
      <div className="resumeSectionHeading"><div><p>INDIVIDUAL REVIEW</p><h3 id={`${key}ReviewHeading-${id}`}>{label}</h3></div>
        {items.length > 0 && <span className="resumeSectionCount">{items.length}</span>}</div>
      {items.length ? <div className="resumeWorkGrid">{items.map((item, index) => <WorkSampleCard key={`${item.title}-${index}`} item={item} kind={key} />)}</div>
        : <p className="resumeReportNote">{key === "project"
          ? "No distinct project entry could be reviewed from the extracted text."
          : "No distinct work or internship entry could be reviewed from the extracted text."}</p>}
    </section>)}

    {skillCategory && <SkillMatch category={skillCategory} />}

    <details className="resumeMoreDetails"><summary>Scoring, ATS, source evidence, and roadmap details</summary>
      <div className="resumeMoreDetailsBody">
        <div className="resumeScoreOverview">
          <section className="resumeReportSection resumeRadarPanel"><div className="resumeSectionHeading"><div><p>SCORING DETAIL</p><h3>Evidence profile</h3></div></div>
            <div className="resumeRadarLayout"><RadarChart categories={categories} /><ul className="resumeRadarLegend">{categories.map((category) => <li key={category.id}><span>{category.label}</span><strong>{category.score}%</strong></li>)}</ul></div>
          </section>
          <section className="resumeReportSection resumeReadinessPanel"><div className="resumeSectionHeading"><div><p>ROLE COVERAGE</p><h3>Readiness signals</h3></div></div>
            <Readiness readiness={report.readiness || { internship: 0, junior: 0, mid_level: 0 }} /><p className="resumeReportNote">Evidence coverage only; not hiring predictions.</p>
          </section>
        </div>
        <section className="resumeDetailBlock"><h4>Career rubric and source evidence</h4>
          <div className="resumeCategoryGrid">{categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div>
          <p className="resumeReportNote">Citations are checked against extracted PDF pages. The original file and full text are not stored.</p>
        </section>
        <RoadmapAlignment roadmap={report.roadmap} linkSteps={linkSteps} />
      </div>
    </details>
  </div>;
}

function LegacyAnalysis({ analysis, currentRoadmapId }) {
  const linkSteps = Boolean(currentRoadmapId) && analysis.roadmapId === currentRoadmapId;
  return <div className="resumeLegacyReport">
    <div className="resumeLegacyIntro"><p>Previous review</p><h3>Your resume at a glance</h3><p>{analysis.summary}</p></div>
    <div className="resumeLegacyGrid">
      <section><h4>Strengths</h4><ul>{analysis.strengths.map((text) => <li key={text}>{text}</li>)}</ul></section>
      <section><h4>Skills</h4><p><strong>Found:</strong> {analysis.matchedSkills.join(", ") || "None listed"}</p><p><strong>To explore:</strong> {analysis.missingSkills.join(", ") || "None listed"}</p></section>
      <section><h4>Recommended improvements</h4>{analysis.gaps.map((gap) => <div key={`${gap.skill}-${gap.relatedStep}`}><strong>{gap.skill}</strong><p>{gap.why}</p><p>{gap.howToClose}</p>
        {gap.relatedStep && (linkSteps ? <Link to={`/dashboard#step-${gap.relatedStep}`}>Roadmap step {gap.relatedStep}</Link> : <span>Roadmap step {gap.relatedStep}</span>)}</div>)}</section>
    </div>
    <p className="resumeReportNote">This earlier review predates the evidence-based scoring rubric.</p>
  </div>;
}

export default function AnalysisView({ analysis, currentRoadmapId }) {
  return analysis.scoreReport
    ? <ScoreReport analysis={analysis} currentRoadmapId={currentRoadmapId} />
    : <LegacyAnalysis analysis={analysis} currentRoadmapId={currentRoadmapId} />;
}
