import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  CircleHelp,
  CircleX,
  Lightbulb,
  Map,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { SECTION_LABELS } from "../../lib/resume";

function ScoreGauge({ score }) {
  const radius = 61;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="resumeScoreGauge" role="img" aria-label={`Resume evidence score: ${progress} out of 100`}>
      <svg viewBox="0 0 148 148" aria-hidden="true">
        <circle className="resumeGaugeTrack" cx="74" cy="74" r={radius} />
        <circle
          className="resumeGaugeValue"
          cx="74"
          cy="74"
          r={radius}
          strokeDasharray={`${circumference * progress / 100} ${circumference}`}
          transform="rotate(-90 74 74)"
        />
      </svg>
      <span className="resumeGaugeText"><strong>{progress}</strong><small>/ 100</small></span>
    </div>
  );
}

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
  return (
    <svg className="resumeRadar" viewBox="0 0 180 180" role="img" aria-label={`Category evidence profile: ${categories.map((item) => `${item.label} ${item.score} percent`).join(", ")}`}>
      {[17, 34, 51, 68].map((radius) => <circle key={radius} cx="90" cy="90" r={radius} />)}
      {spokes}
      <polygon points={points} />
    </svg>
  );
}

function EvidenceStatus({ criterion }) {
  return (
    <li className={`resumeEvidenceRow ${criterion.found ? "is-found" : "is-missing"}`}>
      <span className="resumeEvidenceMark" aria-hidden="true">
        {criterion.found ? <Check size={13} /> : <CircleX size={13} />}
      </span>
      <div className="resumeEvidenceCopy">
        <div className="resumeEvidenceTitle">
          <strong>{criterion.label}</strong>
          <span>{criterion.points} / {criterion.max_points} pts</span>
        </div>
        {criterion.evidence?.length ? criterion.evidence.map((evidence, index) => (
          <blockquote key={`${criterion.id}-${index}`}>
            “{evidence.quote}” <cite>Page {evidence.page}</cite>
          </blockquote>
        )) : <p>{criterion.note || "No supporting evidence was found in the extracted resume text."}</p>}
      </div>
    </li>
  );
}

function CategoryCard({ category }) {
  return (
    <details className="resumeCategory" open={["skills", "projects", "ats"].includes(category.id)}>
      <summary>
        <span className="resumeCategoryTitle"><strong>{category.label}</strong><small>{category.weight} points available</small></span>
        <span className="resumeCategoryScore"><strong>{category.earned}</strong><small> / {category.weight}</small></span>
        <span className="resumeCategoryBar" aria-hidden="true"><span style={{ width: `${category.score}%` }} /></span>
        <span className="resumeCategoryToggle" aria-hidden="true">+</span>
      </summary>
      <ul className="resumeEvidenceList">
        {category.criteria.map((criterion) => <EvidenceStatus key={criterion.id} criterion={criterion} />)}
      </ul>
    </details>
  );
}

function SkillMatch({ category, reportId }) {
  if (!category) return null;
  const found = category.criteria.filter((criterion) => criterion.found);
  const missing = category.criteria.filter((criterion) => !criterion.found);
  return <section className="resumeReportSection resumeSkillMatchPanel" aria-labelledby={`resumeSkillMatchHeading-${reportId}`}>
    <div className="resumeSectionHeading"><span className="resumeSectionIcon"><BadgeCheck size={17} aria-hidden="true" /></span><div><p>ROLE-SPECIFIC SKILLS</p><h3 id={`resumeSkillMatchHeading-${reportId}`}>Skill match</h3></div></div>
    <div className="resumeSkillMatchGroups">
      <div><h4>Evidence found <span>{found.length}</span></h4>{found.length
        ? <ul>{found.map((criterion) => <li className="is-found" key={criterion.id}><Check size={13} aria-hidden="true" />{criterion.label}</li>)}</ul>
        : <p>No target skills were evidenced in the extracted resume text.</p>}</div>
      <div><h4>Not evidenced yet <span>{missing.length}</span></h4>{missing.length
        ? <ul>{missing.map((criterion) => <li className="is-missing" key={criterion.id}><CircleX size={13} aria-hidden="true" />{criterion.label}</li>)}</ul>
        : <p>Every target skill has supporting resume evidence.</p>}</div>
    </div>
    <p className="resumeReportNote">“Not evidenced” means the PDF text did not support the criterion; it is not a claim that you lack the skill.</p>
  </section>;
}

function Readiness({ readiness }) {
  const labels = [
    ["internship", "Internship", "Entry-level roles"],
    ["junior", "Junior", "Early-career roles"],
    ["mid_level", "Mid-level", "Experienced roles"],
  ];
  return (
    <div className="resumeReadinessGrid">
      {labels.map(([key, label, hint]) => {
        const value = Number(readiness[key]) || 0;
        return <div className="resumeReadinessItem" key={key}>
          <div><strong>{label}</strong><span>{value}%</span></div>
          <progress max="100" value={value} aria-label={`${label} resume evidence coverage`} />
          <small>{hint} · evidence coverage</small>
        </div>;
      })}
    </div>
  );
}

function RoadmapAlignment({ roadmap, linkSteps }) {
  const steps = roadmap?.steps || [];
  return (
    <section className="resumeReportSection resumeRoadmapSection" aria-labelledby="resumeRoadmapHeading">
      <div className="resumeSectionHeading">
        <span className="resumeSectionIcon"><Map size={17} aria-hidden="true" /></span>
        <div><p>YOUR LEARNING PLAN</p><h3 id="resumeRoadmapHeading">Roadmap alignment</h3></div>
      </div>
      {steps.length ? <ol className="resumeRoadmapSteps">
        {steps.map((step) => <li className={`resumeRoadmapStep is-${step.status}`} key={step.position}>
          <span className="resumeRoadmapDot" aria-hidden="true">{step.status === "completed" ? <Check size={12} /> : step.position}</span>
          <span><strong>{step.title}</strong><small>{step.status === "in_progress" ? "In progress" : step.status === "completed" ? "Completed" : "Not started"}</small></span>
          {linkSteps && <Link to={`/dashboard#step-${step.position}`} aria-label={`Open roadmap step ${step.position}`}><ArrowUpRight size={15} /></Link>}
        </li>)}
      </ol> : <p className="resumeReportNote">No roadmap steps were available when this report was created.</p>}
      {roadmap?.skills?.length > 0 && <div className="resumeRoadmapSkills">
        <h4>Career skills in your roadmap</h4>
        <ul>{roadmap.skills.map((skill) => <li key={skill.skill} className={skill.found ? "is-found" : "is-missing"}>
          <span>{skill.found ? <Check size={13} /> : <CircleHelp size={13} />}</span>
          <strong>{skill.skill}</strong>
          <small>{skill.found ? "Evidence found" : "Not evidenced yet"}</small>
          {skill.roadmap_steps?.length > 0 && <small className="resumeSkillStep">Step {skill.roadmap_steps.join(", ")}</small>}
        </li>)}</ul>
      </div>}
    </section>
  );
}

function ScoreReport({ analysis, currentRoadmapId }) {
  const report = analysis.scoreReport;
  const categories = report.categories || [];
  const strengths = categories.flatMap((category) => category.criteria
    .filter((criterion) => criterion.found)
    .map((criterion) => ({ category: category.label, categoryId: category.id, ...criterion })))
    .sort((a, b) => ({ projects: 0, experience: 1, skills: 2, education: 3, formatting: 4, ats: 5 }[a.categoryId]
      - ({ projects: 0, experience: 1, skills: 2, education: 3, formatting: 4, ats: 5 }[b.categoryId]))).slice(0, 4);
  const gaps = categories.flatMap((category) => category.criteria
    .filter((criterion) => !criterion.found)
    .map((criterion) => ({ category: category.label, categoryId: category.id, ...criterion })))
    .sort((a, b) => ({ projects: 0, experience: 1, formatting: 2, ats: 3, skills: 4, education: 5 }[a.categoryId]
      - ({ projects: 0, experience: 1, formatting: 2, ats: 3, skills: 4, education: 5 }[b.categoryId]))).slice(0, 4);
  const linkSteps = Boolean(currentRoadmapId) && analysis.roadmapId === currentRoadmapId;
  const confidence = report.confidence || {};
  const skillCategory = categories.find((item) => item.id === "skills");
  const insufficient = report.status === "insufficient_evidence";
  const recommendations = report.recommendations?.length
    ? report.recommendations.slice(0, 3)
    : (report.insufficient_reasons || []).slice(0, 3).map((reason, index) => ({
      title: ["Add readable résumé content", "Show two or more core sections", "Include specific, verifiable examples"][index] || "Add more evidence",
      action: reason,
    }));

  return <div className="resumeScoreReport">
    <section className={`resumeScoreHero ${insufficient ? "is-insufficient" : ""}`} aria-labelledby={`resumeScoreTitle-${analysis.id}`}>
      <div className="resumeScoreIntro">
        <div className="resumeScoreTag"><Sparkles size={13} aria-hidden="true" /> CAREER-SPECIFIC REVIEW</div>
        <h3 id={`resumeScoreTitle-${analysis.id}`}>{insufficient ? "Not enough content to score reliably" : "Resume evidence score"}</h3>
        <p>{insufficient
          ? "This document did not provide enough readable, verifiable résumé evidence. No competitive score has been assigned."
          : <>Compared with the <strong>{analysis.career}</strong> rubric. The score uses verified résumé evidence, not a model-generated rating.</>}</p>
        <div className="resumeScoreConfidence"><ShieldCheck size={15} aria-hidden="true" /><span><strong>{String(confidence.level || "Review").replaceAll("_", " ")} confidence{Number.isFinite(confidence.score) ? ` · ${confidence.score}/100` : ""}</strong>{confidence.reason && <small>{confidence.reason}</small>}</span></div>
      </div>
      <div className="resumeScoreMain">
        {insufficient ? <div className="resumeNoScoreState"><CircleHelp size={25} aria-hidden="true" /><strong>Not scored</strong></div>
          : <ScoreGauge score={report.overall} />}
        <div><span className="resumeScoreLabel">{insufficient ? "Insufficient evidence" : report.rubric?.label || "Career-specific rubric"}</span>
          {!insufficient && <span className="resumeScoreSub">out of 100 · backend-computed</span>}</div>
      </div>
      <div className="resumeScoreQuickStats">
        <div><span>{insufficient ? "What to add" : "ATS evidence"}</span>
          <strong>{insufficient ? "Skills · projects" : `${report.ats?.score ?? 0}`} {!insufficient && <small>/ 100</small>}</strong>
          <p>{insufficient ? "Experience · education" : "Structure and contextual keywords"}</p></div>
      </div>
      <p className="resumeScoreDisclaimer">A document review, not a measure of your ability or hiring chances.</p>
    </section>

    {analysis.summary && <p className="resumeScoreSummary"><Sparkles size={15} aria-hidden="true" />{analysis.summary}</p>}

    <section className="resumeReportSection resumeRecommendations" aria-labelledby={`resumeRecommendationsHeading-${analysis.id}`}>
      <div className="resumeSectionHeading"><span className="resumeSectionIcon"><Lightbulb size={17} aria-hidden="true" /></span><div><p>WHAT TO FIX FIRST</p><h3 id={`resumeRecommendationsHeading-${analysis.id}`}>Priority improvements</h3></div></div>
      {recommendations.length ? <ol className="resumePriorityList">{recommendations.map((item, index) => <li key={`${item.title}-${index}`}><span className="resumePriorityNumber">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><p>{item.action}</p></div></li>)}</ol> : <p className="resumeReportNote">No high-priority changes were identified.</p>}
    </section>

    <div className="resumeScoreOverview resumeInsightGrid">
      <section className="resumeReportSection resumeInsightPanel is-strength" aria-labelledby={`resumeStrengthHeading-${analysis.id}`}>
        <div className="resumeSectionHeading"><span className="resumeSectionIcon"><Check size={17} aria-hidden="true" /></span><div><p>VERIFIED IN YOUR RÉSUMÉ</p><h3 id={`resumeStrengthHeading-${analysis.id}`}>Strengths</h3></div></div>
        {strengths.length ? <ul className="resumeInsightList">{strengths.slice(0, 3).map((item) => <li key={item.id}><strong>{item.label}</strong><small>{item.note}</small></li>)}</ul> : <p className="resumeReportNote">No strengths could be verified from this document.</p>}
      </section>
      <section className="resumeReportSection resumeInsightPanel is-gap" aria-labelledby={`resumeGapHeading-${analysis.id}`}>
        <div className="resumeSectionHeading"><span className="resumeSectionIcon"><ArrowDownRight size={17} aria-hidden="true" /></span><div><p>OPPORTUNITIES TO STRENGTHEN</p><h3 id={`resumeGapHeading-${analysis.id}`}>Main gaps</h3></div></div>
        {gaps.length ? <ul className="resumeInsightList">{gaps.slice(0, 3).map((item) => <li key={item.id}><strong>{item.label}</strong><small>{item.note}</small></li>)}</ul> : <p className="resumeReportNote">No major evidence gaps were identified.</p>}
      </section>
    </div>

    {skillCategory && <section className="resumeReportSection resumeMissingSkills" aria-labelledby={`resumeMissingHeading-${analysis.id}`}>
      <div className="resumeSectionHeading"><span className="resumeSectionIcon"><Target size={17} aria-hidden="true" /></span><div><p>ROLE KEYWORDS</p><h3 id={`resumeMissingHeading-${analysis.id}`}>Skills to evidence</h3></div></div>
      <p>{skillCategory.criteria.filter((item) => !item.found).slice(0, 6).map((item) => item.label).join(" · ") || "All roadmap skills had supporting evidence."}</p>
      <small>Not evidenced means the document did not support the skill; it is not a claim that you lack it.</small>
    </section>}

    <details className="resumeMoreDetails">
      <summary>Evidence, ATS, and roadmap details</summary>
      <div className="resumeMoreDetailsBody">
        <div className="resumeScoreOverview">
          <section className="resumeReportSection resumeRadarPanel" aria-labelledby={`resumeRadarHeading-${analysis.id}`}>
            <div className="resumeSectionHeading"><span className="resumeSectionIcon"><Target size={17} aria-hidden="true" /></span><div><p>SCORING DETAIL</p><h3 id={`resumeRadarHeading-${analysis.id}`}>Evidence profile</h3></div></div>
            <div className="resumeRadarLayout"><RadarChart categories={categories} /><ul className="resumeRadarLegend">{categories.map((category) => <li key={category.id}><span>{category.label}</span><strong>{category.score}%</strong></li>)}</ul></div>
          </section>
          <section className="resumeReportSection resumeReadinessPanel" aria-labelledby={`resumeReadinessHeading-${analysis.id}`}>
            <div className="resumeSectionHeading"><span className="resumeSectionIcon"><BriefcaseBusiness size={17} aria-hidden="true" /></span><div><p>ROLE COVERAGE</p><h3 id={`resumeReadinessHeading-${analysis.id}`}>Readiness signals</h3></div></div>
            <Readiness readiness={report.readiness || {}} />
            <p className="resumeReportNote">Evidence coverage only; not hiring predictions.</p>
          </section>
        </div>
        <SkillMatch category={skillCategory} reportId={analysis.id} />
        <section className="resumeReportSection resumeCategorySection" aria-labelledby={`resumeCategoryHeading-${analysis.id}`}>
          <div className="resumeSectionHeading"><span className="resumeSectionIcon"><BadgeCheck size={17} aria-hidden="true" /></span><div><p>TRACEABLE POINTS</p><h3 id={`resumeCategoryHeading-${analysis.id}`}>Career rubric and source evidence</h3></div></div>
          <div className="resumeCategoryGrid">{categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div>
          <p className="resumeReportNote">Short cited excerpts are verified against the uploaded PDF text. The original file and full text are not stored.</p>
        </section>
        <RoadmapAlignment roadmap={report.roadmap} linkSteps={linkSteps} />
      </div>
    </details>
  </div>;
}

function LegacyAnalysis({ analysis, currentRoadmapId }) {
  const linkSteps = Boolean(currentRoadmapId) && analysis.roadmapId === currentRoadmapId;
  const bySection = analysis.suggestions.reduce((acc, suggestion) => {
    (acc[suggestion.section] ||= []).push(suggestion.text);
    return acc;
  }, {});
  return <div className="resumeAnalysis">
    <section className="resumeSummary"><div className="resumeAiTag"><Sparkles size={13} aria-hidden="true" /> Previous review</div><h3>Your rÃ©sumÃ© at a glance</h3><p>{analysis.summary}</p></section>
    <div className="resumeReportGrid">
      <section className="resumePanel"><h3>Strengths</h3><ul className="resumeStrengthList">{analysis.strengths.map((text) => <li key={text}>{text}</li>)}</ul></section>
      <section className="resumePanel"><h3>Skills in your resume</h3><p><strong>Found:</strong> {analysis.matchedSkills.join(", ") || "None listed"}</p><p><strong>To explore:</strong> {analysis.missingSkills.join(", ") || "None listed"}</p></section>
      <section className="resumePanel resumeAlignment"><h3>Recommended improvements</h3>{analysis.gaps.map((gap) => <div className="resumeGap" key={`${gap.skill}-${gap.relatedStep}`}><strong>{gap.skill}</strong><p>{gap.why}</p><p>{gap.howToClose}</p>{gap.relatedStep && (linkSteps ? <Link to={`/dashboard#step-${gap.relatedStep}`} aria-label={`Roadmap step ${gap.relatedStep}`}>Roadmap step {gap.relatedStep}</Link> : <span>Roadmap step {gap.relatedStep}</span>)}</div>)}</section>
      <section className="resumePanel"><h3>Recruiter suggestions</h3>{Object.entries(bySection).map(([section, suggestions]) => <div key={section}><strong>{SECTION_LABELS[section]}</strong>{suggestions.map((text) => <p key={text}>{text}</p>)}</div>)}</section>
    </div>
    <p className="resumeReportNote">This earlier review predates the evidence-based scoring rubric.</p>
  </div>;
}

// A score report is displayed only when it was computed and persisted by the backend.
export default function AnalysisView({ analysis, currentRoadmapId }) {
  return analysis.scoreReport
    ? <ScoreReport analysis={analysis} currentRoadmapId={currentRoadmapId} />
    : <LegacyAnalysis analysis={analysis} currentRoadmapId={currentRoadmapId} />;
}
