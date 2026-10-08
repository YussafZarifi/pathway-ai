import { Link } from "react-router-dom";
import { CheckCircle2, CircleDashed, Lightbulb, Sparkles, Target } from "lucide-react";
import { SECTION_LABELS } from "../../lib/resume";

function SkillChips({ title, skills, tone, icon }) {
  return (
    <div className="resumeSkillGroup">
      <h4 className="resumeSubhead">{title}</h4>
      {skills.length ? (
        <ul className="resumeChips">
          {skills.map((skill) => (
            <li key={skill} className={`resumeChip resumeChip--${tone}`}>
              {icon}
              {skill}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dashMuted resumeNone">None listed</p>
      )}
    </div>
  );
}

// One saved review, rendered from the validated analysis (ADR-020). No
// score: the review is labelled as AI feedback, not a measurement. Gaps of a
// review made against the current roadmap link to the step that covers them.
export default function AnalysisView({ analysis, currentRoadmapId }) {
  const linkSteps = Boolean(currentRoadmapId) && analysis.roadmapId === currentRoadmapId;
  const bySection = analysis.suggestions.reduce((acc, s) => {
    (acc[s.section] ||= []).push(s.text);
    return acc;
  }, {});

  return (
    <div className="resumeAnalysis">
      <p className="resumeSummary">
        <span className="resumeAiTag">
          <Sparkles size={13} aria-hidden="true" /> AI review
        </span>
        {analysis.summary}
      </p>

      <div className="resumeSkills">
        <SkillChips
          title="Shown on your résumé"
          skills={analysis.matchedSkills}
          tone="matched"
          icon={<CheckCircle2 size={13} aria-hidden="true" />}
        />
        <SkillChips
          title="Not shown yet"
          skills={analysis.missingSkills}
          tone="missing"
          icon={<CircleDashed size={13} aria-hidden="true" />}
        />
      </div>

      {analysis.strengths.length > 0 && (
        <section className="resumeBlock">
          <h4 className="resumeSubhead">Strengths</h4>
          <ul className="resumeList">
            {analysis.strengths.map((text) => (
              <li key={text}>
                <CheckCircle2 size={15} className="resumeListIcon resumeListIcon--good" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.gaps.length > 0 && (
        <section className="resumeBlock">
          <h4 className="resumeSubhead">Gaps to close</h4>
          <ul className="resumeGaps">
            {analysis.gaps.map((gap) => (
              <li key={gap.skill} className="resumeGap">
                <div className="resumeGapHead">
                  <Target size={15} aria-hidden="true" />
                  <span className="resumeGapSkill">{gap.skill}</span>
                  {gap.relatedStep &&
                    (linkSteps ? (
                      <Link className="stepChip resumeStepLink" to={`/dashboard#step-${gap.relatedStep}`}>
                        Roadmap step {gap.relatedStep}
                      </Link>
                    ) : (
                      <span className="stepChip">Roadmap step {gap.relatedStep}</span>
                    ))}
                </div>
                {gap.why && <p className="resumeGapText">{gap.why}</p>}
                {gap.howToClose && (
                  <p className="resumeGapText">
                    <strong>Next: </strong>
                    {gap.howToClose}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.suggestions.length > 0 && (
        <section className="resumeBlock">
          <h4 className="resumeSubhead">Suggested edits</h4>
          <ul className="resumeList">
            {Object.entries(bySection).map(([section, texts]) =>
              texts.map((text) => (
                <li key={`${section}-${text}`}>
                  <Lightbulb size={15} className="resumeListIcon" aria-hidden="true" />
                  <span>
                    <span className="resumeSection">{SECTION_LABELS[section]}</span> {text}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
