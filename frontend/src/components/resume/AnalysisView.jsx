import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Lightbulb,
  Map,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { SECTION_LABELS } from "../../lib/resume";

function SkillGroup({ title, skills, tone, icon }) {
  return (
    <section className={`resumeSkillGroup resumeSkillGroup--${tone}`}>
      <div className="resumePanelLabel">
        {icon}
        <h4>{title}</h4>
      </div>
      {skills.length ? (
        <ul className="resumeChips">
          {skills.map((skill) => <li className="resumeChip" key={skill}>{skill}</li>)}
        </ul>
      ) : (
        <p className="resumeNone">No specific skills called out in this category.</p>
      )}
    </section>
  );
}

function PanelHeading({ icon, eyebrow, title, count, id }) {
  return (
    <div className="resumePanelHeading">
      <span className="resumePanelIcon" aria-hidden="true">{icon}</span>
      <div className="resumePanelHeadingCopy">
        <p className="resumePanelEyebrow">{eyebrow}</p>
        <h3 id={id}>{title}</h3>
      </div>
      {typeof count === "number" && <span className="resumePanelCount">{count}</span>}
    </div>
  );
}

// One saved review, rendered from the validated analysis (ADR-020). Feedback
// stays qualitative: no score is derived from this report.
export default function AnalysisView({ analysis, currentRoadmapId }) {
  const linkSteps = Boolean(currentRoadmapId) && analysis.roadmapId === currentRoadmapId;
  const bySection = analysis.suggestions.reduce((acc, suggestion) => {
    (acc[suggestion.section] ||= []).push(suggestion.text);
    return acc;
  }, {});

  return (
    <div className="resumeAnalysis">
      <section className="resumeSummary" aria-labelledby={`resumeSummary-${analysis.id}`}>
        <div className="resumeSummaryTopline">
          <span className="resumeAiTag"><Sparkles size={13} aria-hidden="true" /> AI-generated review</span>
          <span className="resumeReviewDisclaimer"><ShieldCheck size={13} aria-hidden="true" /> Qualitative feedback</span>
        </div>
        <h3 id={`resumeSummary-${analysis.id}`}>Your résumé at a glance</h3>
        <p>{analysis.summary}</p>
      </section>

      <div className="resumeReportGrid">
        <section className="resumePanel resumePanel--strengths" aria-labelledby={`resumeStrengths-${analysis.id}`}>
          <PanelHeading
            id={`resumeStrengths-${analysis.id}`}
            icon={<CheckCircle2 size={17} />}
            eyebrow="WHAT'S WORKING"
            title="Strengths"
            count={analysis.strengths.length}
          />
          {analysis.strengths.length ? (
            <ul className="resumeStrengthList">
              {analysis.strengths.map((strength) => (
                <li key={strength}><CheckCircle2 size={15} aria-hidden="true" /><span>{strength}</span></li>
              ))}
            </ul>
          ) : (
            <p className="resumeNone">No specific strengths were returned for this review.</p>
          )}
        </section>

        <section className="resumePanel resumePanel--skills" aria-label="Skills match">
          <PanelHeading icon={<Target size={17} />} eyebrow="ROLE ALIGNMENT" title="Skills in view" />
          <div className="resumeSkillColumns">
            <SkillGroup title="Shown on your résumé" skills={analysis.matchedSkills} tone="matched" icon={<CheckCircle2 size={14} aria-hidden="true" />} />
            <SkillGroup title="Missing or not shown yet" skills={analysis.missingSkills} tone="missing" icon={<CircleDashed size={14} aria-hidden="true" />} />
          </div>
        </section>
      </div>

      <section className="resumePanel resumeAlignment" aria-labelledby={`resumeAlignment-${analysis.id}`}>
        <PanelHeading
          id={`resumeAlignment-${analysis.id}`}
          icon={<Map size={17} />}
          eyebrow="CONNECT FEEDBACK TO ACTION"
          title="Roadmap alignment"
          count={analysis.gaps.length}
        />
        <p className="resumePanelIntro">Skills to build next, with the most relevant step from your learning plan.</p>
        {analysis.gaps.length ? (
          <ul className="resumeGaps">
            {analysis.gaps.map((gap) => (
              <li key={gap.skill} className="resumeGap">
                <div className="resumeGapHead">
                  <span className="resumeGapMarker"><Target size={15} aria-hidden="true" /></span>
                  <h4 className="resumeGapSkill">{gap.skill}</h4>
                  {gap.relatedStep && (linkSteps ? (
                    <Link className="resumeStepLink" to={`/dashboard#step-${gap.relatedStep}`}>
                      Roadmap step {gap.relatedStep}<ArrowUpRight size={13} aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="resumeStepLink resumeStepLink--static">Roadmap step {gap.relatedStep}</span>
                  ))}
                </div>
                <div className="resumeGapDetails">
                  {gap.why && <p><span>Why it matters</span>{gap.why}</p>}
                  {gap.howToClose && <p><span>Suggested next step</span>{gap.howToClose}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="resumeNone">No roadmap gaps were identified in this review.</p>
        )}
      </section>

      <section className="resumePanel resumeRecommendations" aria-labelledby={`resumeSuggestions-${analysis.id}`}>
        <PanelHeading
          id={`resumeSuggestions-${analysis.id}`}
          icon={<Lightbulb size={17} />}
          eyebrow="READY TO USE"
          title="Recommended edits"
          count={analysis.suggestions.length}
        />
        {analysis.suggestions.length ? (
          <ul className="resumeSuggestionList">
            {Object.entries(bySection).map(([section, suggestions]) => suggestions.map((text) => (
              <li key={`${section}-${text}`}>
                <span className="resumeSuggestionIcon"><Lightbulb size={15} aria-hidden="true" /></span>
                <p><span>{SECTION_LABELS[section]}</span>{text}</p>
              </li>
            )))}
          </ul>
        ) : (
          <p className="resumeNone">No specific edits were suggested for this report.</p>
        )}
      </section>
    </div>
  );
}
