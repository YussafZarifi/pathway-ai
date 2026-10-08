import { RefreshCw, RotateCcw, FileText, MessageSquare, History } from "lucide-react";

function ActionButton({ icon, label, hint, onClick, disabled, tone }) {
  return (
    <button
      type="button"
      className={`quickAction ${tone ? `quickAction--${tone}` : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="quickActionIcon" aria-hidden="true">
        {icon}
      </span>
      <span className="quickActionText">
        <span className="quickActionLabel">
          {label}
        </span>
        {hint && <span className="quickActionHint">{hint}</span>}
      </span>
    </button>
  );
}

export default function QuickActions({
  canRegenerate,
  regenerating,
  error,
  onRegenerate,
  onRetakeQuiz,
  onOpenResume,
  onOpenCoach,
  onOpenHistory,
}) {
  return (
    <section className="dashCard dashRailCard" aria-labelledby="dashActionsTitle">
      <div className="dashRailHead">
        <h2 id="dashActionsTitle" className="dashRailTitle">
          Quick actions
        </h2>
      </div>

      <div className="quickActions">
        <ActionButton
          icon={<RefreshCw size={17} className={regenerating ? "spin" : ""} />}
          label={regenerating ? "Regenerating…" : "Regenerate roadmap"}
          hint={canRegenerate ? "New plan, same career" : "Retake the quiz to enable"}
          onClick={onRegenerate}
          disabled={!canRegenerate || regenerating}
        />
        <ActionButton
          icon={<RotateCcw size={17} />}
          label="Retake quiz"
          hint="Explore other careers"
          onClick={onRetakeQuiz}
        />
        {onOpenHistory && (
          <ActionButton
            icon={<History size={17} />}
            label="Past roadmaps"
            hint="Switch back to an earlier roadmap"
            onClick={onOpenHistory}
          />
        )}
        <ActionButton
          icon={<FileText size={17} />}
          label="Resume Analyzer"
          hint="AI feedback for this career"
          onClick={onOpenResume}
          tone="resume"
        />
        <ActionButton
          icon={<MessageSquare size={17} />}
          label="AI Coach"
          hint="Ask about your roadmap"
          onClick={onOpenCoach}
          tone="coach"
        />
      </div>

      {error && (
        <p className="dashError" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
