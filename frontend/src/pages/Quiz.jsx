// src/pages/Quiz.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import AppHeader from "../components/AppHeader";
import { QUESTIONS } from "../data/questions";
import { trackEvent, trackMetric, startSession, endSession, EVENT_TYPES, METRIC_NAMES } from "../lib/trackingEngine";

export default function Quiz() {
  const questions = useMemo(() => QUESTIONS, []);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [quizStartTime] = useState(() => Date.now());
  // After Continue/Back, keyboard and screen-reader focus moves to the new
  // question's heading once it has animated in (TD-54).
  const focusNextTitle = useRef(false);
  const navigate = useNavigate();

  // Track session start on mount
  useEffect(() => {
    startSession();
    trackEvent(EVENT_TYPES.QUIZ_STARTED, {
      totalQuestions: questions.length,
    });

    // Track session end on unmount
    return () => {
      endSession();
    };
  }, [questions.length]);

  // Current question
  const q = questions[step];
  const currentAnswer = answers[q.id];

  // Progress for the bar
  const progress = Math.round(((step + 1) / questions.length) * 100);

  // Tracking runs here, outside the state updater (no side effects in updaters).
  function setAnswer(id, value) {
    const next = { ...answers, [id]: value };
    setAnswers(next);

    trackEvent(EVENT_TYPES.QUIZ_QUESTION_ANSWERED, { questionId: id, answer: value });
    trackMetric(METRIC_NAMES.QUIZ_QUESTIONS_ANSWERED, Object.keys(next).length);
  }

  function toggleMulti(opt) {
    const selected = Array.isArray(currentAnswer) ? currentAnswer : [];
    if (selected.includes(opt)) {
      setAnswer(q.id, selected.filter((o) => o !== opt));
    } else if (selected.length < q.max) {
      setAnswer(q.id, [...selected, opt]);
    }
  }

  // Free text: not tracked per keystroke; it's part of the completed answers.
  function setFollowUp(value) {
    setAnswers((prev) => ({ ...prev, [q.followUp.id]: value }));
  }

  function next() {
    const isLast = step === questions.length - 1;

    if (!isLast) {
      focusNextTitle.current = true;
      setStep((s) => s + 1);
      return;
    }

    // Send the optional field only when it has content.
    const finalAnswers = { ...answers };
    const extra = q.followUp && String(finalAnswers[q.followUp.id] ?? "").trim();
    if (q.followUp) {
      if (extra) finalAnswers[q.followUp.id] = extra;
      else delete finalAnswers[q.followUp.id];
    }

    // Track quiz completion
    const timeSpent = Date.now() - quizStartTime;
    trackEvent(EVENT_TYPES.QUIZ_COMPLETED, {
      answers: finalAnswers,
      totalQuestions: questions.length,
      timeSpent,
    });
    trackMetric(METRIC_NAMES.QUIZ_SCORE, 100); // Assume 100 for completion
    trackMetric(METRIC_NAMES.QUIZ_TIME_SPENT, timeSpent);

    // last question: go to /results and pass answers through navigation state
    navigate("/results", { state: { answers: finalAnswers } });
  }

  function prev() {
    focusNextTitle.current = true;
    setStep((s) => Math.max(0, s - 1));
  }

  const canContinue =
    q.type === "multi"
      ? Array.isArray(currentAnswer) && currentAnswer.length > 0
      : currentAnswer !== undefined && currentAnswer !== null && currentAnswer !== "";

  const multiSelected = q.type === "multi" && Array.isArray(currentAnswer) ? currentAnswer : [];
  const followUpValue = q.followUp ? answers[q.followUp.id] ?? "" : "";
  const titleId = `q-${q.id}`;

  return (
    <div className="quizPage">
      <AppHeader />
      <main className="quizBody">
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
            className="quizStep"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.22 }}
          >
            <h1
              className="qTitle"
              id={titleId}
              tabIndex={-1}
              ref={(el) => {
                if (el && focusNextTitle.current) {
                  focusNextTitle.current = false;
                  el.focus({ preventScroll: true });
                }
              }}
            >
              {q.title}
            </h1>
            {q.subtitle && <p className="qSub">{q.subtitle}</p>}

            {/* ✅ Single choice */}
            {q.type === "choice" && (
              <div className="choiceList" role="group" aria-labelledby={titleId}>
                {q.options.map((opt) => {
                  const selected = currentAnswer === opt;
                  return (
                    <button
                      type="button"
                      key={opt}
                      className={`choiceBtn ${selected ? "selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => setAnswer(q.id, opt)}
                    >
                      <div className={`radio ${selected ? "on" : ""}`} />
                      <div className="choiceMain">{opt}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ✅ Multiple choice (up to q.max) */}
            {q.type === "multi" && (
              <>
                <div className="choiceGrid" role="group" aria-labelledby={titleId}>
                  {q.options.map((opt) => {
                    const selected = multiSelected.includes(opt);
                    const full = !selected && multiSelected.length >= q.max;
                    return (
                      <button
                        type="button"
                        key={opt}
                        className={`choiceBtn ${selected ? "selected" : ""}`}
                        aria-pressed={selected}
                        disabled={full}
                        onClick={() => toggleMulti(opt)}
                      >
                        <div className={`checkbox ${selected ? "on" : ""}`} />
                        <div className="choiceMain">{opt}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="choiceCount" aria-live="polite">
                  {multiSelected.length} of {q.max} selected
                </p>
              </>
            )}

            {/* ✅ Large buttons */}
            {q.type === "buttons" && (
              <div className="hoursGrid" role="group" aria-labelledby={titleId}>
                {q.options.map((opt) => {
                  const selected = currentAnswer === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      className={`hoursBtn ${selected ? "selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => setAnswer(q.id, opt.value)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ✅ Optional follow-up field */}
            {q.followUp && (
              <div className="quizFollowUp">
                <label className="quizFollowUpLabel" htmlFor={q.followUp.id}>
                  {q.followUp.label} <span className="quizFollowUpHint">{q.followUp.hint}</span>
                </label>
                <input
                  id={q.followUp.id}
                  className="textInput"
                  placeholder={q.followUp.placeholder}
                  maxLength={q.followUp.maxLength}
                  value={followUpValue}
                  onChange={(e) => setFollowUp(e.target.value)}
                />
                <div className="quizChips">
                  {q.followUp.suggestions.map((s) => {
                    const selected = followUpValue === s;
                    return (
                      <button
                        type="button"
                        key={s}
                        className={`quizChip ${selected ? "selected" : ""}`}
                        aria-pressed={selected}
                        onClick={() => setFollowUp(selected ? "" : s)}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
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
                className="uiverseBtn large"
                onClick={next}
                disabled={!canContinue}
              >
                {step === questions.length - 1 ? "See results" : "Continue"}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      </main>
    </div>
  );
}
