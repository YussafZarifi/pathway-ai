import { Lightbulb } from "lucide-react";

// Plain statements derived from the user's real progress (rule-based,
// not AI-generated, so the panel is called "Insights").
export default function InsightsPanel({ insights }) {
  return (
    <section className="dashCard dashRailCard" aria-labelledby="dashInsightsTitle">
      <div className="dashRailHead">
        <h2 id="dashInsightsTitle" className="dashRailTitle">
          Insights
        </h2>
        <span className="dashMuted">From your progress</span>
      </div>

      {insights.length > 0 ? (
        <ul className="insightList">
          {insights.map((insight) => (
            <li key={insight.id} className="insight">
              <span className="insightIcon" aria-hidden="true">
                <Lightbulb size={15} />
              </span>
              <span>{insight.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dashEmptyText">Insights appear as you complete steps.</p>
      )}
    </section>
  );
}
