// src/pages/Quiz.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { QUESTIONS } from "../data/questions";
import { trackEvent, trackMetric, startSession, endSession, EVENT_TYPES, METRIC_NAMES } from "../lib/trackingEngine";

export default function Quiz() {
  const questions = useMemo(() => QUESTIONS, []);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [quizStartTime, setQuizStartTime] = useState(Date.now());
  const navigate = useNavigate();

  // Track session start on mount
  useEffect(() => {
    startSession();
    trackEvent(EVENT_TYPES.QUIZ_STARTED, {
      totalQuestions: questions.length,
    });

    setQuizStartTime(Date.now());

    // Track session end on unmount
    return () => {
      endSession();
    };
  }, []);

  // Track question answered
  function trackQuestionAnswer(questionId, answer) {
    trackEvent(EVENT_TYPES.QUIZ_QUESTION_ANSWERED, {
      questionId,
      answer,
    });

    const totalAnswered = Object.keys({ ...answers, [questionId]: answer }).length;
    trackMetric(METRIC_NAMES.QUIZ_QUESTIONS_ANSWERED, totalAnswered);
  }

  // Current question
  const q = questions[step];

  // ✅ Initialize slider questions so 0 is a valid saved answer
  useEffect(() => {
    if (!q) return;

    if (q.type === "slider" && answers[q.id] === undefined) {
      setAnswers((prev) => ({
        ...prev,
        [q.id]: typeof q.min === "number" ? q.min : 0,
      }));
    }
    // only run when question changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id]);

  // Progress for the bar
  const progress = Math.round(((step + 1) / questions.length) * 100);

  function setAnswer(value) {
    setAnswers((prev) => {
      const newAnswers = { ...prev, [q.id]: value };
      trackQuestionAnswer(q.id, value);
      return newAnswers;
    });
  }

  function next() {
    const isLast = step === questions.length - 1;

    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }

    // Track quiz completion
    const timeSpent = Date.now() - quizStartTime;
    trackEvent(EVENT_TYPES.QUIZ_COMPLETED, {
      answers,
      totalQuestions: questions.length,
      timeSpent,
    });
    trackMetric(METRIC_NAMES.QUIZ_SCORE, 100); // Assume 100 for completion
    trackMetric(METRIC_NAMES.QUIZ_TIME_SPENT, timeSpent);

    // last question: go to /results and pass answers through navigation state
    navigate("/results", { state: { answers } });
  }

  function prev() {
    setStep((s) => Math.max(0, s - 1));
  }

  const currentAnswer = answers[q?.id];

  const sliderValue =
    q?.type === "slider"
      ? currentAnswer ?? (typeof q.min === "number" ? q.min : 0)
      : 0;
  const sliderPct =
    q?.type === "slider" && q.max > q.min
      ? ((sliderValue - q.min) / (q.max - q.min)) * 100
      : 0;
  const sliderTickCount =
    q?.type === "slider" ? Math.round((q.max - q.min) / q.step) + 1 : 0;

  // ✅ Allow slider = 0, require choice selection, require text non-empty
  const canContinue =
    q?.type === "text"
      ? String(currentAnswer ?? "").trim().length > 0
      : q?.type === "slider"
      ? currentAnswer !== undefined && currentAnswer !== null
      : currentAnswer !== undefined && currentAnswer !== null && currentAnswer !== "";

  return (
    <div className="quizPage">
      {/* ✅ Progress bar at the top */}
      <div className="quizTop">
        <div className="progressWrap">
          <div className="progressBar">
            <div className="progressFill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progressText">
            {step + 1} / {questions.length}
          </div>
        </div>
      </div>

      {/* ✅ Animated question card */}
      <div className="quizCard">
        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.22 }}
          >
            <h1 className="qTitle">{q.title}</h1>
            {q.subtitle && <p className="qSub">{q.subtitle}</p>}

            {/* ✅ Multiple choice */}
            {q.type === "choice" && (
              <div className="choiceList">
                {q.options.map((opt) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      type="button"
                      key={opt}
                      className={`choiceBtn ${selected ? "selected" : ""}`}
                      onClick={() => setAnswer(opt)}
                    >
                      <div className={`radio ${selected ? "on" : ""}`} />
                      <div className="choiceMain">{opt}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ✅ Text input */}
            {q.type === "text" && (
              <input
                className="textInput"
                placeholder={q.placeholder || ""}
                maxLength={q.maxLength}
                value={answers[q.id] || ""}
                onChange={(e) => setAnswer(e.target.value)}
              />
            )}

            {/* ✅ Slider */}
            {q.type === "slider" && (
              <div className="sliderWrap">
                <div className="sliderTrackWrap">
                  {/* Floating value bubble, follows the thumb */}
                  <motion.div
                    className="sliderBubble"
                    initial={false}
                    animate={{ left: `${sliderPct}%` }}
                    transition={{ type: "spring", stiffness: 350, damping: 32 }}
                  >
                    {sliderValue}
                    <span className="sliderBubbleUnit">{q.unit || ""}</span>
                  </motion.div>

                  {/* Track background + gradient fill */}
                  <div className="sliderTrack">
                    <div
                      className="sliderTrackFill"
                      style={{ width: `${sliderPct}%` }}
                    />
                    <div className="sliderTicks">
                      {Array.from({ length: sliderTickCount }).map((_, i) => (
                        <span key={i} className="sliderTick" />
                      ))}
                    </div>
                    <motion.div
                      className="sliderThumb"
                      initial={false}
                      animate={{ left: `${sliderPct}%` }}
                      transition={{ type: "spring", stiffness: 350, damping: 32 }}
                    />
                  </div>

                  {/* Real input: invisible, handles drag/keyboard/a11y */}
                  <input
                    type="range"
                    className="sliderInput"
                    min={q.min}
                    max={q.max}
                    step={q.step}
                    value={sliderValue}
                    onChange={(e) => setAnswer(Number(e.target.value))}
                    aria-label={q.title}
                  />
                </div>

                {/* Min / Max labels */}
                {q.labels && (
                  <div className="sliderLabels">
                    <span>{q.labels[0]}</span>
                    <span>{q.labels[1]}</span>
                  </div>
                )}
              </div>
            )}

            {/* ✅ Navigation buttons */}
            <div className="quizBottom">
              <button
                type="button"
                className="ghostBtn large"
                onClick={prev}
                disabled={step === 0}
              >
                Back
              </button>

              <button
                type="button"
                className={`uiverseBtn large ${q.type === "slider" ? "sliderBtn" : ""}`}
                onClick={next}
                disabled={!canContinue}
              >
                {step === questions.length - 1 ? "See results" : "Continue"}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
