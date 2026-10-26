import { useNavigate } from "react-router-dom";
import {
  Map,
  FileText,
  MessageSquare,
  FolderOpen,
  ArrowRight,
} from "lucide-react";
import AppHeader from "../components/AppHeader";
import ImportRoadmapBanner from "../components/ImportRoadmapBanner";
import { summarizeProgress } from "../lib/dashboardData";
import { useAuth } from "../lib/authContext";
import { useCurrentRoadmap } from "../lib/roadmaps/useCurrentRoadmap";

// Future signed-in hub. Until accounts exist it shows the one roadmap saved
// in this browser, or an honest empty state: nothing that isn't real.
export default function Home() {
  const navigate = useNavigate();
  const { enabled: accountsEnabled } = useAuth();
  const { mode, status, record, reload } = useCurrentRoadmap();
  const inAccount = mode === "account";
  // The current roadmap, if any, with its real progress.
  const saved = record
    ? { career: record.career, summary: summarizeProgress(record.statuses) }
    : null;

  return (
    <div className="homePage">
      <AppHeader />

      <main className="homeMain">
        <section className="homeHero">
          <div className="homeHeroContent">
            <h1 className="homeTitle">
              Welcome to <span className="titleGradient">PathwayAI</span>
            </h1>
            <p className="homeSubtitle">
              Answer 5 quick questions, get three tech careers matched to you, and turn one into a
              step-by-step learning roadmap.
            </p>

            <div className="homeCTA">
              <button
                type="button"
                className="homePrimaryBtn"
                onClick={() => navigate("/quiz")}
              >
                Take the career quiz
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        <section className="homeSection" aria-labelledby="homeRoadmapsTitle">
          <h2 className="homeSectionTitle" id="homeRoadmapsTitle">Your roadmap</h2>
          <ImportRoadmapBanner enabled={inAccount} onImported={reload} />

          {status === "loading" ? (
            <div className="homeEmpty" aria-busy="true">
              <p className="homeEmptyText" role="status">
                Loading your roadmap…
              </p>
            </div>
          ) : saved ? (
            <div className="homeEmpty">
              <div className="homeEmptyIcon">
                <Map size={28} aria-hidden="true" />
              </div>
              <h3 className="homeEmptyTitle">{saved.career}</h3>
              <p className="homeEmptyText">
                {saved.summary.done} of {saved.summary.total} steps done.{" "}
                {inAccount
                  ? "Your roadmap and progress are saved to your account, so they're here on any device where you sign in. Generating a new one makes it your current roadmap."
                  : `Your roadmap and progress are saved in this browser. PathwayAI keeps one roadmap at a time, so generating a new one replaces it.${accountsEnabled ? " Sign in to save it to your account and use it on any device." : ""}`}
              </p>
              <div className="homeRoadmapActions">
                <button type="button" className="ghostBtn" onClick={() => navigate("/dashboard")}>
                  Open your dashboard
                </button>
                {inAccount && (
                  <button type="button" className="ghostBtn" onClick={() => navigate("/roadmaps")}>
                    All your roadmaps
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="homeEmpty">
              <div className="homeEmptyIcon">
                <FolderOpen size={28} aria-hidden="true" />
              </div>
              <h3 className="homeEmptyTitle">No roadmap yet</h3>
              <p className="homeEmptyText">
                Take the quiz and pick a career.{" "}
                {inAccount
                  ? "Your roadmap and progress will be saved to your account, so they'll be here on any device where you sign in."
                  : "Your roadmap and progress are saved in this browser, so they'll be here when you come back."}
              </p>
              <button type="button" className="ghostBtn" onClick={() => navigate("/quiz")}>
                Generate a roadmap
              </button>
            </div>
          )}
        </section>

        <section className="homeSection" aria-labelledby="homeFeaturesTitle">
          <h2 className="homeSectionTitle" id="homeFeaturesTitle">What you can do</h2>

          <div className="homeGrid">
            <button
              type="button"
              className="homeFeatureCard"
              onClick={() => navigate("/quiz")}
            >
              <div className="homeFeatureIcon homeFeatureIcon--roadmap">
                <Map size={22} aria-hidden="true" />
              </div>
              <div className="homeFeatureText">
                <h3 className="homeFeatureTitle">Career matches &amp; roadmap</h3>
                <p className="homeFeatureSub">
                  Take the quiz to get AI career matches and a learning roadmap
                </p>
                <span className="homeFeatureLink">
                  Start <ArrowRight size={14} aria-hidden="true" />
                </span>
              </div>
            </button>

            <button
              type="button"
              className="homeFeatureCard homeFeatureCard--resume"
              onClick={() => navigate("/resume", { state: { autoAnalyze: true } })}
            >
              <div className="homeFeatureIcon homeFeatureIcon--resume">
                <FileText size={22} aria-hidden="true" />
              </div>
              <div className="homeFeatureText">
                <h3 className="homeFeatureTitle">Resume Analyzer</h3>
                <p className="homeFeatureSub">AI feedback on your resume for your roadmap&apos;s career</p>
                <span className="homeFeatureLink">
                  Open <ArrowRight size={14} aria-hidden="true" />
                </span>
              </div>
            </button>

            <button
              type="button"
              className="homeFeatureCard homeFeatureCard--coach"
              onClick={() => navigate("/coach")}
            >
              <div className="homeFeatureIcon homeFeatureIcon--coach">
                <MessageSquare size={22} aria-hidden="true" />
              </div>
              <div className="homeFeatureText">
                <h3 className="homeFeatureTitle">AI Coach</h3>
                <p className="homeFeatureSub">Personal guidance grounded in your roadmap and progress</p>
                <span className="homeFeatureLink">
                  Open <ArrowRight size={14} aria-hidden="true" />
                </span>
              </div>
            </button>
          </div>
        </section>
      </main>

    </div>
  );
}
