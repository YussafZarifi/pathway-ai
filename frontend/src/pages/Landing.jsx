import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  Map,
  MessageSquare,
  Route,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import AccountsSoonDialog from "../components/AccountsSoonDialog";
import { useAuth } from "../lib/authContext";

// The hero is visible on the first paint (B-13: no waiting for JavaScript
// to fade it in); only a small upward settle is animated.
const heroContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const heroItem = {
  hidden: { opacity: 1, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

const cardsContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
};

const cardItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

const STEPS = [
  {
    icon: <ClipboardList size={22} aria-hidden="true" />,
    title: "Answer 5 questions",
    text: "Your interests, how you solve problems, your experience, your weekly time and your 12-month goal.",
  },
  {
    icon: <Sparkles size={22} aria-hidden="true" />,
    title: "Get 3 career matches",
    text: "AI suggests three technology careers with why they fit you, the skills involved and estimated salary and growth.",
  },
  {
    icon: <Route size={22} aria-hidden="true" />,
    title: "Follow your roadmap",
    text: "Pick one and get a step-by-step learning plan with tasks, resources and videos, then track your progress.",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const { enabled, user } = useAuth();
  const [accountsDialogOpen, setAccountsDialogOpen] = useState(false);


  // The footer's "About" link (/#about) lands here.
  useEffect(() => {
    if (location.hash === "#about") document.getElementById("about")?.scrollIntoView({ block: "start" });
  }, [location.hash]);

  // Resume Analyzer and AI Coach keep their history in an account.
  const accountFeature = enabled
    ? { badge: user ? "Open" : "With a free account", live: true }
    : { badge: "Needs an account", live: false };

  const features = [
    {
      key: "roadmap",
      icon: <Map size={28} />,
      iconClass: "roadmapIcon",
      title: "Roadmap Generator",
      text: "Step-by-step tech career plan tailored to you",
      badge: "Live",
      live: true,
      to: "/quiz",
    },
    {
      key: "resume",
      icon: <FileText size={28} />,
      iconClass: "resumeIcon",
      title: "Resume Analyzer",
      text: "AI feedback on your résumé for your roadmap's career",
      ...accountFeature,
      to: "/resume",
    },
    {
      key: "coach",
      icon: <MessageSquare size={28} />,
      iconClass: "coachIcon",
      title: "AI Coach",
      text: "Guidance grounded in your roadmap and progress",
      ...accountFeature,
      to: "/coach",
    },
  ];

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="logo">PA</div>
          <span className="brandName brandGlow">PathwayAI</span>
        </div>

        <div className="topActions">
          {!enabled ? (
            // Build without accounts: explain instead of a dead end (ADR-011).
            <>
              <button type="button" className="ghostBtn" aria-haspopup="dialog" onClick={() => setAccountsDialogOpen(true)}>
                Log in
              </button>
              <button type="button" className="uiverseBtn" aria-haspopup="dialog" onClick={() => setAccountsDialogOpen(true)}>
                Sign up
              </button>
            </>
          ) : user ? (
            <button type="button" className="uiverseBtn" onClick={() => navigate("/home")}>
              Your home
            </button>
          ) : (
            <>
              <button type="button" className="ghostBtn" onClick={() => navigate("/login")}>
                Log in
              </button>
              <button type="button" className="uiverseBtn" onClick={() => navigate("/login", { state: { mode: "signup" } })}>
                Sign up
              </button>
            </>
          )}
        </div>
      </header>

      <main className="container">
        <section className="hero heroSplit">
          <motion.div className="heroLeft" variants={heroContainer} initial="hidden" animate="show">
            <motion.span variants={heroItem} className="heroEyebrow">
              <Sparkles size={14} />
              AI-powered tech career guidance
            </motion.span>

            <motion.h1 variants={heroItem} className="title">
              Find your path. Build your <span className="titleGradient">tech roadmap</span>. Improve your future.
            </motion.h1>

            <motion.p variants={heroItem} className="subtitle">
              Answer a few questions and get personalized tech career matches, a step-by-step learning roadmap,
              résumé feedback and an AI coach that knows your progress.
            </motion.p>

            <motion.div variants={heroItem} className="ctaRow">
              <button type="button" className="uiverseBtn ctaBtn" onClick={() => navigate("/quiz")}>
                Get Started
                <ArrowRight size={18} className="ctaArrow" />
              </button>
            </motion.div>

            <motion.p variants={heroItem} className="heroHint">
              Free to try &middot; 5 questions, under 2 minutes &middot; no account needed
            </motion.p>
          </motion.div>

          <motion.div className="heroRight" variants={cardsContainer} initial="hidden" animate="show">
            <div className="landingFeatureGrid">
              {features.map((f) => (
                <motion.button
                  key={f.key}
                  type="button"
                  variants={cardItem}
                  whileHover={f.live ? { y: -6 } : undefined}
                  className={`landingFeatureCard landingFeatureCard--live landingFeatureCard--${f.key}`}
                  onClick={() => navigate(f.to)}
                >
                  <span className={`landingFeatureIcon ${f.iconClass}`}>{f.icon}</span>
                  <span className="landingFeatureText">
                    <span className="landingFeatureTitle">{f.title}</span>
                    <span className="landingFeatureSub">{f.text}</span>
                    <span className={`landingBadge ${f.key === "roadmap" ? "landingBadge--live" : "landingBadge--soon"}`}>
                      {f.key === "roadmap" && <span className="landingBadgeDot" />}
                      {f.badge}
                    </span>
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="landingSection" aria-labelledby="howTitle">
          <h2 className="landingSectionTitle" id="howTitle">How PathwayAI works</h2>
          <ol className="landingSteps">
            {STEPS.map((step, i) => (
              <li key={step.title} className="landingStep">
                <span className="landingStepIcon">{step.icon}</span>
                <span className="landingStepNumber">Step {i + 1}</span>
                <h3 className="landingStepTitle">{step.title}</h3>
                <p className="landingStepText">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landingSection landingAbout" id="about" aria-labelledby="aboutTitle">
          <h2 className="landingSectionTitle" id="aboutTitle">About PathwayAI</h2>
          <p className="landingAboutText">
            PathwayAI turns a vague interest in tech into a concrete, trackable plan. It was built by Yussaf Zarifi as
            a full-stack project: a React and Vite front end, a FastAPI back end that keeps every AI call on the
            server, Google Gemini with strictly validated structured output, and Supabase for accounts and a
            Postgres database protected by row-level security.
          </p>
          <ul className="landingFacts">
            <li><TrendingUp size={16} aria-hidden="true" /> Honest by design: AI estimates are labelled as estimates, and nothing is simulated.</li>
            <li><FileText size={16} aria-hidden="true" /> Privacy first: résumé PDFs are never stored, and you can export or delete your data at any time.</li>
            <li><Route size={16} aria-hidden="true" /> No account needed to start; sign in to keep your roadmaps, reviews and coach conversations.</li>
          </ul>
        </section>
      </main>

      {!enabled && (
        <AccountsSoonDialog
          isOpen={accountsDialogOpen}
          onClose={() => setAccountsDialogOpen(false)}
          onTakeQuiz={() => navigate("/quiz")}
        />
      )}
    </div>
  );
}
