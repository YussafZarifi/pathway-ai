import { Target, Clock, Check, ArrowRight, Trophy } from "lucide-react";
import VideoCard from "../VideoCard";

// Exactly one recommended action: the first task of the current step.
export default function TodayFocus({
  focus,
  totalSteps,
  busy = false,
  onMarkDone,
  onOpenStep,
  onRetakeQuiz,
}) {
  if (!focus) {
    return (
      <section className="dashCard dashFocus dashFocus--done" aria-labelledby="dashFocusTitle">
        <div className="dashEyebrow">
          <Trophy size={14} aria-hidden="true" /> Today&apos;s focus
        </div>
        <h2 id="dashFocusTitle" className="dashFocusTask">
          Every step is complete
        </h2>
        <p className="dashMuted">Retake the quiz to plan your next goal.</p>
        <div className="dashFocusActions">
          <button type="button" className="dashBtn dashBtn--primary" onClick={onRetakeQuiz}>
            Retake the quiz
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="dashCard dashFocus" aria-labelledby="dashFocusTitle">
      <div className="dashEyebrow">
        <Target size={14} aria-hidden="true" /> Today&apos;s focus
      </div>

      <div className="dashFocusStep">
        Step {focus.stepIndex + 1} of {totalSteps} · {focus.stepTitle}
      </div>
      <h2 id="dashFocusTitle" className="dashFocusTask">
        {focus.task}
      </h2>

      {focus.time && (
        <div className="dashFocusMeta">
          <Clock size={14} aria-hidden="true" />
          Step estimate: {focus.time}
          <span className="dashMuted"> · AI estimate</span>
        </div>
      )}

      {(focus.video || focus.searchUrl) && (
        <VideoCard video={focus.video} searchUrl={focus.searchUrl} compact />
      )}

      <div className="dashFocusActions">
        <button
          type="button"
          className="dashBtn dashBtn--primary"
          onClick={() => onMarkDone(focus.stepIndex)}
          disabled={busy}
        >
          <Check size={16} aria-hidden="true" />
          Mark step done
        </button>
        <button
          type="button"
          className="dashBtn"
          onClick={() => onOpenStep(focus.stepIndex)}
          disabled={busy}
        >
          Open step
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
