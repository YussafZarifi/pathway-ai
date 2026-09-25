import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import RoadmapTimeline from "../components/RoadmapTimeline";
import RadialMeter from "../components/RadialMeter";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  trackEvent,
  trackProgress,
  endSession,
  EVENT_TYPES,
  getMetric,
  getAllProgress,
} from "../lib/trackingEngine";
import { getCareerReadinessSummary } from "../lib/scoringEngine";

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("roadmap");
  const [selectedCareer, setSelectedCareer] = useState("");
  const [roadmap, setRoadmap] = useState(null);
  const [scores, setScores] = useState(null);
  const [progressData, setProgressData] = useState({});

  useEffect(() => {
    document.body.classList.add("theme-landing");
    return () => document.body.classList.remove("theme-landing");
  }, []);

  useEffect(() => {
    if (location.state?.career) {
      setSelectedCareer(location.state.career);
      setRoadmap(location.state.roadmap || null);

      // Track dashboard viewed
      trackEvent(EVENT_TYPES.DASHBOARD_VIEWED, {
        activeTab: "roadmap",
      });
    } else {
      navigate("/quiz");
    }
  }, [location.state, navigate]);

  function refreshScores() {
    setScores(getCareerReadinessSummary());
    setProgressData(getAllProgress());
  }

  // Calculate scores on mount
  useEffect(() => {
    refreshScores();
  }, []);

  // Track tab switches
  function handleTabSwitch(newTab) {
    trackEvent(EVENT_TYPES.DASHBOARD_TAB_SWITCHED, {
      fromTab: activeTab,
      toTab: newTab,
    });
    setActiveTab(newTab);
  }

  if (!roadmap || !selectedCareer) {
    return (
      <div className="dashboardPage">
        <div className="loadingWrap">
          <div className="loaderOrb" />
          <div>
            <div className="loadingText">Loading your dashboard…</div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate roadmap progress percentage
  const roadmapProgress = calculateRoadmapProgress();
  const resumeScoreMetric = getMetric("resume_score");

  function calculateRoadmapProgress() {
    const progress = getAllProgress();
    let totalSteps = 0;
    let completedSteps = 0;

    Object.entries(progress).forEach(([key, value]) => {
      if (key.startsWith("roadmap_step_")) {
        totalSteps++;
        if (value.completed) {
          completedSteps++;
        }
      }
    });

    return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  }

  function TrendIcon({ trend }) {
    if (trend === "up") return <TrendingUp size={13} className="trendIcon trendIcon--up" />;
    if (trend === "down") return <TrendingDown size={13} className="trendIcon trendIcon--down" />;
    return <Minus size={13} className="trendIcon trendIcon--stable" />;
  }

  return (
    <div className="dashboardPage">
      <header className="dashboardTopbar">
        <div className="dashboardBrand">
          <div className="dashboardLogo">PA</div>
          <div>
            <div className="dashboardBrandName">PathwayAI</div>
            <div className="dashboardBrandTagline">Your career hub</div>
          </div>
        </div>

        <nav className="dashboardNav">
          <button
            className={`dashboardNavItem ${activeTab === "roadmap" ? "active" : ""}`}
            onClick={() => handleTabSwitch("roadmap")}
          >
            Roadmap
          </button>
          <button
            className={`dashboardNavItem ${activeTab === "resume" ? "active" : ""}`}
            onClick={() => handleTabSwitch("resume")}
          >
            Resume Analyzer
          </button>
          <button
            className={`dashboardNavItem ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => handleTabSwitch("chat")}
          >
            AI Chatbot
          </button>
        </nav>

        <div className="dashboardActions">
          <button
            className="ghostBtn"
            onClick={() => navigate("/quiz")}
          >
            Back to Quiz
          </button>
        </div>
      </header>

      {/* Career readiness overview: one hero ring + supporting meters */}
      {scores && (
        <section className="readinessOverview">
          <div className="readinessHero">
            <RadialMeter
              value={scores.averageScore}
              size={132}
              strokeWidth={10}
              hero
            />
            <div className="readinessHeroText">
              <div className="readinessHeroLabel">Career Readiness</div>
              <div className="readinessHeroLevel">
                {scores.employability.level}
              </div>
            </div>
          </div>

          <div className="readinessMeters">
            <div className="readinessMeter">
              <RadialMeter value={scores.employability.score} size={84} strokeWidth={7} />
              <div className="readinessMeterLabel">Employability</div>
            </div>

            <div className="readinessMeter">
              <RadialMeter value={scores.momentum.score} size={84} strokeWidth={7} />
              <div className="readinessMeterLabel">
                Momentum <TrendIcon trend={scores.momentum.trend} />
              </div>
            </div>

            <div className="readinessMeter">
              <RadialMeter value={roadmapProgress} size={84} strokeWidth={7} suffix="%" />
              <div className="readinessMeterLabel">Roadmap</div>
            </div>

            {resumeScoreMetric?.current != null && (
              <div className="readinessMeter">
                <RadialMeter value={resumeScoreMetric.current} size={84} strokeWidth={7} />
                <div className="readinessMeterLabel">Resume</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Top recommendation, if any */}
      {scores && scores.recommendations.length > 0 && (
        <section
          className={`recommendationBanner ${scores.recommendations[0].priority}`}
        >
          <span className="recommendationBannerBadge">
            {scores.recommendations[0].priority}
          </span>
          <span>{scores.recommendations[0].message}</span>
        </section>
      )}

      <main className="dashboardMain">
        {activeTab === "roadmap" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="dashboardContent">
              <RoadmapTimeline
                roadmap={roadmap}
                selectedCareer={selectedCareer}
                onProgressChange={refreshScores}
              />
            </div>
          </motion.div>
        )}

        {activeTab === "resume" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="comingSoon"
          >
            <div className="panel">
              <h1 className="panelTitle">Resume Analyzer</h1>
              <p className="panelSub">
                Upload your resume and get AI-powered feedback to improve your chances.
              </p>
              <div className="comingSoonBadge">Coming Soon</div>
            </div>
          </motion.div>
        )}

        {activeTab === "chat" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="comingSoon"
          >
            <div className="panel">
              <h1 className="panelTitle">AI Chatbot</h1>
              <p className="panelSub">
                Get personalized career guidance, answer your questions, and explore new opportunities.
              </p>
              <div className="comingSoonBadge">Coming Soon</div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
