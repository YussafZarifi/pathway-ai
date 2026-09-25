import { useState, useEffect } from "react";
import { Check, Circle, Clock } from "lucide-react";
import {
  trackEvent,
  trackMetric,
  trackProgress,
  EVENT_TYPES,
  METRIC_NAMES,
} from "../lib/trackingEngine";
import { useLocation } from "react-router-dom";

export default function Roadmap() {
  const location = useLocation();
  const [roadmap, setRoadmap] = useState(null);
  const [selectedCareer, setSelectedCareer] = useState("");
  const [stepProgress, setStepProgress] = useState({});

  useEffect(() => {
    if (location.state?.roadmap) {
      setRoadmap(location.state.roadmap);
      setSelectedCareer(location.state.career || "");

      // Initialize progress tracking for each step
      const initialProgress = {};
      location.state.roadmap.forEach((step) => {
        const stepKey = `roadmap_step_${step.step}`;
        initialProgress[stepKey] = {
          started: false,
          completed: false,
          skipped: false,
        };
      });
      setStepProgress(initialProgress);
    }
  }, [location.state]);

  function handleStepStart(stepId) {
    const stepKey = `roadmap_step_${stepId}`;
    const step = roadmap.find((s) => s.step === stepId);

    // Track event
    trackEvent(EVENT_TYPES.ROADMAP_STEP_STARTED, {
      stepId,
      stepTitle: step?.title || `Step ${stepId}`,
    });

    // Track progress
    trackProgress(stepKey, "started", {
      stepId,
      stepTitle: step?.title,
    });

    // Update local state
    setStepProgress((prev) => ({
      ...prev,
      [stepKey]: { ...prev[stepKey], started: true },
    }));
  }

  function handleStepComplete(stepId) {
    const stepKey = `roadmap_step_${stepId}`;
    const step = roadmap.find((s) => s.step === stepId);

    // Track event
    trackEvent(EVENT_TYPES.ROADMAP_STEP_COMPLETED, {
      stepId,
      stepTitle: step?.title || `Step ${stepId}`,
      timeSpent: 0, // Would need actual time tracking
    });

    // Track progress
    trackProgress(stepKey, "completed", {
      stepId,
      stepTitle: step?.title,
      completedAt: Date.now(),
    });

    // Update metrics
    const completedCount =
      Object.values(stepProgress).filter((p) => p.completed).length + 1;
    trackMetric(METRIC_NAMES.ROADMAP_STEPS_COMPLETED, completedCount);

    // Calculate progress percentage
    const progressPercent = Math.round((completedCount / roadmap.length) * 100);
    trackMetric(METRIC_NAMES.ROADMAP_PROGRESS, progressPercent);

    // Update local state
    setStepProgress((prev) => ({
      ...prev,
      [stepKey]: { ...prev[stepKey], completed: true },
    }));
  }

  function handleStepSkip(stepId) {
    const stepKey = `roadmap_step_${stepId}`;
    const step = roadmap.find((s) => s.step === stepId);

    // Track event
    trackEvent(EVENT_TYPES.ROADMAP_STEP_SKIPPED, {
      stepId,
      stepTitle: step?.title || `Step ${stepId}`,
    });

    // Track progress
    trackProgress(stepKey, "skipped", {
      stepId,
      stepTitle: step?.title,
    });

    // Update metrics
    const skippedCount =
      Object.values(stepProgress).filter((p) => p.skipped).length + 1;
    trackMetric(METRIC_NAMES.ROADMAP_STEPS_SKIPPED, skippedCount);

    // Update local state
    setStepProgress((prev) => ({
      ...prev,
      [stepKey]: { ...prev[stepKey], skipped: true },
    }));
  }

  function getStepStatus(stepId) {
    const stepKey = `roadmap_step_${stepId}`;
    const progress = stepProgress[stepKey];

    if (progress?.completed) return "completed";
    if (progress?.skipped) return "skipped";
    if (progress?.started) return "in-progress";
    return "pending";
  }

  function getStepIcon(status) {
    switch (status) {
      case "completed":
        return <Check size={20} className="step-icon-completed" />;
      case "in-progress":
        return <Clock size={20} className="step-icon-in-progress" />;
      case "skipped":
        return <Circle size={20} className="step-icon-skipped" />;
      default:
        return <Circle size={20} className="step-icon-pending" />;
    }
  }

  function getStepClassName(status) {
    return `roadmap-step roadmap-step-${status}`;
  }

  if (!roadmap) {
    return (
      <div className="roadmapLoading">
        <div className="loaderOrb" />
        <div className="loadingText">Loading roadmap…</div>
      </div>
    );
  }

  return (
    <div className="roadmapPage">
      <div className="roadmapHeader">
        <div>
          <h1 className="roadmapTitle">Your Career Roadmap</h1>
          <p className="roadmapSubtitle">
            Path to becoming a {selectedCareer}
          </p>
        </div>
        <div className="roadmapStats">
          <div className="stat">
            <div className="statValue">
              {
                Object.values(stepProgress).filter((p) => p.completed)
                  .length
              }
              /{roadmap.length}
            </div>
            <div className="statLabel">Steps</div>
          </div>
          <div className="stat">
            <div className="statValue">
              {Math.round(
                (Object.values(stepProgress).filter((p) => p.completed)
                  .length /
                  roadmap.length) *
                  100
              )}
              %
            </div>
            <div className="statLabel">Complete</div>
          </div>
        </div>
      </div>

      <div className="roadmapSteps">
        {roadmap.map((step) => {
          const status = getStepStatus(step.step);

          return (
            <div key={step.step} className={getStepClassName(status)}>
              <div className="stepHeader">
                <div className="stepNumber">{step.step}</div>
                <div className="stepIcon">{getStepIcon(status)}</div>
                <div className="stepInfo">
                  <h3 className="stepTitle">{step.title}</h3>
                  {step.time && (
                    <div className="stepTime">
                      <Clock size={14} />
                      {step.time}
                    </div>
                  )}
                </div>
              </div>

              <div className="stepContent">
                {step.description && (
                  <p className="stepDescription">{step.description}</p>
                )}

                {step.tasks && step.tasks.length > 0 && (
                  <div className="stepTasks">
                    <h4 className="stepTasksTitle">Tasks</h4>
                    <ul className="stepTasksList">
                      {step.tasks.map((task, index) => (
                        <li key={index} className="stepTask">
                          {task}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {step.resources && step.resources.length > 0 && (
                  <div className="stepResources">
                    <h4 className="stepResourcesTitle">Resources</h4>
                    <div className="stepResourcesList">
                      {step.resources.map((resource, index) => (
                        <a
                          key={index}
                          href={resource.url}
                          className="stepResource"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {resource.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {step.reason && (
                  <div className="stepReason">
                    <h4 className="stepReasonTitle">Why this matters</h4>
                    <p>{step.reason}</p>
                  </div>
                )}

                <div className="stepActions">
                  {status === "pending" && (
                    <>
                      <button
                        className="uiverseBtn"
                        onClick={() => handleStepStart(step.step)}
                      >
                        Start Step
                      </button>
                      <button
                        className="ghostBtn"
                        onClick={() => handleStepSkip(step.step)}
                      >
                        Skip
                      </button>
                    </>
                  )}

                  {status === "in-progress" && (
                    <>
                      <button
                        className="uiverseBtn"
                        onClick={() => handleStepComplete(step.step)}
                      >
                        Complete Step
                      </button>
                      <button
                        className="ghostBtn"
                        onClick={() => handleStepSkip(step.step)}
                      >
                        Skip
                      </button>
                    </>
                  )}

                  {status === "completed" && (
                    <div className="stepCompletedMessage">
                      <Check size={16} />
                      Step Completed
                    </div>
                  )}

                  {status === "skipped" && (
                    <div className="stepSkippedMessage">
                      <Circle size={16} />
                      Step Skipped
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
