import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Map,
  FileText,
  MessageSquare,
  FolderOpen,
  ArrowRight,
} from "lucide-react";
import AppHeader from "../components/AppHeader";
import { loadCurrentRoadmap } from "../lib/roadmapStore";
import { getAllProgress } from "../lib/trackingEngine";
import { getStepStatuses, summarizeProgress } from "../lib/dashboardData";

// The browser-saved roadmap (ADR-013), if any, with its real progress.
function loadSavedRoadmap() {
  const record = loadCurrentRoadmap();
  if (!record) return null;
  const statuses = getStepStatuses(record.roadmap, getAllProgress(), record.id);
  return { career: record.career, summary: summarizeProgress(statuses) };
}

// Future signed-in hub. Until accounts exist it shows the one roadmap saved
// in this browser, or an honest empty state: nothing that isn't real.
export default function Home() {
  const navigate = useNavigate();
  const [saved] = useState(loadSavedRoadmap);

  useEffect(() => {
    document.body.classList.add("theme-landing");
    return () => document.body.classList.remove("theme-landing");
  }, []);

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

          {saved ? (
            <div className="homeEmpty">
              <div className="homeEmptyIcon">
                <Map size={28} aria-hidden="true" />
              </div>
              <h3 className="homeEmptyTitle">{saved.career}</h3>
              <p className="homeEmptyText">
                {saved.summary.done} of {saved.summary.total} steps done. Your roadmap and
                progress are saved in this browser. PathwayAI keeps one roadmap at a time, so
                generating a new one replaces it. Saving across devices will come with accounts.
              </p>
              <button type="button" className="ghostBtn" onClick={() => navigate("/dashboard")}>
                Open your dashboard
              </button>
            </div>
          ) : (
            <div className="homeEmpty">
              <div className="homeEmptyIcon">
                <FolderOpen size={28} aria-hidden="true" />
              </div>
              <h3 className="homeEmptyTitle">No roadmap yet</h3>
              <p className="homeEmptyText">
                Take the quiz and pick a career. Your roadmap and progress are saved in this
                browser, so they'll be here when you come back. Saving across devices will come
                with accounts.
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

            <div className="homeFeatureCard homeFeatureCard--planned homeFeatureCard--resume">
              <div className="homeFeatureIcon homeFeatureIcon--resume">
                <FileText size={22} aria-hidden="true" />
              </div>
              <div className="homeFeatureText">
                <h3 className="homeFeatureTitle">Resume Analyzer</h3>
                <p className="homeFeatureSub">Feedback on your resume for a target career</p>
                <span className="homeBadge">Planned</span>
              </div>
            </div>

            <div className="homeFeatureCard homeFeatureCard--planned homeFeatureCard--coach">
              <div className="homeFeatureIcon homeFeatureIcon--coach">
                <MessageSquare size={22} aria-hidden="true" />
              </div>
              <div className="homeFeatureText">
                <h3 className="homeFeatureTitle">AI Coach</h3>
                <p className="homeFeatureSub">Ask questions about your roadmap as you go</p>
                <span className="homeBadge">Planned</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="homeFooter">
        <span className="homeFooterCopyright">© {new Date().getFullYear()} PathwayAI</span>
      </footer>
    </div>
  );
}
