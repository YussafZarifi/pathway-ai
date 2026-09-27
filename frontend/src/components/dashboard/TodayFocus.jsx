import { Target, Clock, PlayCircle, Search, Check, ArrowRight, Trophy } from "lucide-react";

// Exactly one recommended action: the first task of the current step.
export default function TodayFocus({ focus, totalSteps, onMarkDone, onOpenStep, onRetakeQuiz }) {
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

      {focus.video ? (
        <a
          className="dashFocusVideo"
          href={focus.video.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="timelineVideoThumb">
            {focus.video.thumbnail && <img src={focus.video.thumbnail} alt="" loading="lazy" />}
            <PlayCircle size={24} aria-hidden="true" />
          </span>
          <span className="timelineVideoText">
            <span className="timelineVideoTitle">{focus.video.title}</span>
            <span className="timelineVideoChannel">{focus.video.channel} · YouTube</span>
          </span>
        </a>
      ) : (
        focus.searchUrl && (
          <a
            className="timelineResourceChip dashFocusSearch"
            href={focus.searchUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Search size={13} aria-hidden="true" />
            Find a video for this step
          </a>
        )
      )}

      <div className="dashFocusActions">
        <button
          type="button"
          className="dashBtn dashBtn--primary"
          onClick={() => onMarkDone(focus.stepIndex)}
        >
          <Check size={16} aria-hidden="true" />
          Mark step done
        </button>
        <button type="button" className="dashBtn" onClick={() => onOpenStep(focus.stepIndex)}>
          Open step
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
