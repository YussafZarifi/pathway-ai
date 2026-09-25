import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Map, FileText, MessageSquare, Users, Layout, BarChart3, History, TrendingUp, LogOut } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();

  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    document.body.classList.add("theme-landing");
    return () => document.body.classList.remove("theme-landing");
  }, []);

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

        <nav className="homeNav">
          <button
            className={`homeNavItem ${window.location.pathname === "/home" ? "active" : ""}`}
            onClick={() => navigate("/home")}
          >
            <Users size={20} />
            <span>Home</span>
          </button>
          <button
            className={`homeNavItem ${window.location.pathname === "/quiz" ? "active" : ""}`}
            onClick={() => navigate("/quiz")}
          >
            <Map size={20} />
            <span>Quiz</span>
          </button>
          <button
            className={`homeNavItem ${window.location.pathname === "/dashboard" ? "active" : ""}`}
            onClick={() => navigate("/dashboard")}
          >
            <Layout size={20} />
            <span>Dashboard</span>
          </button>
        </nav>

        <div className="homeAuth">
          {isAuthenticated ? (
            <button className="homeProfileBtn" onClick={() => navigate("/profile")}>
              <Users size={20} />
              <span>Profile</span>
            </button>
          ) : (
            <>
              <button className="ghostBtn" onClick={() => navigate("/login")}>Log in</button>
              <button className="uiverseBtn" onClick={() => navigate("/signup")}>Sign Up</button>
            </>
          )}
        </div>
      </header>

      <main className="homeMain">
        <section className="homeHero">
          <div className="homeHeroContent">
            <h1 className="homeTitle">
              Welcome back, <span className="homeTitleHighlight">{window.location.pathname === "/" ? "Pathway User" : "Explorer"}</span>
            </h1>
            <p className="homeSubtitle">
              Discover your path. Build your roadmap. Achieve your goals with AI-powered guidance.
            </p>

            <div className="homeCTA">
              <button className="uiverseBtn large" onClick={() => navigate("/quiz")}>
                Start Your Journey
              </button>
              <button className="ghostBtn large" onClick={() => navigate("/dashboard")}>
                View Dashboard
              </button>
            </div>
          </div>
        </section>

        <section className="homeFeatures">
          <h2 className="homeSectionTitle">Quick Access</h2>

          <div className="homeGrid">
            <div className="homeFeatureCard" onClick={() => navigate("/quiz")}>
              <div className="homeFeatureIcon roadmapsIcon">
                <Map size={40} />
              </div>
              <div className="homeFeatureText">
                <h3 className="homeFeatureTitle">Roadmaps</h3>
                <p className="homeFeatureSub">Explore career paths and learning roadmaps</p>
              </div>
            </div>

            <div className="homeFeatureCard comingSoon" onClick={() => {}}>
              <div className="homeFeatureIcon resumeIcon">
                <FileText size={40} />
              </div>
              <div className="homeFeatureText">
                <h3 className="homeFeatureTitle">Resume Analyzer</h3>
                <p className="homeFeatureSub">Upload your resume for AI feedback</p>
                <span className="comingSoonBadge">Coming Soon</span>
              </div>
            </div>

            <div className="homeFeatureCard" onClick={() => navigate("/dashboard")}>
              <div className="homeFeatureIcon coachIcon">
                <MessageSquare size={40} />
              </div>
              <div className="homeFeatureText">
                <h3 className="homeFeatureTitle">AI Coach</h3>
                <p className="homeFeatureSub">Get personalized career guidance anytime</p>
              </div>
            </div>

            <div className="homeFeatureCard comingSoon" onClick={() => {}}>
              <div className="homeFeatureIcon settingsIcon">
                <BarChart3 size={40} />
              </div>
              <div className="homeFeatureText">
                <h3 className="homeFeatureTitle">Settings</h3>
                <p className="homeFeatureSub">Customize your preferences</p>
                <span className="comingSoonBadge">Coming Soon</span>
              </div>
            </div>
          </div>
        </section>

        <section className="homeStats">
          <h2 className="homeSectionTitle">Your Progress</h2>

          <div className="statsGrid">
            <div className="statCard">
              <div className="statIconContainer totalIcon">
                <Layout size={32} />
              </div>
              <div className="statContent">
                <div className="statNumber">3</div>
                <div className="statLabel">Roadmaps Created</div>
              </div>
            </div>

            <div className="statCard">
              <div className="statIconContainer activeIcon">
                <TrendingUp size={32} />
              </div>
              <div className="statContent">
                <div className="statNumber">85%</div>
                <div className="statLabel">Career Match</div>
              </div>
            </div>

            <div className="statCard">
              <div className="statIconContainer stepsIcon">
                <History size={32} />
              </div>
              <div className="statContent">
                <div className="statNumber">12</div>
                <div className="statLabel">Steps Completed</div>
              </div>
            </div>
          </div>
        </section>

        <section className="homeRecent">
          <h2 className="homeSectionTitle">Recent Activity</h2>

          <div className="recentList">
            <div className="recentItem">
              <div className="recentIcon completedIcon">
                <Map size={20} />
              </div>
              <div className="recentContent">
                <div className="recentTitle">Created Roadmap</div>
                <div className="recentTime">2 days ago</div>
              <div className="recentCareer">Software Engineer</div>
              </div>
            </div>

            <div className="recentItem">
              <div className="recentIcon progressIcon">
                <BarChart3 size={20} />
              </div>
              <div className="recentContent">
                <div className="recentTitle">Updated Profile</div>
                <div className="recentTime">1 week ago</div>
              </div>
            </div>

            <div className="recentItem">
              <div className="recentIcon quizIcon">
                <Map size={20} />
              </div>
              <div className="recentContent">
                <div className="recentTitle">Completed Quiz</div>
                <div className="recentTime">Just now</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="homeFooter">
        <div className="homeFooterLinks">
          <a href="#" className="homeFooterLink">About</a>
          <a href="#" className="homeFooterLink">Pricing</a>
          <a href="#" className="homeFooterLink">Contact</a>
        </div>
        <span className="homeFooterCopyright">© {new Date().getFullYear()} PathwayAI</span>
      </footer>
    </div>
  );
}
