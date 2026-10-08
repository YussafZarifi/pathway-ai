import { CheckCircle2, FileText, Map, PlayCircle, Sparkles } from "lucide-react";

function actionLabel(action, steps) {
  const title = action.step ? steps[action.step - 1]?.title : "";
  switch (action.type) {
    case "open_step":
      return `Open step ${action.step}${title ? `: ${title}` : ""}`;
    case "mark_step_done":
      return `Mark step ${action.step} done`;
    case "open_resume":
      return "Review my résumé";
    case "take_quiz":
      return "Take the career quiz";
    default:
      return "";
  }
}

const ICONS = {
  open_step: <PlayCircle size={15} aria-hidden="true" />,
  mark_step_done: <CheckCircle2 size={15} aria-hidden="true" />,
  open_resume: <FileText size={15} aria-hidden="true" />,
  take_quiz: <Map size={15} aria-hidden="true" />,
};

/**
 * One chat message. The coach's suggested actions are buttons: nothing
 * happens until the user clicks one (ADR-021). Text is rendered as text.
 */
export default function CoachMessage({ message, steps, statuses, busyAction, onAction }) {
  const isUser = message.role === "user";
  return (
    <li className={`coachMsg ${isUser ? "coachMsg--user" : "coachMsg--coach"}`}>
      {!isUser && (
        <span className="coachMsgAuthor">
          <Sparkles size={13} aria-hidden="true" /> AI Coach
        </span>
      )}
      <span className="srOnly">{isUser ? "You said:" : ""}</span>
      <p className="coachMsgText">{message.content}</p>
      {message.pending && <span className="dashMuted coachMsgPending">Sending…</span>}
      {message.actions?.length > 0 && (
        <div className="coachActions">
          {message.actions.map((action) => {
            const key = `${message.id}-${action.type}-${action.step ?? ""}`;
            const done = action.type === "mark_step_done" && statuses?.[action.step - 1]?.done;
            const missing = action.step && !steps[action.step - 1];
            return (
              <button
                key={key}
                type="button"
                className="dashBtn coachAction"
                onClick={() => onAction(action, key)}
                disabled={done || missing || busyAction === key}
              >
                {ICONS[action.type]}
                <span>{done ? `Step ${action.step} is done` : actionLabel(action, steps)}</span>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
