import { Flag, Hourglass, Sparkles } from "lucide-react";
import RadialMeter from "../RadialMeter";
import { formatWeeksRange } from "../../lib/dashboardData";

// Answers "what am I pursuing, how far along am I, what's next" at a glance.
export default function DashboardHero({ career, careerData, summary, remaining, motivation, nextStep }) {
  const skills = Array.isArray(careerData?.skills) ? careerData.skills.slice(0, 5) : [];
  const match = Number.isFinite(careerData?.match_score) ? careerData.match_score : null;

  return (
    <section className="dashCard dashHero" aria-labelledby="dashCareerTitle">
      <div className="dashHeroRing">
        <RadialMeter
          value={summary.percent}
          size={148}
          strokeWidth={11}
          suffix="%"
          hero
          ariaLabel={`Roadmap ${summary.percent}% complete`}
        />
        <span className="dashHeroRingLabel">
          {summary.done} of {summary.total} steps
        </span>
      </div>

      <div className="dashHeroBody">
        <div className="dashEyebrow">Pursuing</div>
        <h1 id="dashCareerTitle" className="dashHeroTitle" tabIndex={-1}>
          {career}
        </h1>

        {match != null && (
          <div className="dashHeroBadges">
            <span className="dashBadge dashBadge--accent">
              <Sparkles size={13} aria-hidden="true" />
              {match}% AI match
            </span>
          </div>
        )}

        <p className="dashHeroMotivation">{motivation}</p>

        <dl className="dashHeroFacts">
          <div className="dashHeroFact">
            <dt>
              <Flag size={14} aria-hidden="true" /> Next milestone
            </dt>
            <dd>{nextStep ? nextStep.title : "All steps done"}</dd>
          </div>
          <div className="dashHeroFact">
            <dt>
              <Hourglass size={14} aria-hidden="true" /> Time left
            </dt>
            <dd>
              {summary.complete
                ? "None"
                : remaining
                  ? `~${formatWeeksRange(remaining)}`
                  : "No estimate"}
              {!summary.complete && remaining && <span className="dashMuted"> · AI estimate</span>}
            </dd>
          </div>
        </dl>

        {skills.length > 0 && (
          <ul className="dashSkillTags" aria-label="Skills in this career">
            {skills.map((skill) => (
              <li key={skill} className="dashSkillTag">
                {skill}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
