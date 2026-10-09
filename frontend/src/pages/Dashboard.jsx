import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, PlayCircle, Flame, Activity, Map, BellRing } from "lucide-react";
import AppHeader from "../components/AppHeader";
import Dialog from "../components/Dialog";
import ImportRoadmapBanner from "../components/ImportRoadmapBanner";
import DashboardHero from "../components/dashboard/DashboardHero";
import StatTile, { StepsBar, ActivityBars } from "../components/dashboard/StatTile";
import TodayFocus from "../components/dashboard/TodayFocus";
import RoadmapStepper from "../components/dashboard/RoadmapStepper";
import AchievementGrid from "../components/dashboard/AchievementGrid";
import InsightsPanel from "../components/dashboard/InsightsPanel";
import QuickActions from "../components/dashboard/QuickActions";
import { trackEvent, trackMetric, EVENT_TYPES, METRIC_NAMES } from "../lib/trackingEngine";
import { errorMessage } from "../lib/api";
import { stepProgressKey } from "../lib/roadmapStore";
import { useCurrentRoadmap } from "../lib/roadmaps/useCurrentRoadmap";
import {
  summarizeProgress,
  estimateRemaining,
  getActivity,
  getAchievements,
  getMotivation,
  getTodayFocus,
  getInsights,
  getReminders,
} from "../lib/dashboardData";

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  // The saved roadmap survives reloads and new tabs (ADR-013). Router state
  // is only a fallback for a roadmap that couldn't be saved.
  const {
    mode,
    status,
    record,
    error: loadError,
    reload,
    setStepDone,
    setStepNote,
    regenerate: regenerateRecord,
  } = useCurrentRoadmap({ fallbackState: location.state });
  const [expanded, setExpanded] = useState(() => new Set());
  const [stepError, setStepError] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [scrollTarget, setScrollTarget] = useState(null);
  const openedFromHash = useRef(false);

  const hasRoadmap = Boolean(record);

  useEffect(() => {
    if (hasRoadmap) trackEvent(EVENT_TYPES.DASHBOARD_VIEWED, { activeTab: "roadmap" });
  }, [hasRoadmap]);

  const view = useMemo(() => {
    if (!record) return null;
    const { statuses, events } = record;
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
      insights: getInsights({
        roadmap: record.roadmap,
        statuses,
        summary,
        remaining,
        activity,
        activityKind: record.activityKind,
      }),
      motivation: getMotivation(summary),
      reminders: getReminders(record.roadmap, statuses, record.notes),
    };
  }, [record]);

  function toggleDone(index) {
    const isDone = Boolean(record.statuses[index]?.done);

    if (!isDone) {
      trackEvent(EVENT_TYPES.ROADMAP_STEP_COMPLETED, {
        stepId: stepProgressKey(record.id, index),
        stepTitle: record.roadmap[index]?.title || "",
      });
    }
    setStepError("");
    setStepDone(index, !isDone).catch((e) => {
      console.error("Error saving step progress:", e);
      setStepError(errorMessage(e, "Couldn't save that change. Please try again."));
    });
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

  // A link like /dashboard#step-3 (e.g. from a résumé review's gap) opens
  // that step once the roadmap has loaded.
  useEffect(() => {
    if (!record || openedFromHash.current) return;
    const match = /^#step-(\d+)$/.exec(location.hash);
    const index = match ? Number(match[1]) - 1 : -1;
    if (index >= 0 && index < record.roadmap.length) {
      openedFromHash.current = true;
      setExpanded((prev) => new Set(prev).add(index));
      setScrollTarget(index);
    }
  }, [record, location.hash]);

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
      const next = await regenerateRecord();
      const total = next?.roadmap.length || 0;

      trackEvent(EVENT_TYPES.ROADMAP_GENERATED, {
        careerTitle: record.career,
        totalSteps: total,
      });
      trackMetric(METRIC_NAMES.ROADMAP_STEPS_TOTAL, total);

      setExpanded(new Set());
      // Same route, so ScrollToTop doesn't run: show the new roadmap from its
      // hero and move keyboard focus to its title (TD-54).
      window.scrollTo(0, 0);
      requestAnimationFrame(() => document.getElementById("dashCareerTitle")?.focus({ preventScroll: true }));
    } catch (e) {
      console.error("Error regenerating roadmap:", e);
      setRegenError(
        errorMessage(e, "Couldn't generate a new roadmap.") + " Your current roadmap and progress are still here."
      );
    } finally {
      setRegenerating(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="homePage">
        <AppHeader />
        <main className="dashMain" aria-busy="true">
          <p className="srOnly" role="status">
            Loading your roadmap…
          </p>
          <div className="stepperSkeleton" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="skeletonRow">
                <span className="skeleton skeletonNode" />
                <span className="skeleton skeletonCard" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="homePage">
        <AppHeader />
        <main className="dashMain">
          <section className="dashCard dashEmpty" role="alert">
            <span className="dashEmptyIcon" aria-hidden="true">
              <Map size={26} />
            </span>
            <h1 className="dashEmptyTitle">Couldn&apos;t load your roadmap</h1>
            <p className="dashEmptyText">
              {errorMessage(loadError, "Something went wrong while loading your saved roadmap.")}
            </p>
            <button type="button" className="homePrimaryBtn" onClick={reload}>
              Try again
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="homePage">
        <AppHeader />
        <main className="dashMain">
          <ImportRoadmapBanner enabled={mode === "account"} onImported={reload} />
          <section className="dashCard dashEmpty">
            <span className="dashEmptyIcon" aria-hidden="true">
              <Map size={26} />
            </span>
            <h1 className="dashEmptyTitle">No roadmap yet</h1>
            <p className="dashEmptyText">
              Take the 5-question quiz and pick a career. Your roadmap and progress will
              live here, {mode === "account" ? "saved to your account" : "saved in this browser"}.
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
        <ImportRoadmapBanner enabled={mode === "account"} onImported={reload} />
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

        {view.reminders.length > 0 && (
          <section className="dashCard dashReminders" aria-labelledby="dashRemindersTitle">
            <h2 id="dashRemindersTitle" className="dashRailTitle dashRemindersTitle">
              <BellRing size={16} aria-hidden="true" /> Reminders
            </h2>
            <ul className="dashReminderList">
              {view.reminders.map((r) => (
                <li key={r.index} className={`dashReminder ${r.overdue ? "is-overdue" : ""}`}>
                  <span>
                    <strong>Step {r.index + 1}: {r.title}</strong>{" "}
                    <span className="dashMuted">
                      {r.overdue
                        ? `was due ${-r.daysLeft} day${r.daysLeft === -1 ? "" : "s"} ago`
                        : r.daysLeft === 0
                          ? "is due today"
                          : `is due in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  <button type="button" className="dashBtn" onClick={() => openStep(r.index)}>
                    Open step
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

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
            hint={
              record.activityKind === "progress"
                ? "Consecutive days with progress"
                : "Consecutive days using PathwayAI"
            }
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
            {stepError && (
              <p className="dashError" role="alert">
                {stepError}
              </p>
            )}
            {regenError && (
              <p className="dashError dashError--banner" role="alert">
                {regenError}
              </p>
            )}

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
                notes={record.notes}
                onSaveNote={setStepNote}
              />
            )}
          </section>

          <aside className="dashRail" aria-label="Achievements, insights and actions">
            <AchievementGrid achievements={view.achievements} />
            <InsightsPanel insights={view.insights} />
            <QuickActions
              canRegenerate={record.canRegenerate}
              regenerating={regenerating}
              onRegenerate={() => setConfirmRegenerate(true)}
              onRetakeQuiz={() => navigate("/quiz")}
              onOpenResume={() => navigate("/resume")}
              onOpenCoach={() => navigate("/coach")}
              onOpenHistory={mode === "account" ? () => navigate("/roadmaps") : null}
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
            <button type="button" className="dashBtn" onClick={() => setConfirmRegenerate(false)}>
              Cancel
            </button>
            <button type="button" className="dashBtn dashBtn--primary" onClick={regenerate}>
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

    </div>
  );
}
