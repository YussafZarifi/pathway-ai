import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  GraduationCap,
  Briefcase,
  Code,
  Palette,
  Stethoscope,
  Laptop,
  User,
  Heart,
  Globe,
  Layout,
  Database,
  Megaphone,
  Camera,
  Mic,
  PenTool,
  Lightbulb,
  Target,
  RefreshCw,
  Share2,
  BarChart3,
} from "lucide-react";
import CareerCompareModal from "../components/CareerCompareModal";
import ShareModal from "../components/ShareModal";
import { CAREER_DETAILS } from "../data/careerDetails";
import {
  trackEvent,
  trackMetric,
  EVENT_TYPES,
  METRIC_NAMES,
} from "../lib/trackingEngine";
import { errorMessage, requestCareers } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { repositoryFor } from "../lib/roadmaps";

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();

  const answers = location.state?.answers;

  const [aiResult, setAiResult] = useState(null);
  const [selectedCareer, setSelectedCareer] = useState("");

  const [loadingCareers, setLoadingCareers] = useState(true);
  const [loadingRoadmap, setLoadingRoadmap] = useState(false);
  const [error, setError] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState(new Set());
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [expandedCareer, setExpandedCareer] = useState(null);

  const canGenerate = selectedCareer && selectedCareer !== "NONE_OF_THESE";
  const canCompare = selectedForCompare.size >= 2;

  const showLoader =
    loadingCareers || (!aiResult && !error && !!answers);

  const getIconForCareer = (careerTitle) => {
    const careerLower = careerTitle?.toLowerCase() || "";

    if (
      careerLower.includes("doctor") ||
      careerLower.includes("nurse") ||
      careerLower.includes("health") ||
      careerLower.includes("medical")
    ) {
      return { icon: Stethoscope, color: "#ff6b6b" };
    }
    if (
      careerLower.includes("engineer") ||
      careerLower.includes("developer") ||
      careerLower.includes("software") ||
      careerLower.includes("tech")
    ) {
      return { icon: Code, color: "#22c55e" };
    }
    if (
      careerLower.includes("designer") ||
      careerLower.includes("artist") ||
      careerLower.includes("creative")
    ) {
      return { icon: Palette, color: "#ec4899" };
    }
    if (careerLower.includes("teacher") || careerLower.includes("education")) {
      return { icon: GraduationCap, color: "#f59e0b" };
    }
    if (
      careerLower.includes("manager") ||
      careerLower.includes("business") ||
      careerLower.includes("corporate")
    ) {
      return { icon: Briefcase, color: "#8b5cf6" };
    }
    if (
      careerLower.includes("data") ||
      careerLower.includes("analyst") ||
      careerLower.includes("science")
    ) {
      return { icon: Database, color: "#3b82f6" };
    }
    if (
      careerLower.includes("sales") ||
      careerLower.includes("marketing") ||
      careerLower.includes("communication")
    ) {
      return { icon: Megaphone, color: "#06b6d4" };
    }
    if (
      careerLower.includes("media") ||
      careerLower.includes("content") ||
      careerLower.includes("film")
    ) {
      return { icon: Camera, color: "#e11d48" };
    }
    if (
      careerLower.includes("consultant") ||
      careerLower.includes("advisor") ||
      careerLower.includes("coach")
    ) {
      return { icon: Mic, color: "#a855f7" };
    }
    if (
      careerLower.includes("writer") ||
      careerLower.includes("journalist") ||
      careerLower.includes("content creator")
    ) {
      return { icon: PenTool, color: "#f97316" };
    }
    if (careerLower.includes("architect") || careerLower.includes("planner")) {
      return { icon: Layout, color: "#6366f1" };
    }
    if (
      careerLower.includes("psychologist") ||
      careerLower.includes("therapist") ||
      careerLower.includes("mental")
    ) {
      return { icon: User, color: "#ff6b9b" };
    }

    return { icon: Briefcase, color: "#8b5cf6" };
  };

  useEffect(() => {
    if (!answers) {
      navigate("/quiz");
      return;
    }

    const controller = new AbortController();

    setLoadingCareers(true);
    setError("");
    setAiResult(null);
    setSelectedCareer("");

    async function fetchCareers() {
      try {
        const data = await requestCareers(answers, { signal: controller.signal });

        setAiResult({
          explanation:
            data.explanation || "Here are a few options based on your answers.",
          careers: data.careers,
        });

        // Track career suggestions generated
        trackEvent(EVENT_TYPES.CAREER_SUGGESTIONS_GENERATED, {
          careers: data.careers || [],
          explanation: data.explanation,
        });
      } catch (e) {
        // An aborted request (leaving the page) is not an error (TD-53).
        if (e.name !== "AbortError") {
          console.error("[PathwayAI] Career suggestions failed:", e?.status ?? e?.name);
          setError(errorMessage(e, "Could not generate results. Please try again."));
        }
      } finally {
        setLoadingCareers(false);
      }
    }

    fetchCareers();

    return () => controller.abort();
  }, [answers, navigate, location.key]);

  async function generateRoadmap() {
    if (!canGenerate) return;

    try {
      setLoadingRoadmap(true);
      setError("");

      const selectedCareerData = aiResult.careers.find(
        (c) => c.title === selectedCareer
      );

      // Generates and saves: in this browser for guests, in the account
      // for signed-in users (ADR-019).
      const saved = await repositoryFor(session).generate({
        answers,
        career: selectedCareer,
        careerData: selectedCareerData || null,
      });
      const steps = saved.roadmap;

      // Track roadmap generation
      trackEvent(EVENT_TYPES.ROADMAP_GENERATED, {
        careerTitle: selectedCareer,
        totalSteps: steps.length,
      });
      trackMetric(METRIC_NAMES.ROADMAP_STEPS_TOTAL, steps.length);

      // Track career selection with match score
      if (selectedCareerData) {
        trackEvent(EVENT_TYPES.CAREER_SELECTED, {
          careerTitle: selectedCareer,
          matchScore: selectedCareerData.match_score || 85,
          salaryRange: selectedCareerData.salary_range,
          growthRate: selectedCareerData.growth_rate,
        });
        trackMetric(METRIC_NAMES.CAREER_MATCH_SCORE, selectedCareerData.match_score || 85);
      }

      navigate("/dashboard", {
        state: { career: selectedCareer, roadmap: steps },
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error("[PathwayAI] Roadmap generation failed:", e?.status ?? e?.name);
        setError(errorMessage(e, "Could not generate roadmap. Please try again."));
      }
    } finally {
      setLoadingRoadmap(false);
    }
  }

  async function regenerateCareers() {
    if (!answers) return;

    try {
      setLoadingCareers(true);
      setError("");
      setAiResult(null);
      setSelectedCareer("");
      window.scrollTo(0, 0);

      const data = await requestCareers(answers);
      setAiResult({
        explanation:
          data.explanation || "Here are more options based on your answers.",
        careers: data.careers,
      });

      // Track career regeneration
      trackEvent(EVENT_TYPES.CAREER_REGENERATED, {});
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error("[PathwayAI] Regenerating careers failed:", e?.status ?? e?.name);
        setError(errorMessage(e, "Could not regenerate results. Please try again."));
      }
    } finally {
      setLoadingCareers(false);
    }
  }

  function toggleCompare(careerTitle) {
    setSelectedForCompare((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(careerTitle)) {
        newSet.delete(careerTitle);
      } else if (newSet.size < 3) {
        newSet.add(careerTitle);
      }
      return newSet;
    });
  }

  function toggleCareerExpansion(careerTitle) {
    setExpandedCareer((prev) => (prev === careerTitle ? null : careerTitle));
  }

  return (
    <div className="resultsPage">
      <div className="resultsCard">
        <div className="resultsHeader">
          <h1 className="resultsTitleMain">Your Career Matches</h1>
          <div className="resultsHeaderActions">
            <button
              className="iconBtn"
              onClick={regenerateCareers}
              disabled={loadingCareers}
              title="Regenerate suggestions"
            >
              <RefreshCw size={20} className={loadingCareers ? "spin" : ""} />
            </button>
            <button
              className="iconBtn"
              onClick={() => setShowShareModal(true)}
              title="Download or print"
              aria-label="Download or print results"
            >
              <Share2 size={20} />
            </button>
          </div>
        </div>

        {showLoader && (
          <div className="loadingIconPhase">
            <div className="loader-wrapper">
              <span className="loader-letter">G</span>
              <span className="loader-letter">e</span>
              <span className="loader-letter">n</span>
              <span className="loader-letter">e</span>
              <span className="loader-letter">r</span>
              <span className="loader-letter">a</span>
              <span className="loader-letter">t</span>
              <span className="loader-letter">i</span>
              <span className="loader-letter">n</span>
              <span className="loader-letter">g</span>
              <div className="loader"></div>
            </div>
            <div className="loadingTextIcon">
              <h2 className="loadingTitle">AI is analyzing your profile</h2>
              <p className="loadingSubIcon">
                Matching your skills with career paths...
              </p>
            </div>
          </div>
        )}

        {!showLoader && error && (
          <div className="resultsError">
            <p className="qSub">{error}</p>
            <div className="resultsActions">
              <button
                className="uiverseBtn large"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
              <button
                className="ghostBtn large"
                onClick={() => navigate("/quiz")}
              >
                Back to quiz
              </button>
            </div>
          </div>
        )}

        {!showLoader && !error && aiResult && (
          <>
            <p className="resultsSummary">{aiResult.explanation}</p>
            <p className="resultsEstimateNote">
              Sorted by match. Match %, salaries (US dollars, full-time) and growth are AI estimates to help you
              compare, not measurements or offers.
            </p>

            {!aiResult.careers || aiResult.careers.length === 0 ? (
              <div className="resultsEmpty">
                <p className="qSub">
                  No suggestions came back. Try retaking the quiz.
                </p>
                <div className="resultsActions">
                  <button
                    className="uiverseBtn large"
                    onClick={() => navigate("/quiz")}
                  >
                    Retake quiz
                  </button>
                  <button
                    className="ghostBtn large"
                    onClick={() => navigate("/")}
                  >
                    Back to home
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="resultsToolbar">
                  <button
                    type="button"
                    className="compareToggleBtn"
                    aria-pressed={compareMode}
                    onClick={() => setCompareMode(!compareMode)}
                  >
                    <BarChart3 size={18} aria-hidden="true" />
                    {compareMode ? "Done comparing" : "Compare Careers"}
                  </button>

                  {compareMode && selectedForCompare.size > 0 && (
                    <span className="compareCount">
                      {selectedForCompare.size} selected
                    </span>
                  )}

                  {compareMode && canCompare && (
                    <button
                      className="compareBtn"
                      onClick={() => setShowCompareModal(true)}
                    >
                      Compare Selected ({selectedForCompare.size})
                    </button>
                  )}
                </div>

                <div className="careerStack">
                  <AnimatePresence mode="popLayout">
                    {aiResult.careers.map((career, index) => {
                      const selected = selectedCareer === career.title;
                      const isSelectedForCompare =
                        selectedForCompare.has(career.title);
                      const isExpanded = expandedCareer === career.title;
                      const matchScore = career.match_score || 85;
                      const details = CAREER_DETAILS[career.title];
                      const { icon: Icon, color } =
                        getIconForCareer(career.title);

                      return (
                        <motion.div
                          key={career.title}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ delay: index * 0.15 }}
                          layout
                          className="careerRow"
                        >
                          {/* Outside the card button, so comparing never selects (TD-50). */}
                          {compareMode && (
                            <label className="careerCompareCheck">
                              <input
                                type="checkbox"
                                className="careerCheckbox"
                                checked={isSelectedForCompare}
                                disabled={
                                  !isSelectedForCompare &&
                                  selectedForCompare.size >= 3
                                }
                                onChange={() => toggleCompare(career.title)}
                              />
                              <span className="srOnly">
                                Compare {career.title}
                              </span>
                            </label>
                          )}
                          <button
                            type="button"
                            className={`careerCard ${
                              selected ? "selected" : ""
                            } ${isExpanded ? "expanded" : ""}`}
                            aria-pressed={selected}
                            aria-expanded={!compareMode ? isExpanded : undefined}
                            onClick={() => {
                              setSelectedCareer(career.title);
                              if (!compareMode)
                                toggleCareerExpansion(career.title);
                            }}
                          >
                            <div className="careerHeader">
                              <div className="careerHeaderLeft">
                                <div className="careerName">
                                  {career.title}
                                </div>
                              </div>

                              <div className="careerHeaderRight">
                                <div className="careerIconBadge">
                                  <motion.div
                                    initial={{
                                      scale: 0,
                                      rotate: -180,
                                    }}
                                    animate={{
                                      scale: 1,
                                      rotate: 0,
                                    }}
                                    transition={{
                                      duration: 0.5,
                                      delay: 0.3 + index * 0.15,
                                    }}
                                  >
                                    <Icon size={20} color={color} />
                                  </motion.div>
                                </div>

                                <div className="careerMatchBadge">
                                  <span className="matchScore">
                                    {matchScore}%
                                  </span>
                                  <span className="matchLabel">Match</span>
                                </div>
                                <div className="careerPill">
                                  {selected ? "Selected" : "Pick"}
                                </div>
                              </div>
                            </div>

                            <div className="careerMeta">
                              {career.salary_range && (
                                <span className="careerMetaItem">
                                  <DollarSign size={14} />
                                  {career.salary_range}
                                </span>
                              )}
                              {career.growth_rate && (
                                <span
                                  className={`careerMetaItem ${
                                    career.growth_rate.includes("+")
                                      ? "positive"
                                      : ""
                                  }`}
                                >
                                  <TrendingUp size={14} />
                                  {career.growth_rate}
                                </span>
                              )}
                            </div>

                            {career.skills && career.skills.length > 0 && (
                              <div className="careerSkills">
                                {career.skills.slice(0, 4).map((skill, idx) => (
                                  <span
                                    key={idx}
                                    className="careerSkillTag"
                                  >
                                    {skill}
                                  </span>
                                ))}
                                {career.skills.length > 4 && (
                                  <span className="careerSkillTag more">
                                    +{career.skills.length - 4}
                                  </span>
                                )}
                              </div>
                            )}

                            {isExpanded && (
                              <motion.div
                                className="careerExpanded"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{
                                  height: "auto",
                                  opacity: 1,
                                }}
                                transition={{ duration: 0.2 }}
                              >
                                <div className="careerExpandedContent">
                                  <div className="careerExpandedSection">
                                    <h4 className="careerExpandedTitle">
                                      Why this fits
                                    </h4>
                                    <p className="careerExpandedText">
                                      {career.reason}
                                    </p>
                                  </div>

                                  {details && (
                                    <div className="careerExpandedSection">
                                      <h4 className="careerExpandedTitle">
                                        Career Overview
                                      </h4>
                                      <div className="careerDetails">
                                        <div className="careerDetailRow">
                                          <GraduationCap size={16} />
                                          <span>
                                            {details.education ||
                                              career.education ||
                                              "Varies"}
                                          </span>
                                        </div>
                                        <div className="careerDetailRow">
                                          <Briefcase size={16} />
                                          <span>
                                            {details.workEnvironment ||
                                              "Various"}
                                          </span>
                                        </div>
                                        <div className="careerDetailRow">
                                          <Target size={16} />
                                          <span>
                                            {details.jobOutlook ||
                                              "Growing field"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  <div className="careerRow">
                  {/* Keeps "None of these" aligned with the checkbox column. */}
                  {compareMode && (
                    <span className="careerCompareCheck" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className={`careerCard noneCard ${
                      selectedCareer === "NONE_OF_THESE"
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedCareer("NONE_OF_THESE");
                    }}
                  >
                    <div className="careerHeader">
                      <div className="careerHeaderLeft">
                        <div className="careerName">None of these</div>
                      </div>
                      <div className="careerHeaderRight">
                        <div className="careerPill">
                          {selectedCareer === "NONE_OF_THESE"
                            ? "Selected"
                            : "Pick"}
                        </div>
                      </div>
                    </div>
                    <div className="careerHoverHint">
                      If nothing matches
                    </div>
                    <div className="careerTooltip">
                      <div className="careerTooltipTitle">
                        What happens next?
                      </div>
                      <div className="careerTooltipText">
                        Retake the quiz or adjust answers to get different
                        suggestions.
                      </div>
                    </div>
                  </button>
                  </div>
                </div>

                <div className="resultsActions">
                  {selectedCareer === "NONE_OF_THESE" ? (
                    <button
                      className="uiverseBtn large"
                      onClick={() => navigate("/quiz")}
                    >
                      Retake quiz
                    </button>
                  ) : (
                    <button
                      className="uiverseBtn large"
                      onClick={generateRoadmap}
                      disabled={!canGenerate || loadingRoadmap}
                      style={
                        !canGenerate
                          ? {
                              opacity: 0.55,
                              cursor: "not-allowed",
                            }
                          : undefined
                      }
                    >
                      {loadingRoadmap
                        ? "Generating roadmap…"
                        : "Generate roadmap"}
                    </button>
                  )}

                  <button
                    className="ghostBtn large"
                    onClick={() => navigate("/")}
                  >
                    Back to home
                  </button>
                </div>

                {loadingRoadmap && (
                  <div className="roadmapLoading">
                    <div className="shimmerLine" />
                    <div className="shimmerLine" />
                    <div className="shimmerLine" />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <CareerCompareModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        selectedCareers={Array.from(selectedForCompare)}
        careerData={aiResult?.careers || []}
      />

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        selectedCareer={selectedCareer}
      />
    </div>
  );
}
