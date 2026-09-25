import React, { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, CheckCircle2, Clock, ExternalLink, Check } from "lucide-react";
import { trackProgress, getProgress } from "../lib/trackingEngine";

export default function RoadmapTimeline({ roadmap, selectedCareer, onProgressChange }) {
  const [expandedSteps, setExpandedSteps] = useState(new Set());
  const [completedSteps, setCompletedSteps] = useState(() => {
    const initial = new Set();
    (roadmap || []).forEach((_, index) => {
      if (getProgress(`roadmap_step_${index}`)?.completed) {
        initial.add(index);
      }
    });
    return initial;
  });

  const toggleStep = (stepIndex) => {
    setExpandedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(stepIndex)) {
        newSet.delete(stepIndex);
      } else {
        newSet.add(stepIndex);
      }
      return newSet;
    });
  };

  const toggleComplete = (stepIndex, event) => {
    event.stopPropagation();
    const isDone = completedSteps.has(stepIndex);
    trackProgress(`roadmap_step_${stepIndex}`, isDone ? "incomplete" : "completed");

    const newSet = new Set(completedSteps);
    if (isDone) newSet.delete(stepIndex);
    else newSet.add(stepIndex);
    setCompletedSteps(newSet);

    onProgressChange?.();
  };

  if (!roadmap || roadmap.length === 0) {
    return (
      <div className="roadmapEmpty">
        <p>No roadmap generated yet.</p>
      </div>
    );
  }

  const doneCount = completedSteps.size;
  const totalCount = roadmap.length;
  const donePct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="roadmapTimeline">
      <h2 className="roadmapTitle">Your Roadmap to {selectedCareer}</h2>
      <p className="roadmapSubtitle">Follow these steps to achieve your career goal</p>

      <div className="roadmapProgressSummary">
        <div className="roadmapProgressBar">
          <motion.div
            className="roadmapProgressFill"
            initial={{ width: 0 }}
            animate={{ width: `${donePct}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <span className="roadmapProgressText">
          {doneCount} of {totalCount} steps complete
        </span>
      </div>

      <div className="timelineContainer">
        {roadmap.map((step, index) => {
          const isExpanded = expandedSteps.has(index);
          const isDone = completedSteps.has(index);

          return (
            <motion.div
              key={index}
              className="timelineStep"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="timelineMarker">
                <button
                  type="button"
                  className={`timelineDot ${isDone ? "done" : ""}`}
                  onClick={(e) => toggleComplete(index, e)}
                  aria-label={isDone ? "Mark step incomplete" : "Mark step complete"}
                  title={isDone ? "Mark as not done" : "Mark as done"}
                >
                  {isDone ? <Check size={14} /> : index + 1}
                </button>
              </div>

              <div className="timelineContent">
                <button
                  className={`timelineCard ${isExpanded ? "expanded" : ""} ${isDone ? "done" : ""}`}
                  onClick={() => toggleStep(index)}
                >
                  <div className="timelineHeader">
                    <div className="timelineTitleRow">
                      <h3 className="timelineStepTitle">{step.title}</h3>
                      <ChevronRight className={`timelineArrow ${isExpanded ? "open" : ""}`} size={20} />
                    </div>
                    <p className="timelineDescription">{step.description}</p>

                    <div className="timelineMeta">
                      {step.time && (
                        <span className="timelineTime">
                          <Clock size={14} />
                          {step.time}
                        </span>
                      )}
                      {isDone && (
                        <span className="timelineDoneBadge">
                          <CheckCircle2 size={14} />
                          Done
                        </span>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <motion.div
                      className="timelineExpanded"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      {step.resources && step.resources.length > 0 && (
                        <div className="timelineResources">
                          <h4 className="timelineResourcesTitle">Learning Resources</h4>
                          <div className="timelineResourcesList">
                            {step.resources.map((resource, idx) => (
                              <a
                                key={idx}
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="timelineResourceChip"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink size={13} />
                                {resource.name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {step.tasks && step.tasks.length > 0 && (
                        <div className="timelineTasks">
                          <h4 className="timelineTasksTitle">Action Items</h4>
                          <ul className="timelineTasksList">
                            {step.tasks.map((task, idx) => (
                              <li key={idx} className="timelineTaskItem">
                                <CheckCircle2 size={14} />
                                <span>{task}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </motion.div>
                  )}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
