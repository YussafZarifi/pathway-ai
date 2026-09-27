// Small metric card: icon, label, one big value, an optional hint and an
// optional visual (bar, sparkline) underneath.
export default function StatTile({ icon, label, value, hint, children }) {
  return (
    <div className="dashCard dashStat">
      <div className="dashStatLabel">
        <span className="dashStatIcon" aria-hidden="true">
          {icon}
        </span>
        {label}
      </div>
      <div className="dashStatValue">{value}</div>
      {children}
      {hint && <div className="dashStatHint">{hint}</div>}
    </div>
  );
}

// One segment per roadmap step: done, current, upcoming.
export function StepsBar({ statuses, currentIndex }) {
  return (
    <div className="dashStepsBar" aria-hidden="true">
      {statuses.map((s) => (
        <span
          key={s.index}
          className={`dashStepsSeg ${s.done ? "is-done" : s.index === currentIndex ? "is-current" : ""}`}
        />
      ))}
    </div>
  );
}

const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// Bars for app activity per day (event counts from the tracking log).
export function ActivityBars({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const activeCount = days.filter((d) => d.count > 0).length;

  return (
    <div
      className="dashActivity"
      role="img"
      aria-label={`Active on ${activeCount} of the last ${days.length} days`}
    >
      {days.map((d) => (
        <span
          key={d.date}
          className={`dashActivityBar ${d.count > 0 ? "is-active" : ""}`}
          style={{ height: `${d.count > 0 ? 25 + (d.count / max) * 75 : 12}%` }}
          title={`${dayFormat.format(d.date)}: ${d.count} action${d.count === 1 ? "" : "s"}`}
        />
      ))}
    </div>
  );
}
