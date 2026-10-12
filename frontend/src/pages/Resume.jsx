import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  ChevronDown,
  CircleHelp,
  FileText,
  History,
  Lock,
  Map,
  ShieldCheck,
  Shield,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
} from "lucide-react";
import AppHeader from "../components/AppHeader";
import Dialog from "../components/Dialog";
import AnalysisView from "../components/resume/AnalysisView";
import { errorMessage } from "../lib/api";
import { withTimeout } from "../lib/withTimeout";
import { useAuth } from "../lib/authContext";
import {
  analyze,
  checkAvailability,
  deleteAnalysis,
  fileProblem,
  listAnalyses,
  normalizeAnalysis,
} from "../lib/resume";

const ANALYZE_FAILED = "We couldn't analyze your résumé right now. Please try again.";
const AVAILABILITY_FAILED = "We couldn't check whether résumé analysis is available. Please try again.";

const AVAILABILITY_TIMEOUT = "The availability check took too long. Check your connection and try again.";
const AVAILABILITY_ABORTED = "The availability check was interrupted. Please try again.";
const AVAILABILITY_TIMEOUT_MS = 8_000;
const HISTORY_TIMEOUT = "Loading your saved reviews took too long. Check your connection and try again.";

function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("The request was aborted.", "AbortError"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("The request was aborted.", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function formatDate(ms) {
  return ms
    ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "";
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function StateCard({ icon, eyebrow = "RESUME ANALYZER", title, children, action }) {
  return (
    <section className="dashCard featureState resumeState">
      <span className="featureStateIcon" aria-hidden="true">
        {icon}
      </span>
      <p className="featureEyebrow">{eyebrow}</p>
      <h2 className="featureStateTitle">{title}</h2>
      <div className="featureStateText">{children}</div>
      {action && <div className="featureStateAction">{action}</div>}
    </section>
  );
}

function PrivacyCard() {
  return (
    <details className="resumePrivacy">
      <summary><ShieldCheck size={16} aria-hidden="true" /> Privacy and data use <ChevronDown size={15} aria-hidden="true" /></summary>
      <ul className="resumePrivacyList">
        <li><Shield size={15} aria-hidden="true" /><span>Your PDF is sent to Google Gemini once for this review.</span></li>
        <li><Lock size={15} aria-hidden="true" /><span>PathwayAI does not store the original PDF, its full text or its name.</span></li>
        <li><BadgeCheck size={15} aria-hidden="true" /><span>Your report and short, verified evidence excerpts are saved. Delete them whenever you like.</span></li>
      </ul>
      <p className="resumeNoScore"><CircleHelp size={14} aria-hidden="true" /> Scores use verified evidence and your selected career rubric.</p>
    </details>
  );
}

// The upload form: shown only when the API says analysis is available.
function UploadCard({ career, analyzing, error, progress, onAnalyze }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [problem, setProblem] = useState("");
  const [dragging, setDragging] = useState(false);

  function choose(next) {
    setFile(next);
    setProblem(next ? fileProblem(next) : "");
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (!analyzing) choose(event.dataTransfer.files?.[0] || null);
  }

  async function submit(event) {
    event.preventDefault();
    const issue = fileProblem(file);
    if (issue) {
      setProblem(issue);
      return;
    }
    const ok = await onAnalyze(file);
    if (ok) {
      // Drop the page's reference to the file once it has been analyzed.
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const message = problem || error;

  return (
    <form className="dashCard resumeUpload" onSubmit={submit} aria-busy={analyzing}>
      <div className="resumeUploadHeading">
        <div>
          <p className="featureEyebrow">PDF · MAX 2 MB</p>
          <h2>Upload your resume</h2>
        </div>
      </div>
      <p className="resumeTarget">
        Review tailored to <strong>{career}</strong>
      </p>

      <label
        htmlFor="resumePdf"
        className={`resumeDrop ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""} ${analyzing ? "resumeDrop--busy" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); if (!analyzing) setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <span className="resumeDropIcon"><UploadCloud size={23} aria-hidden="true" /></span>
        <span className="resumeDropTitle">{file ? "PDF ready to review" : "Drop your PDF here"}</span>
        <span className="resumeDropHint">or choose a file from your device</span>
        <span className="resumeDropMeta">Text-based PDF · up to 2 MB</span>
        <input
          ref={inputRef}
          id="resumePdf"
          type="file"
          accept="application/pdf,.pdf"
          className="resumeFileInput"
          onChange={(event) => choose(event.target.files?.[0] || null)}
          disabled={analyzing}
          aria-describedby="resumeUploadMessage"
        />
      </label>

      {file && (
        <div className="resumeSelectedFile">
          <span className="resumeSelectedIcon"><FileText size={17} aria-hidden="true" /></span>
          <span className="resumeSelectedCopy"><strong title={file.name}>{file.name}</strong><small>{formatSize(file.size)} · Private upload</small></span>
          {!analyzing && (
            <button type="button" className="resumeClearFile" onClick={() => { choose(null); if (inputRef.current) inputRef.current.value = ""; }}>
              Remove
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        className="dashBtn resumePickButton"
        onClick={() => inputRef.current?.click()}
        disabled={analyzing}
      >
        <UploadCloud size={16} aria-hidden="true" /> Upload resume
      </button>

      {analyzing && (
        <div className="resumeProgress" role="status" aria-live="polite">
          <div className="resumeProgressLabels">
            <span>{progress.phase === "reviewing" ? "Reviewing your experience" : "Uploading securely"}</span>
            <strong>{progress.phase === "reviewing" ? "AI review" : `${progress.percent}%`}</strong>
          </div>
          <progress max="100" value={progress.phase === "uploading" ? progress.percent : undefined} aria-label={progress.phase === "reviewing" ? "AI review in progress" : "PDF upload progress"} />
          <span className="resumeProgressHint">{progress.phase === "reviewing" ? "Organizing your personalized report…" : "Your PDF is sent for this review only."}</span>
        </div>
      )}

      <button
        type="submit"
        className="dashBtn dashBtn--primary resumeSubmit"
        disabled={analyzing || !file || Boolean(problem)}
      >
        {analyzing ? "Reviewing resume…" : "Analyze resume"}
        {!analyzing && <Sparkles size={16} aria-hidden="true" />}
      </button>

      <p id="resumeUploadMessage" className="dashError" role="alert">
        {message}
      </p>
      <p className="resumeUploadFootnote"><Lock size={13} aria-hidden="true" /> Your original PDF is not stored.</p>
    </form>
  );
}

function HistoryItem({ item, open, onToggle, onDelete, deleting }) {
  return (
    <li className={`resumeHistoryItem ${open ? "is-selected" : ""}`}>
      <div className="resumeHistoryHead">
        <button
          type="button"
          className="resumeHistoryToggle"
          aria-expanded={open}
          aria-controls="resume-current-report"
          onClick={onToggle}
        >
          <span className="resumeHistoryIcon"><FileText size={17} aria-hidden="true" /></span>
          <span className="resumeHistoryMeta">
            <span className="resumeHistoryTopline"><span className="resumeHistoryCareer">{item.career}</span><span className="resumeHistoryDate">{formatDate(item.createdAt)}</span></span>
            {!open && <span className="resumeHistorySummary">{item.summary}</span>}
            <span className="resumeHistoryView">{open ? "Viewing report" : "View report"}</span>
          </span>
          <ChevronDown size={18} className={`resumeChevron ${open ? "resumeChevron--open" : ""}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="dashBtn resumeDelete"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Delete the review from ${formatDate(item.createdAt)}`}
        >
          <Trash2 size={15} aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>
    </li>
  );
}

export default function Resume() {
  const navigate = useNavigate();
  const { enabled: accountsEnabled, loading: authLoading, user } = useAuth();
  const userId = user?.id || null;

  const [availability, setAvailability] = useState({ status: "loading", data: null });
  const [history, setHistory] = useState({ status: "loading", items: [], error: "" });
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ phase: "uploading", percent: 0 });
  const [uploadError, setUploadError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [historyError, setHistoryError] = useState("");
  const analyzeAbort = useRef(null);
  const availabilityRequest = useRef(0);
  const historyRequest = useRef(0);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [activeDataUser, setActiveDataUser] = useState(null);

  const refreshAvailability = useCallback(async (signal) => {
    const requestId = ++availabilityRequest.current;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) abortFromCaller();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, AVAILABILITY_TIMEOUT_MS);
    setAvailability({ status: "loading", data: null });
    try {
      const data = await withAbort(checkAvailability({ signal: controller.signal }), controller.signal);
      if (requestId === availabilityRequest.current) setAvailability({ status: "ready", data });
    } catch (e) {
      if (requestId !== availabilityRequest.current) return;
      const message = timedOut
        ? AVAILABILITY_TIMEOUT
        : signal?.aborted
          ? AVAILABILITY_ABORTED
          : errorMessage(e, AVAILABILITY_FAILED);
      setAvailability({
        status: e?.status === 401 ? "signed_out" : "error",
        data: null,
        error: message,
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const requestId = ++historyRequest.current;
    setHistory((prev) => ({ ...prev, status: "loading", error: "" }));
    try {
      const items = await withTimeout(listAnalyses(), AVAILABILITY_TIMEOUT_MS, HISTORY_TIMEOUT);
      if (requestId === historyRequest.current) setHistory({ status: "ready", items, error: "" });
    } catch (e) {
      if (requestId === historyRequest.current) {
        const message = e?.message === HISTORY_TIMEOUT ? HISTORY_TIMEOUT : errorMessage(e, "We couldn't load your previous reviews.");
        setHistory({ status: "error", items: [], error: message });
      }
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      availabilityRequest.current += 1;
      historyRequest.current += 1;
      setAvailability({ status: "loading", data: null });
      setHistory({ status: "loading", items: [], error: "" });
      setActiveDataUser(null);
      return undefined;
    }
    setActiveDataUser(userId);
    setAvailability({ status: "loading", data: null });
    setHistory({ status: "loading", items: [], error: "" });
    const controller = new AbortController();
    refreshAvailability(controller.signal);
    loadHistory();
    return () => controller.abort();
  }, [userId, refreshAvailability, loadHistory]);

  useEffect(() => {
    if (!authLoading) {
      setAuthTimedOut(false);
      return undefined;
    }
    const timeout = setTimeout(() => setAuthTimedOut(true), AVAILABILITY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [authLoading]);

  // Cancel an analysis in flight when leaving the page.
  useEffect(() => () => analyzeAbort.current?.abort(), []);

  async function runAnalysis(file, onUploadProgress) {
    setAnalyzing(true);
    setUploadProgress({ phase: "uploading", percent: 0 });
    setUploadError("");
    const controller = new AbortController();
    analyzeAbort.current = controller;
    try {
      const row = await analyze(file, { signal: controller.signal, onUploadProgress });
      const item = normalizeAnalysis(row);
      setHistory((prev) => ({ ...prev, items: [item, ...prev.items.filter((i) => i.id !== item.id)] }));
      setOpenId(item.id);
      return true;
    } catch (e) {
      if (controller.signal.aborted) return false;
      setUploadError(errorMessage(e, ANALYZE_FAILED));
      // The situation may have changed since the page loaded (feature
      // switched off, roadmap gone, signed out): re-check what's possible.
      if ([401, 409, 503].includes(e?.status)) refreshAvailability();
      return false;
    } finally {
      setAnalyzing(false);
      setUploadProgress({ phase: "uploading", percent: 0 });
      analyzeAbort.current = null;
    }
  }

  async function removeConfirmed() {
    const item = confirmDelete;
    setConfirmDelete(null);
    if (!item) return;
    setDeletingId(item.id);
    setHistoryError("");
    try {
      await deleteAnalysis(item.id);
      setHistory((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== item.id) }));
      if (openId === item.id) setOpenId(null);
    } catch (e) {
      setHistoryError(errorMessage(e, "We couldn't delete that review. Please try again."));
    } finally {
      setDeletingId(null);
    }
  }

  const selectedAnalysis = history.items.find((item) => item.id === openId) || null;

  function renderStatus() {
    if (availability.status === "loading") {
      return (
        <section className="dashCard resumeLoading" aria-busy="true" aria-label="Checking résumé analysis">
          <span className="resumeSkeleton resumeSkeleton--title" />
          <span className="resumeSkeleton resumeSkeleton--body" />
          <span className="resumeSkeleton resumeSkeleton--drop" />
          <p className="dashMuted" role="status">
            Checking résumé analysis…
          </p>
        </section>
      );
    }
    if (availability.status === "error" || availability.status === "signed_out") {
      return (
        <StateCard
          icon={availability.status === "signed_out" ? <UserRound size={26} /> : <FileText size={26} />}
          title={availability.status === "signed_out" ? "Sign in again to continue" : "Couldn't check résumé analysis"}
          action={
            <button
              type="button"
              className="homePrimaryBtn"
              onClick={() => availability.status === "signed_out"
                ? navigate("/login", { state: { from: "/resume" } })
                : refreshAvailability()}
            >
              {availability.status === "signed_out" ? "Sign in again" : "Try again"}
            </button>
          }
        >
          <p role="alert">{availability.error}</p>
        </StateCard>
      );
    }
    const { available, reason, career } = availability.data || {};
    if (available) {
      return (
        <UploadCard
          career={career}
          analyzing={analyzing}
          error={uploadError}
          progress={uploadProgress}
          onAnalyze={(file) => runAnalysis(file, setUploadProgress)}
        />
      );
    }
    if (reason === "no_active_roadmap") {
      return (
        <StateCard
          icon={<Map size={26} />}
          title="Create a roadmap first"
          action={
            <button type="button" className="homePrimaryBtn" onClick={() => navigate("/quiz")}>
              Take the career quiz
            </button>
          }
        >
          <p>Your résumé is reviewed against your current roadmap&apos;s career. Take the quiz and pick a career, then come back.</p>
          {uploadError && <p role="alert">{uploadError}</p>}
        </StateCard>
      );
    }
    return (
      <StateCard icon={<Lock size={26} />} title="Resume Analyzer isn't available yet">
        <p>
          Résumé reviews are switched off for now, so nothing can be uploaded. Your saved reviews below
          stay available, and you can delete them.
        </p>
        {uploadError && <p role="alert">{uploadError}</p>}
      </StateCard>
    );
  }

  let content;
  if (!accountsEnabled) {
    content = (
      <StateCard icon={<UserRound size={26} />} title="Resume Analyzer needs an account">
        <p>Reviews are saved to your account, and accounts aren&apos;t available in this version of PathwayAI.</p>
      </StateCard>
    );
  } else if (authLoading && !authTimedOut) {
    content = (
      <section className="dashCard resumeUpload" aria-busy="true">
        <p className="dashMuted" role="status">
          Loading…
        </p>
      </section>
    );
  } else if (!user || authTimedOut) {
    content = (
      <StateCard
        icon={<UserRound size={26} />}
        title={authTimedOut ? "Sign-in check is taking too long" : "Sign in to review your résumé"}
        action={
          <button
            type="button"
            className="homePrimaryBtn"
            onClick={() => navigate("/login", { state: { from: "/resume" } })}
          >
            {authTimedOut ? "Retry sign in" : "Sign in"}
          </button>
        }
      >
        <p>{authTimedOut ? "We couldn't confirm your session. Please sign in again to continue." : "Résumé reviews are saved to your account so you can come back to them, and delete them, on any device."}</p>
      </StateCard>
    );
  } else if (activeDataUser !== userId) {
    content = <section className="dashCard resumeLoading" aria-busy="true"><span className="resumeSkeleton resumeSkeleton--title" /><span className="resumeSkeleton resumeSkeleton--body" /><span className="resumeSkeleton resumeSkeleton--drop" /><p className="srOnly" role="status">Loading your résumé workspace…</p></section>;
  } else {
    content = (
      <>
        <div className="resumeWorkspace">
          {renderStatus()}
          {availability.data?.available && <PrivacyCard />}
        </div>

        {selectedAnalysis && <section id="resume-current-report" className="resumeCurrentReport" aria-labelledby="resumeCurrentReportTitle">
          <div className="resumeCurrentReportHead"><div><p>YOUR REVIEW</p><h2 id="resumeCurrentReportTitle">{selectedAnalysis.career}</h2></div>
            <span>{formatDate(selectedAnalysis.createdAt)}</span></div>
          <AnalysisView analysis={selectedAnalysis} currentRoadmapId={availability.data?.roadmap_id || null} />
        </section>}

        <section className="resumeHistory" aria-labelledby="resumeHistoryTitle">
          <div className="dashSectionHead">
            <h2 id="resumeHistoryTitle" className="dashSectionTitle">
              Review history
            </h2>
            {history.status === "ready" && (
              <span className="resumeHistoryCount">{history.items.length} saved</span>
            )}
          </div>
          {historyError && (
            <p className="dashError" role="alert">
              {historyError}
            </p>
          )}
          {history.status === "loading" ? (
            <div className="resumeHistoryLoading" aria-busy="true">
              <span className="resumeSkeleton resumeSkeleton--body" />
              <span className="resumeSkeleton resumeSkeleton--body" />
              <p className="srOnly" role="status">Loading your reports…</p>
            </div>
          ) : history.status === "error" ? (
            <div className="resumeHistoryEmpty">
              <p className="dashError" role="alert">
                {history.error}
              </p>
              <button type="button" className="dashBtn" onClick={loadHistory}>
                Try again
              </button>
            </div>
          ) : history.items.length === 0 ? (
            <div className="resumeHistoryEmpty">
              <span className="resumeHistoryEmptyIcon"><History size={19} aria-hidden="true" /></span>
              <div>
                <h3>No reviews yet</h3>
                <p>After your first review, revisit its strengths, gaps, and next steps anytime.</p>
              </div>
            </div>
          ) : (
            <ul className="resumeHistoryList">
              {history.items.map((item) => (
                <HistoryItem
                  key={item.id}
                  item={item}
                  open={openId === item.id}
                  onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                  onDelete={() => setConfirmDelete(item)}
                  deleting={deletingId === item.id}
                />
              ))}
            </ul>
          )}
        </section>
      </>
    );
  }

  return (
    <div className="homePage">
      <AppHeader />
      <main className="dashMain featureMain">
        <header className="resumePageIntro">
          <h1>Resume Analyzer</h1>
          <p>Upload your resume and receive an evidence-based review tailored to your selected career.</p>
        </header>
        {content}
      </main>

      <Dialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete this review?"
        actions={
          <>
            <button type="button" className="dashBtn" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button type="button" className="dashBtn dashBtn--primary" onClick={removeConfirmed}>
              Delete
            </button>
          </>
        }
      >
        <p>
          The {confirmDelete?.career} review from {formatDate(confirmDelete?.createdAt)} will be removed from
          your account. This can&apos;t be undone.
        </p>
      </Dialog>
    </div>
  );
}
