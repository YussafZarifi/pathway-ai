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
    .map((criterion) => ({ category: category.label, ...criterion }))).slice(0, 4);
  const gaps = categories.flatMap((category) => category.criteria
    .filter((criterion) => !criterion.found)
    .map((criterion) => ({ category: category.label, ...criterion }))).slice(0, 4);
  const linkSteps = Boolean(currentRoadmapId) && analysis.roadmapId === currentRoadmapId;
  const confidence = report.confidence || {};
  const skillCategory = categories.find((item) => item.id === "skills");

  return <div className="resumeScoreReport">
    <section className="resumeScoreHero" aria-labelledby={`resumeScoreTitle-${analysis.id}`}>
      <div className="resumeScoreIntro">
        <div className="resumeScoreTag"><Sparkles size={13} aria-hidden="true" /> EVIDENCE-BASED REVIEW</div>
        <h3 id={`resumeScoreTitle-${analysis.id}`}>A clearer view of your next step</h3>
        <p>Compared with the <strong>{analysis.career}</strong> rubric and your PathwayAI roadmap. Every point comes from a cited resume finding.</p>
        <div className="resumeScoreConfidence"><ShieldCheck size={15} aria-hidden="true" /><span><strong>{confidence.level || "Review"} confidence</strong>{confidence.reason && <small>{confidence.reason}</small>}</span></div>
      </div>
      <div className="resumeScoreMain">
        <ScoreGauge score={report.overall} />
        <div><span className="resumeScoreLabel">Resume evidence score</span><span className="resumeScoreSub">{report.rubric?.label || "Career-specific rubric"} · out of 100</span></div>
      </div>
      <div className="resumeScoreQuickStats">
        <div><span>ATS readiness</span><strong>{report.ats?.score ?? 0}<small> / 100</small></strong><p>Parsing and keyword evidence</p></div>
        <div><span>Rubric categories</span><strong>{categories.length}</strong><p>Weighted, career-specific checks</p></div>
      </div>
      <p className="resumeScoreDisclaimer">This measures evidence in the document, not your abilities or your chance of being hired.</p>
    </section>

    <div className="resumeScoreOverview">
      <section className="resumeReportSection resumeRadarPanel" aria-labelledby={`resumeRadarHeading-${analysis.id}`}>
        <div className="resumeSectionHeading"><span className="resumeSectionIcon"><Target size={17} aria-hidden="true" /></span><div><p>AT A GLANCE</p><h3 id={`resumeRadarHeading-${analysis.id}`}>Evidence profile</h3></div></div>
        <div className="resumeRadarLayout"><RadarChart categories={categories} /><ul className="resumeRadarLegend">{categories.map((category) => <li key={category.id}><span>{category.label}</span><strong>{category.score}%</strong></li>)}</ul></div>
      </section>
      <section className="resumeReportSection resumeReadinessPanel" aria-labelledby={`resumeReadinessHeading-${analysis.id}`}>
        <div className="resumeSectionHeading"><span className="resumeSectionIcon"><BriefcaseBusiness size={17} aria-hidden="true" /></span><div><p>ROLE COVERAGE</p><h3 id={`resumeReadinessHeading-${analysis.id}`}>Hiring readiness signals</h3></div></div>
        <Readiness readiness={report.readiness || {}} />
        <p className="resumeReportNote">These percentages show coverage across different experience rubrics; they are not hiring predictions.</p>
      </section>
    </div>

    <SkillMatch category={skillCategory} reportId={analysis.id} />

    <section className="resumeReportSection resumeCategorySection" aria-labelledby={`resumeCategoryHeading-${analysis.id}`}>
      <div className="resumeSectionHeading"><span className="resumeSectionIcon"><BadgeCheck size={17} aria-hidden="true" /></span><div><p>POINTS YOU CAN TRACE</p><h3 id={`resumeCategoryHeading-${analysis.id}`}>Career rubric breakdown</h3></div></div>
      <div className="resumeCategoryGrid">{categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div>
      <p className="resumeReportNote">A category earns equal portions of its weight for each criterion supported by the resume. Missing evidence means no points for that criterion; it does not mean you lack that skill.</p>
    </section>

    <div className="resumeScoreOverview resumeInsightGrid">
      <section className="resumeReportSection resumeInsightPanel is-strength" aria-labelledby={`resumeStrengthHeading-${analysis.id}`}>
        <div className="resumeSectionHeading"><span className="resumeSectionIcon"><Check size={17} aria-hidden="true" /></span><div><p>BACKED BY YOUR RESUME</p><h3 id={`resumeStrengthHeading-${analysis.id}`}>Strengths</h3></div></div>
        {strengths.length ? <ul className="resumeInsightList">{strengths.map((item) => <li key={item.id}><strong>{item.label}</strong><small>{item.evidence?.[0]?.quote || item.note}</small></li>)}</ul> : <p className="resumeReportNote">No criteria in this rubric had enough evidence to earn points yet.</p>}
      </section>
      <section className="resumeReportSection resumeInsightPanel is-gap" aria-labelledby={`resumeGapHeading-${analysis.id}`}>
        <div className="resumeSectionHeading"><span className="resumeSectionIcon"><ArrowDownRight size={17} aria-hidden="true" /></span><div><p>ROOM TO SHOW MORE</p><h3 id={`resumeGapHeading-${analysis.id}`}>Evidence gaps</h3></div></div>
        {gaps.length ? <ul className="resumeInsightList">{gaps.map((item) => <li key={item.id}><strong>{item.label}</strong><small>{item.note}</small><span>{item.max_points} pts available</span></li>)}</ul> : <p className="resumeReportNote">Every rubric criterion has supporting evidence in this report.</p>}
      </section>
    </div>

    <RoadmapAlignment roadmap={report.roadmap} linkSteps={linkSteps} />

    <section className="resumeReportSection resumeRecommendations" aria-labelledby={`resumeRecommendationsHeading-${analysis.id}`}>
      <div className="resumeSectionHeading"><span className="resumeSectionIcon"><Lightbulb size={17} aria-hidden="true" /></span><div><p>HIGHEST-IMPACT NEXT STEPS</p><h3 id={`resumeRecommendationsHeading-${analysis.id}`}>Priority improvements</h3></div></div>
      {report.recommendations?.length ? <ol className="resumePriorityList">{report.recommendations.map((item, index) => <li key={`${item.title}-${index}`}><span className="resumePriorityNumber">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><p>{item.action}</p></div><span className="resumePriorityGain">+{item.potential_points} <small>possible pts</small></span></li>)}</ol> : <p className="resumeReportNote">No additional recommendations were returned for missing criteria.</p>}
      <p className="resumeReportNote">Point gains are the rubric value of the linked missing evidence. They are not guarantees; recommendations may overlap and are not added together.</p>
    </section>

    {analysis.summary && <p className="resumeScoreSummary"><Sparkles size={15} aria-hidden="true" />{analysis.summary}</p>}
    <p className="resumeScorePrivacy"><ShieldCheck size={14} aria-hidden="true" />The original PDF and full extracted text are not stored. Short verified excerpts are saved with this report.</p>
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
