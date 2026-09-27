import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, PlayCircle, Flame, Activity, Map } from "lucide-react";
import AppHeader from "../components/AppHeader";
import Dialog from "../components/Dialog";
import DashboardHero from "../components/dashboard/DashboardHero";
import StatTile, { StepsBar, ActivityBars } from "../components/dashboard/StatTile";
import TodayFocus from "../components/dashboard/TodayFocus";
import RoadmapStepper from "../components/dashboard/RoadmapStepper";
import AchievementGrid from "../components/dashboard/AchievementGrid";
import InsightsPanel from "../components/dashboard/InsightsPanel";
import QuickActions from "../components/dashboard/QuickActions";
import {
  trackEvent,
  trackMetric,
  trackProgress,
  getAllProgress,
  getEvents,
  EVENT_TYPES,
  METRIC_NAMES,
} from "../lib/trackingEngine";
import { loadCurrentRoadmap, saveCurrentRoadmap, stepProgressKey } from "../lib/roadmapStore";
import { requestRoadmap } from "../lib/api";
import {
  getStepStatuses,
  summarizeProgress,
  estimateRemaining,
  getActivity,
  getAchievements,
  getMotivation,
  getTodayFocus,
  getInsights,
} from "../lib/dashboardData";

const PLANNED = {
  resume: {
    title: "Resume Analyzer is coming soon",
    body: "You'll be able to upload your resume and get feedback against your target career. It isn't built yet, so nothing is analyzed today.",
  },
  coach: {
    title: "AI Coach is coming soon",
    body: "You'll be able to ask questions about your roadmap as you go. It isn't built yet.",
  },
};

// The stored roadmap survives reloads and new tabs (ADR-013). Router state
// is only a fallback for a roadmap that couldn't be saved.
function initialRecord(state) {
  const stored = loadCurrentRoadmap();
  if (stored) return stored;
  if (state?.career && Array.isArray(state.roadmap) && state.roadmap.length > 0) {
    return {
      id: "unsaved",
      career: state.career,
      careerData: null,
      answers: null,
      roadmap: state.roadmap,
      generatedAt: null,
    };
  }
  return null;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const [record, setRecord] = useState(() => initialRecord(location.state));
  const [progress, setProgress] = useState(() => getAllProgress());
  const [events, setEvents] = useState(() => getEvents());
  const [expanded, setExpanded] = useState(() => new Set());
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [plannedFeature, setPlannedFeature] = useState(null);
  const [scrollTarget, setScrollTarget] = useState(null);

  useEffect(() => {
    document.body.classList.add("theme-landing");
    return () => document.body.classList.remove("theme-landing");
  }, []);

  const hasRoadmap = Boolean(record);

  useEffect(() => {
    if (hasRoadmap) trackEvent(EVENT_TYPES.DASHBOARD_VIEWED, { activeTab: "roadmap" });
  }, [hasRoadmap]);

  const view = useMemo(() => {
    if (!record) return null;
    const statuses = getStepStatuses(record.roadmap, progress, record.id);
    const summary = summarizeProgress(statuses);
    const remaining = estimateRemaining(record.roadmap, statuses);
    const activity = getActivity(events);
    return {
      statuses,
      summary,
      remaining,
      activity,
      focus: getTodayFocus(record.roadmap, summary),
      achievements: getAchievements({ events, statuses, generatedAt: record.generatedAt }),
      insights: getInsights({ roadmap: record.roadmap, statuses, summary, remaining, activity }),
      motivation: getMotivation(summary),
    };
  }, [record, progress, events]);

  function refreshTracking() {
    setProgress(getAllProgress());
    setEvents(getEvents());
  }

  function toggleDone(index) {
    const key = stepProgressKey(record.id, index);
    const isDone = Boolean(progress[key]?.completed);

    trackProgress(key, isDone ? "incomplete" : "completed");
    if (!isDone) {
      trackEvent(EVENT_TYPES.ROADMAP_STEP_COMPLETED, {
        stepId: key,
        stepTitle: record.roadmap[index]?.title || "",
      });
    }
    refreshTracking();
  }

  function toggleExpand(index) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function openStep(index) {
    setExpanded((prev) => new Set(prev).add(index));
    setScrollTarget(index);
  }

  // After the step has rendered expanded, bring it into view and move
  // keyboard focus to its header.
  useEffect(() => {
    if (scrollTarget == null) return;
    const el = document.getElementById(`roadmap-step-${scrollTarget}`);
    el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    el?.querySelector(".stepToggle")?.focus({ preventScroll: true });
    setScrollTarget(null);
  }, [scrollTarget]);

  async function regenerate() {
    setConfirmRegenerate(false);
    setRegenerating(true);
    setRegenError("");

    try {
      const steps = await requestRoadmap(record.answers, record.career);
      if (steps.length === 0) throw new Error("Empty roadmap");

      trackEvent(EVENT_TYPES.ROADMAP_GENERATED, {
        careerTitle: record.career,
        totalSteps: steps.length,
      });
      trackMetric(METRIC_NAMES.ROADMAP_STEPS_TOTAL, steps.length);

      const next = saveCurrentRoadmap({
        career: record.career,
        careerData: record.careerData,
        answers: record.answers,
        roadmap: steps,
      });
      setRecord(next);
      setExpanded(new Set());
      refreshTracking();
    } catch (e) {
      console.error("Error regenerating roadmap:", e);
      setRegenError("Couldn't generate a new roadmap. Your current one is unchanged.");
    } finally {
      setRegenerating(false);
    }
  }

  if (!record) {
    return (
      <div className="homePage">
        <AppHeader />
        <main className="dashMain">
          <section className="dashCard dashEmpty">
            <span className="dashEmptyIcon" aria-hidden="true">
              <Map size={26} />
            </span>
            <h1 className="dashEmptyTitle">No roadmap yet</h1>
            <p className="dashEmptyText">
              Take the 8-question quiz, pick a career, and your roadmap and progress will
              live here.
            </p>
            <button type="button" className="homePrimaryBtn" onClick={() => navigate("/quiz")}>
              Take the career quiz
            </button>
          </section>
        </main>
      </div>
    );
  }

  const { statuses, summary, remaining, activity, focus } = view;
  const nextStep = summary.currentIndex >= 0 ? record.roadmap[summary.currentIndex] : null;
  const activeInWindow = activity.days.filter((d) => d.count > 0).length;
  const materials = record.roadmap.reduce(
    (acc, step) => ({
      videos: acc.videos + (step.videos?.length || 0),
      resources: acc.resources + (step.resources?.length || 0),
    }),
    { videos: 0, resources: 0 }
  );

  return (
    <div className="homePage">
      <AppHeader />

      <main className="dashMain">
        <div className="dashTop">
          <DashboardHero
            career={record.career}
            careerData={record.careerData}
            summary={summary}
            remaining={remaining}
            motivation={view.motivation}
            nextStep={nextStep}
          />
          <TodayFocus
            focus={focus}
            totalSteps={summary.total}
            busy={regenerating}
            onMarkDone={toggleDone}
            onOpenStep={openStep}
            onRetakeQuiz={() => navigate("/quiz")}
          />
        </div>

        <section className="dashStats" aria-label="Progress stats">
          <StatTile
            icon={<CheckCircle2 size={15} />}
            label="Steps complete"
            value={`${summary.done}/${summary.total}`}
          >
            <StepsBar statuses={statuses} currentIndex={summary.currentIndex} />
          </StatTile>
          <StatTile
            icon={<PlayCircle size={15} />}
            label="Learning materials"
            value={materials.videos + materials.resources}
            hint={`${materials.videos} video${materials.videos === 1 ? "" : "s"} · ${materials.resources} resource${materials.resources === 1 ? "" : "s"}`}
          />
          <StatTile
            icon={<Flame size={15} />}
            label="Day streak"
            value={activity.streak}
            hint="Consecutive days using PathwayAI"
          />
          <StatTile
            icon={<Activity size={15} />}
            label="Active days"
            value={`${activeInWindow}/${activity.days.length}`}
          >
            <ActivityBars days={activity.days} />
          </StatTile>
        </section>

        <div className="dashBody">
          <section className="dashRoadmap" aria-labelledby="dashRoadmapTitle" aria-busy={regenerating}>
            <div className="dashSectionHead">
              <h2 id="dashRoadmapTitle" className="dashSectionTitle">
                Your roadmap
              </h2>
              <span className="dashMuted">
                {summary.done} of {summary.total} complete
              </span>
            </div>

            {regenerating ? (
              <div className="stepperSkeleton" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="skeletonRow">
                    <span className="skeleton skeletonNode" />
                    <span className="skeleton skeletonCard" />
                  </div>
                ))}
              </div>
            ) : (
              <RoadmapStepper
                roadmap={record.roadmap}
                statuses={statuses}
                currentIndex={summary.currentIndex}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                onToggleDone={toggleDone}
              />
            )}
          </section>

          <aside className="dashRail" aria-label="Achievements, insights and actions">
            <AchievementGrid achievements={view.achievements} />
            <InsightsPanel insights={view.insights} />
            <QuickActions
              canRegenerate={Boolean(record.answers)}
              regenerating={regenerating}
              error={regenError}
              onRegenerate={() => setConfirmRegenerate(true)}
              onRetakeQuiz={() => navigate("/quiz")}
              onPlanned={setPlannedFeature}
            />
          </aside>
        </div>
      </main>

      <Dialog
        isOpen={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        title="Regenerate your roadmap?"
        actions={
          <>
            <button type="button" className="ghostBtn" onClick={() => setConfirmRegenerate(false)}>
              Cancel
            </button>
            <button type="button" className="uiverseBtn" onClick={regenerate}>
              Regenerate
            </button>
          </>
        }
      >
        <p>
          You&apos;ll get a new {record.career} roadmap. Progress on the current one
          ({summary.done} of {summary.total} steps) won&apos;t carry over.
        </p>
      </Dialog>

      <Dialog
        isOpen={Boolean(plannedFeature)}
        onClose={() => setPlannedFeature(null)}
        title={plannedFeature ? PLANNED[plannedFeature].title : ""}
        actions={
          <button type="button" className="ghostBtn" onClick={() => setPlannedFeature(null)}>
            Close
          </button>
        }
      >
        <p>{plannedFeature ? PLANNED[plannedFeature].body : ""}</p>
      </Dialog>
    </div>
  );
}
