import { useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  House,
  Map,
  FileText,
  MessageSquare,
  FolderOpen,
  ArrowRight,
} from "lucide-react";

// Future signed-in hub. Until accounts and saved roadmaps exist it shows an
// honest empty state: no numbers, activity or achievements that aren't real.
export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add("theme-landing");
    return () => document.body.classList.remove("theme-landing");
  }, []);

  const navClass = ({ isActive }) => `homeNavItem ${isActive ? "active" : ""}`;

  return (
    <div className="homePage">
      <header className="homeTopbar">
        <div className="homeBrand">
          <div className="homeLogo">PA</div>
          <div>
            <div className="homeBrandName">PathwayAI</div>
            <div className="homeBrandTagline">Your Career Hub</div>
          </div>
        </div>

        <nav className="homeNav" aria-label="Main">
          <NavLink to="/home" className={navClass}>
            <House size={20} aria-hidden="true" />
            <span>Home</span>
          </NavLink>
          <NavLink to="/quiz" className={navClass}>
            <Map size={20} aria-hidden="true" />
            <span>Quiz</span>
          </NavLink>
        </nav>
      </header>

      <main className="homeMain">
        <section className="homeHero">
          <div className="homeHeroContent">
            <h1 className="homeTitle">
              Welcome to <span className="titleGradient">PathwayAI</span>
            </h1>
            <p className="homeSubtitle">
              Answer 8 questions, get three tech careers matched to you, and turn one into a
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
          <h2 className="homeSectionTitle" id="homeRoadmapsTitle">Your roadmaps</h2>

          <div className="homeEmpty">
            <div className="homeEmptyIcon">
              <FolderOpen size={28} aria-hidden="true" />
            </div>
            <h3 className="homeEmptyTitle">No saved roadmaps yet</h3>
            <p className="homeEmptyText">
              PathwayAI doesn't have accounts yet, so roadmaps aren't saved here. When you
              generate one from the quiz, it opens on your dashboard for the current session.
              Saved roadmaps and progress history will appear here once sign-in is available.
            </p>
            <button type="button" className="ghostBtn" onClick={() => navigate("/quiz")}>
              Generate a roadmap
            </button>
          </div>
        </section>

        <section className="homeSection" aria-labelledby="homeFeaturesTitle">
          <h2 className="homeSectionTitle" id="homeFeaturesTitle">What you can do</h2>

          <div className="homeGrid">
            <button
              type="button"
              className="homeFeatureCard"
              onClick={() => navigate("/quiz")}
            >
              <div className="homeFeatureIcon">
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

            <div className="homeFeatureCard homeFeatureCard--planned">
              <div className="homeFeatureIcon">
                <FileText size={22} aria-hidden="true" />
              </div>
              <div className="homeFeatureText">
                <h3 className="homeFeatureTitle">Resume Analyzer</h3>
                <p className="homeFeatureSub">Feedback on your resume for a target career</p>
                <span className="homeBadge">Planned</span>
              </div>
            </div>

            <div className="homeFeatureCard homeFeatureCard--planned">
              <div className="homeFeatureIcon">
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
