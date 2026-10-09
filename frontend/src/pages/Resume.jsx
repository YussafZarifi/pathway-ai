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
import FeatureHeading from "../components/FeatureHeading";
import AnalysisView from "../components/resume/AnalysisView";
import { errorMessage } from "../lib/api";
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
    <aside className="dashCard resumePrivacy" aria-labelledby="resumePrivacyTitle">
      <div className="resumePrivacyHeader">
        <span className="resumePrivacyIcon"><ShieldCheck size={17} aria-hidden="true" /></span>
        <div>
          <p className="featureEyebrow">PRIVATE BY DESIGN</p>
          <h2 id="resumePrivacyTitle">Your file stays yours</h2>
        </div>
      </div>
      <ul className="resumePrivacyList">
        <li><Shield size={15} aria-hidden="true" /><span>Your PDF is sent to Google Gemini once for this review.</span></li>
        <li><Lock size={15} aria-hidden="true" /><span>PathwayAI never stores the file, its text or its name.</span></li>
        <li><BadgeCheck size={15} aria-hidden="true" /><span>Only the written review is saved. Delete it whenever you like.</span></li>
      </ul>
      <p className="resumeNoScore"><CircleHelp size={14} aria-hidden="true" /> No score—just practical feedback, grounded in your roadmap.</p>
    </aside>
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
          <p className="featureEyebrow">YOUR NEXT CAREER STEP</p>
          <h2>Build a stronger résumé</h2>
        </div>
        <span className="resumeUploadStep">01 <span>/ 02</span></span>
      </div>
      <p className="resumeTarget">
        Reviewed against your current roadmap: <strong>{career}</strong>
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
        <span className="resumeDropTitle">{file ? "PDF ready to review" : "Drop your résumé PDF here"}</span>
        <span className="resumeDropHint">or <span className="resumeBrowse">browse files</span></span>
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
          <span className="resumeSelectedCopy"><strong>PDF selected</strong><small>{formatSize(file.size)} · Private upload</small></span>
          {!analyzing && (
            <button type="button" className="resumeClearFile" onClick={() => { choose(null); if (inputRef.current) inputRef.current.value = ""; }}>
              Remove
            </button>
          )}
        </div>
      )}

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
        {analyzing ? "Creating your report…" : "Analyze résumé"}
        {!analyzing && <Sparkles size={16} aria-hidden="true" />}
      </button>

      <p id="resumeUploadMessage" className="dashError" role="alert">
        {message}
      </p>
      <p className="resumeUploadFootnote"><Lock size={13} aria-hidden="true" /> No résumé score. No file storage.</p>
    </form>
  );
}

function HistoryItem({ item, open, onToggle, onDelete, deleting, currentRoadmapId }) {
  const panelId = `resume-review-${item.id}`;
  return (
    <li className="dashCard resumeHistoryItem">
      <div className="resumeHistoryHead">
        <button
          type="button"
          className="resumeHistoryToggle"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={onToggle}
        >
          <span className="resumeHistoryIcon"><FileText size={17} aria-hidden="true" /></span>
          <span className="resumeHistoryMeta">
            <span className="resumeHistoryTopline"><span className="resumeHistoryCareer">{item.career}</span><span className="resumeHistoryDate">{formatDate(item.createdAt)}</span></span>
            {!open && <span className="resumeHistorySummary">{item.summary}</span>}
            <span className="resumeHistoryView">{open ? "Close report" : "Open report"}</span>
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
      {open && (
        <div id={panelId}>
          <AnalysisView analysis={item} currentRoadmapId={currentRoadmapId} />
        </div>
      )}
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

  const refreshAvailability = useCallback(async (signal) => {
    setAvailability((prev) => ({ ...prev, status: prev.data ? "ready" : "loading" }));
    try {
      const data = await checkAvailability({ signal });
      setAvailability({ status: "ready", data });
    } catch (e) {
      if (signal?.aborted) return;
      setAvailability({ status: "error", data: null, error: errorMessage(e, AVAILABILITY_FAILED) });
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistory((prev) => ({ ...prev, status: "loading", error: "" }));
    try {
      const items = await listAnalyses();
      setHistory({ status: "ready", items, error: "" });
    } catch (e) {
      setHistory({ status: "error", items: [], error: errorMessage(e, "We couldn't load your previous reviews.") });
    }
  }, []);

  useEffect(() => {
    if (!userId) return undefined;
    const controller = new AbortController();
    refreshAvailability(controller.signal);
    loadHistory();
    return () => controller.abort();
  }, [userId, refreshAvailability, loadHistory]);

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
    if (availability.status === "error") {
      return (
        <StateCard
          icon={<FileText size={26} />}
          title="Couldn't check résumé analysis"
          action={
            <button type="button" className="homePrimaryBtn" onClick={() => refreshAvailability()}>
              Try again
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
  } else if (authLoading) {
    content = (
      <section className="dashCard resumeUpload" aria-busy="true">
        <p className="dashMuted" role="status">
          Loading…
        </p>
      </section>
    );
  } else if (!user) {
    content = (
      <StateCard
        icon={<UserRound size={26} />}
        title="Sign in to review your résumé"
        action={
          <button
            type="button"
            className="homePrimaryBtn"
            onClick={() => navigate("/login", { state: { from: "/resume" } })}
          >
            Sign in
          </button>
        }
      >
        <p>Résumé reviews are saved to your account so you can come back to them, and delete them, on any device.</p>
      </StateCard>
    );
  } else {
    content = (
      <>
        <div className="resumeTop">
          {renderStatus()}
          <PrivacyCard />
        </div>

        <section className="resumeHistory" aria-labelledby="resumeHistoryTitle">
          <div className="dashSectionHead">
            <h2 id="resumeHistoryTitle" className="dashSectionTitle">
              Your reviews
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
                  currentRoadmapId={availability.data?.roadmap_id || null}
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
        <FeatureHeading
          icon={<FileText size={22} />}
          eyebrow="CAREER TOOLKIT · 01"
          title="Resume Analyzer"
          description="Turn your roadmap into a focused résumé review—with strengths to lead with, gaps to close, and edits you can use."
          context="Grounded in your roadmap"
        />
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
