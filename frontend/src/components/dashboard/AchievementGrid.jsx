import { ClipboardCheck, Compass, Map, Footprints, Flag, Trophy, Lock } from "lucide-react";

const ICONS = {
  quiz: <ClipboardCheck size={18} />,
  career: <Compass size={18} />,
  roadmap: <Map size={18} />,
  "first-step": <Footprints size={18} />,
  halfway: <Flag size={18} />,
  complete: <Trophy size={18} />,
};

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// Milestones earned from real events; locked ones show what's needed.
export default function AchievementGrid({ achievements }) {
  const earned = achievements.filter((a) => a.earnedAt).length;

  return (
    <section className="dashCard dashRailCard" aria-labelledby="dashAchievementsTitle">
      <div className="dashRailHead">
        <h2 id="dashAchievementsTitle" className="dashRailTitle">
          Achievements
        </h2>
        <span className="dashMuted">
          {earned} of {achievements.length}
        </span>
      </div>

      <ul className="achievementGrid">
        {achievements.map((a) => (
          <li key={a.id} className={`achievement ${a.earnedAt ? "is-earned" : "is-locked"}`}>
            <span className="achievementIcon" aria-hidden="true">
              {a.earnedAt ? ICONS[a.id] : <Lock size={16} />}
            </span>
            <span className="achievementText">
              <span className="achievementLabel">{a.label}</span>
              <span className="achievementMeta">
                {a.earnedAt ? dateFormat.format(a.earnedAt) : a.description}
              </span>
            </span>
            <span className="srOnly">{a.earnedAt ? "Earned" : "Locked"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
