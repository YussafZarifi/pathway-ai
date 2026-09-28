import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Map, FileText, MessageSquare, Sparkles, ArrowRight } from "lucide-react";
import AccountsSoonDialog from "../components/AccountsSoonDialog";

const heroContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const heroItem = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  },
};

const cardsContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.35 },
  },
};

const cardItem = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function Landing() {
  const navigate = useNavigate();
  const [accountsDialogOpen, setAccountsDialogOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("theme-landing");
    return () => document.body.classList.remove("theme-landing");
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="logo">PA</div>
          <span className="brandName brandGlow">PathwayAI</span>
        </div>

        <div className="topActions">
          <button
            type="button"
            className="ghostBtn"
            aria-haspopup="dialog"
            onClick={() => setAccountsDialogOpen(true)}
          >
            Log in
          </button>
          <button
            type="button"
            className="uiverseBtn"
            aria-haspopup="dialog"
            onClick={() => setAccountsDialogOpen(true)}
          >
            Sign up
          </button>
        </div>
      </header>

      <main className="container">
        <section className="hero heroSplit">
          <motion.div
            className="heroLeft"
            variants={heroContainer}
            initial="hidden"
            animate="show"
          >
            <motion.span variants={heroItem} className="heroEyebrow">
              <Sparkles size={14} />
              AI-powered tech career guidance
            </motion.span>

            <motion.h1 variants={heroItem} className="title">
              Find your path. Build your <span className="titleGradient">tech roadmap</span>.
              Improve your future.
            </motion.h1>

            <motion.p variants={heroItem} className="subtitle">
              Answer a few questions and get personalized tech career matches,
              step-by-step learning roadmaps, and AI-powered guidance.
            </motion.p>

            <motion.div variants={heroItem} className="ctaRow">
              <button
                className="uiverseBtn ctaBtn"
                onClick={() => navigate("/quiz")}
              >
                Get Started
                <ArrowRight size={18} className="ctaArrow" />
              </button>
            </motion.div>

            <motion.p variants={heroItem} className="heroHint">
              Free to try &middot; 5 questions, under 2 minutes
            </motion.p>
          </motion.div>

          <motion.div
            className="heroRight"
            variants={cardsContainer}
            initial="hidden"
            animate="show"
          >
            <div className="landingFeatureGrid">
              <motion.div
                variants={cardItem}
                whileHover={{ y: -6 }}
                whileTap={{ y: -2 }}
                className="landingFeatureCard landingFeatureCard--live"
                onClick={() => navigate("/quiz")}
              >
                <div className="landingFeatureIcon roadmapIcon">
                  <Map size={28} />
                </div>
                <div className="landingFeatureText">
                  <h3 className="landingFeatureTitle">Roadmap Generator</h3>
                  <p className="landingFeatureSub">
                    Step-by-step tech career plan tailored to you
                  </p>
                  <span className="landingBadge landingBadge--live">
                    <span className="landingBadgeDot" />
                    Live
                  </span>
                </div>
              </motion.div>

              <motion.div
                variants={cardItem}
                whileHover={{ y: -3 }}
                className="landingFeatureCard landingFeatureCard--soon landingFeatureCard--resume"
              >
                <div className="landingFeatureIcon resumeIcon">
                  <FileText size={28} />
                </div>
                <div className="landingFeatureText">
                  <h3 className="landingFeatureTitle">Resume Feedback</h3>
                  <p className="landingFeatureSub">
                    Instant improvements &amp; AI-powered tips
                  </p>
                  <span className="landingBadge landingBadge--soon">
                    Coming soon
                  </span>
                </div>
              </motion.div>

              <motion.div
                variants={cardItem}
                whileHover={{ y: -3 }}
                className="landingFeatureCard landingFeatureCard--soon landingFeatureCard--coach"
              >
                <div className="landingFeatureIcon coachIcon">
                  <MessageSquare size={28} />
                </div>
                <div className="landingFeatureText">
                  <h3 className="landingFeatureTitle">AI Coach</h3>
                  <p className="landingFeatureSub">
                    Guidance anytime you need it
                  </p>
                  <span className="landingBadge landingBadge--soon">
                    Coming soon
                  </span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </section>
      </main>

      <AccountsSoonDialog
        isOpen={accountsDialogOpen}
        onClose={() => setAccountsDialogOpen(false)}
        onTakeQuiz={() => navigate("/quiz")}
      />

      <footer className="footer">
        <span>© {new Date().getFullYear()} PathwayAI</span>
      </footer>
    </div>
  );
}
