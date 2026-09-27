import {
  Check,
  ChevronDown,
  Clock,
  PlayCircle,
  ExternalLink,
  CheckCircle2,
  BookOpen,
  ListChecks,
} from "lucide-react";
import VideoCard from "../VideoCard";

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function StepStatus({ status, isCurrent }) {
  if (status.done) {
    return (
      <span className="stepStatus stepStatus--done">
        Done {status.completedAt ? dateFormat.format(status.completedAt) : ""}
      </span>
    );
  }
  if (isCurrent) return <span className="stepStatus stepStatus--current">Current</span>;
  return <span className="stepStatus">Up next</span>;
}

function StepDetails({ step }) {
  const videos = step.videos || [];
  const resources = step.resources || [];
  const tasks = step.tasks || [];

  return (
    <div className="stepDetails">
      {step.description && <p className="stepDescription">{step.description}</p>}

      {tasks.length > 0 && (
        <div className="stepDetailBlock">
          <h4 className="timelineTasksTitle">Action items</h4>
          <ul className="timelineTasksList">
            {tasks.map((task, idx) => (
              <li key={idx} className="timelineTaskItem">
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>{task}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(videos.length > 0 || step.video_search_url) && (
        <div className="stepDetailBlock">
          <h4 className="timelineResourcesTitle">Videos</h4>
          <div className="videoList">
            {videos.length > 0 ? (
              videos.map((video) => <VideoCard key={video.id} video={video} />)
            ) : (
              <VideoCard searchUrl={step.video_search_url} />
            )}
          </div>
        </div>
      )}

      {resources.length > 0 && (
        <div className="stepDetailBlock">
          <h4 className="timelineResourcesTitle">Learning resources</h4>
          <div className="timelineResourcesList">
            {resources.map((resource, idx) => (
              <a
                key={idx}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="timelineResourceChip"
              >
                <ExternalLink size={13} aria-hidden="true" />
                {resource.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Visual roadmap: a vertical stepper with done / current / upcoming nodes.
// Each step's header toggles its details; "mark done" is a separate button
// (no interactive elements nested inside another button).
export default function RoadmapStepper({
  roadmap,
  statuses,
  currentIndex,
  expanded,
  onToggleExpand,
  onToggleDone,
}) {
  return (
    <ol className="stepper">
      {roadmap.map((step, index) => {
        const status = statuses[index];
        const isCurrent = index === currentIndex;
        const isOpen = expanded.has(index);
        const detailsId = `roadmap-step-details-${index}`;
        const counts = [
          step.videos?.length ? { icon: <PlayCircle size={13} />, n: step.videos.length, label: "videos" } : null,
          step.resources?.length ? { icon: <BookOpen size={13} />, n: step.resources.length, label: "resources" } : null,
          step.tasks?.length ? { icon: <ListChecks size={13} />, n: step.tasks.length, label: "tasks" } : null,
        ].filter(Boolean);

        return (
          <li
            key={index}
            id={`roadmap-step-${index}`}
            className={`stepItem ${status.done ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}
          >
            <button
              type="button"
              className="stepNode"
              onClick={() => onToggleDone(index)}
              aria-pressed={status.done}
              aria-label={`${status.done ? "Mark not done" : "Mark done"}: step ${index + 1}, ${step.title}`}
              title={status.done ? "Mark as not done" : "Mark as done"}
            >
              {status.done ? <Check size={16} aria-hidden="true" /> : index + 1}
            </button>

            <div className="stepCard">
              <button
                type="button"
                className="stepToggle"
                onClick={() => onToggleExpand(index)}
                aria-expanded={isOpen}
                aria-controls={detailsId}
              >
                <span className="stepHeadRow">
                  <span className="stepTitle">{step.title}</span>
                  <span className="stepHeadEnd">
                    <StepStatus status={status} isCurrent={isCurrent} />
                    <ChevronDown
                      size={18}
                      className={`stepChevron ${isOpen ? "is-open" : ""}`}
                      aria-hidden="true"
                    />
                  </span>
                </span>
                <span className="stepMetaRow">
                  {step.time && step.time !== "Varies" && (
                    <span className="stepChip">
                      <Clock size={13} aria-hidden="true" />
                      {step.time}
                    </span>
                  )}
                  {counts.map((c) => (
                    <span key={c.label} className="stepCount">
                      <span aria-hidden="true">{c.icon}</span>
                      {c.n}
                      <span className="srOnly"> {c.label}</span>
                    </span>
                  ))}
                </span>
              </button>

              {isOpen && (
                <div id={detailsId}>
                  <StepDetails step={step} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
