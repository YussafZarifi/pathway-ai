import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ChevronRight, FileText, Lightbulb, LoaderCircle, Lock, Minus, Plus, Sparkles, UploadCloud } from "lucide-react";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { fileProblem } from "../../lib/resume";

let pdfjsPromise;
function loadPdfJs() {
  pdfjsPromise ||= import("pdfjs-dist").then((module) => {
    module.GlobalWorkerOptions.workerSrc = workerSrc;
    return module;
  });
  return pdfjsPromise;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

const CHECK_LABELS = {
  project_purpose: ["Project purpose is unclear.", "Reviewers need to understand the user problem before they can assess the solution.", "Name the user, problem, and outcome the project addresses."],
  project_stack: ["Key project technologies are missing.", "Specific tools make the depth of your implementation easier to assess.", "Add the frameworks, services, or languages you used in the project."],
  project_apis: ["Application or integration detail is missing.", "Framework and API detail helps reviewers see implementation depth.", "Name the application layer, integrations, or APIs you built."],
  project_testing: ["Testing evidence is missing.", "Testing shows that the project was validated, not only built.", "Add the test approach, tools, or checks you used."],
  project_deployment: ["Deployment context is missing.", "Reviewers want to see where the project was used or shipped.", "Add the deployment target, delivery path, or live environment."],
  project_impact: ["A measurable project outcome is missing.", "A concrete result gives reviewers a sense of scale and value.", "Add a verified metric, result, or observed improvement."],
  experience_actions: ["Your action is not specific enough.", "Sharper action language makes your contribution and scope easier to understand.", "Start the bullet with the specific action you owned."],
  experience_relevance: ["The role relevance is not explicit.", "Role-specific language improves both ATS matching and human review.", "Connect the work directly to the target role or skill."],
  experience_results: ["A measurable achievement is missing.", "Results distinguish activity from impact.", "Add a verified result, scale, or outcome from the work."],
  experience_ownership: ["Your ownership is unclear.", "Reviewers need to know what you personally led or delivered.", "State the part of the work you owned or delivered."],
};

function findingDetails(item) {
  const missing = item.missingChecks || [];
  const [problem, why, improveBy] = CHECK_LABELS[missing[0]] || ["This finding needs more specific evidence.", "Specific evidence makes the claim easier to verify.", "Add one concrete detail that the résumé can support."];
  return { problem, why, improveBy, impact: missing.length ? `Addressing this may also improve ${missing.length} related review signal${missing.length === 1 ? "" : "s"}.` : "A clearer, measurable line will be easier to scan and verify." };
}

function reviewCandidates(analysis) {
  const coaching = analysis.aiCoaching?.items || [];
  if (coaching.length) {
    return coaching.map((item, index) => ({
      id: `coaching-${item.criterionId}-${index}`,
      title: item.title,
      description: item.problem,
      improveBy: item.improveBy,
      problem: item.problem,
      why: item.why,
      impact: item.expectedImpact,
      before: item.evidence?.quote || null,
      after: item.suggestedRewrite,
      page: item.evidence?.page || null,
      guidanceTitles: item.guidanceTitles,
      kind: "suggestion",
    }));
  }
  const items = [];
  const work = [...(analysis.projectReviews || []), ...(analysis.experienceReviews || [])];
  work.forEach((item, index) => {
    const details = findingDetails(item);
    if (item.bulletRewrite?.before) {
      items.push({
        id: `rewrite-${index}`,
        title: `Strengthen ${item.title}`,
        description: item.summary || "Make this line more specific and outcome-led.",
        improveBy: details.improveBy,
        problem: details.problem,
        why: details.why,
        impact: details.impact,
        before: item.bulletRewrite.before,
        after: item.bulletRewrite.after,
        page: item.bulletRewrite.page,
        kind: "suggestion",
      });
    } else if (item.evidence?.quote) {
      items.push({
        id: `evidence-${index}`,
        title: `Review ${item.title}`,
        description: item.summary || "This evidence is relevant, but could communicate more technical depth.",
        improveBy: details.improveBy,
        problem: details.problem,
        why: details.why,
        impact: details.impact,
        before: item.evidence.quote,
        after: null,
        page: item.evidence.page,
        kind: "review",
      });
    }
  });

  const recommendations = analysis.scoreReport?.recommendations || [];
  recommendations.slice(0, Math.max(0, 4 - items.length)).forEach((item, index) => {
    items.push({
      id: `recommendation-${index}`,
      title: item.title || "Resume improvement",
      description: item.action || "Add clearer evidence to this section.",
      improveBy: item.action || "Add clearer evidence to this section.",
      problem: "A priority improvement is needed.",
      why: "This is a measurable gap in the role rubric.",
      impact: "Closing it can improve the role-fit signal.",
      before: null,
      after: null,
      page: null,
      kind: "recommendation",
    });
  });
  return items;
}

function PdfPage({ page, scale, highlights, selectedId, accepted, acceptedEdits, onSelect, onRendered, onError }) {
  const [rendered, setRendered] = useState(null);
  const [pdfjs, setPdfjs] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    loadPdfJs().then(setPdfjs).catch(() => {});
    return undefined;
  }, []);

  useEffect(() => {
    if (!pdfjs) return undefined;
    let cancelled = false;
    let task;
    async function render() {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      task = page.render({ canvasContext: canvas.getContext("2d"), viewport });
      await task.promise;
      const content = await page.getTextContent();
      const textItems = content.items.map((item) => {
        const transform = pdfjs.Util.transform(viewport.transform, item.transform);
        const height = Math.max(8, Math.sqrt(transform[2] ** 2 + transform[3] ** 2));
        return {
          text: item.str,
          normalized: clean(item.str),
          left: transform[4],
          top: transform[5] - height,
          width: Math.max(2, item.width * viewport.scale),
          height,
        };
      });
      if (!cancelled) {
        setRendered({ canvas, width: viewport.width, height: viewport.height, textItems });
        onRendered?.(page.pageNumber);
      }
    }
    render().catch(() => { if (!cancelled) { setRendered(null); onError?.(); } });
    return () => { cancelled = true; task?.cancel?.(); };
  }, [page, pdfjs, scale, onRendered, onError]);

  const placed = useMemo(() => {
    if (!rendered) return [];
    return highlights.map((highlight) => {
      const token = clean(highlight.before).split(" ").filter((word) => word.length > 3)[0];
      const item = rendered.textItems.find((candidate) => candidate.normalized.includes(token || "__never__"));
      if (!item) return null;
      return { ...highlight, item };
    }).filter(Boolean);
  }, [highlights, rendered]);

  if (!rendered) return <div className="resumePdfPage resumePdfPage--loading" aria-label={`Loading page ${page.pageNumber}`} />;
  return (
    <div className="resumePdfPage" style={{ aspectRatio: `${rendered.width} / ${rendered.height}` }}>
      <img className="resumePdfCanvas" src={rendered.canvas.toDataURL()} alt={`Resume page ${page.pageNumber}`} />
      {placed.map((highlight) => {
        const { item } = highlight;
        const isAccepted = accepted.has(highlight.id);
        const acceptedText = acceptedEdits.get(highlight.id) || highlight.after;
        return (
          <button
            type="button"
            className={`resumePdfHighlight ${highlight.kind === "suggestion" ? "is-problem" : "is-review"} ${selectedId === highlight.id ? "is-selected" : ""} ${isAccepted ? "is-accepted" : ""}`}
            key={highlight.id}
            data-highlight-id={highlight.id}
            style={{ left: `${(item.left / rendered.width) * 100}%`, top: `${(item.top / rendered.height) * 100}%`, width: `${(item.width / rendered.width) * 100}%`, height: `${Math.max(item.height, 18) / rendered.height * 100}%` }}
            onClick={() => onSelect(highlight.id)}
            aria-label={`${highlight.title}. ${isAccepted ? "Accepted" : "Open suggestion"}`}
          >
            {isAccepted && <span className="resumeAcceptedPatch">{acceptedText}</span>}
          </button>
        );
      })}
    </div>
  );
}

function PdfDocument({ file, highlights, selectedId, accepted, acceptedEdits, initialPage, initialScrollTop, onSelect, onReady, onError, onPageChange, onScrollChange }) {
  const [pages, setPages] = useState([]);
  const [error, setError] = useState("");
  const [pdfjs, setPdfjs] = useState(null);
  const [pageNumber, setPageNumber] = useState(initialPage || 1);
  const [zoom, setZoom] = useState(1.35);
  const [direction, setDirection] = useState("next");
  const [renderedPageNumber, setRenderedPageNumber] = useState(0);
  const lastSelectedId = useRef(selectedId);
  const viewportRef = useRef(null);
  const restoredScroll = useRef(false);
  const markRendered = useCallback((number) => {
    setRenderedPageNumber(number);
    onReady?.(true);
  }, [onReady]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    loadPdfJs().then(setPdfjs).catch(() => {});
    return undefined;
  }, []);
  useEffect(() => {
    if (!pdfjs) return undefined;
    let cancelled = false;
    let loading;
    file.arrayBuffer().then((data) => {
      if (cancelled) return null;
      loading = pdfjs.getDocument({ data });
      return loading.promise;
    }).then(async (pdf) => {
      if (!pdf) return;
      const next = [];
      for (let number = 1; number <= pdf.numPages; number += 1) next.push(await pdf.getPage(number));
      if (!cancelled) {
        setPages(next);
        setPageNumber(Math.min(Math.max(initialPage || 1, 1), next.length));
        onReady?.(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setError("This PDF could not be rendered. Choose another PDF to continue.");
        onReady?.(false);
        onError?.();
      }
    });
    return () => { cancelled = true; loading?.destroy?.(); };
  }, [file, pdfjs, initialPage, onReady, onError]);
  useEffect(() => { onPageChange?.(pageNumber); }, [pageNumber, onPageChange]);
  useLayoutEffect(() => {
    if (!restoredScroll.current && renderedPageNumber === pageNumber && viewportRef.current) {
      viewportRef.current.scrollTop = initialScrollTop || 0;
      restoredScroll.current = true;
    }
  }, [initialScrollTop, pageNumber, renderedPageNumber]);
  useEffect(() => {
    const page = highlights.find((item) => item.id === selectedId)?.page;
    if (!pages.length || selectedId === lastSelectedId.current) return;
    lastSelectedId.current = selectedId;
    if (!page || page === pageNumber || page > pages.length) return;
    // Coach selection is an external prop; move the compact document view to its cited page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDirection(page > pageNumber ? "next" : "previous");
    setPageNumber(page);
  }, [highlights, selectedId, pages.length, pageNumber]);
  useEffect(() => {
    if (!selectedId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector(`[data-highlight-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId, pages]);
  if (error) return <p className="resumePdfError" role="alert">{error}</p>;
  const currentPage = pages[pageNumber - 1];
  const setPage = (nextPage) => {
    if (nextPage < 1 || nextPage > pages.length || nextPage === pageNumber) return;
    setDirection(nextPage > pageNumber ? "next" : "previous");
    setPageNumber(nextPage);
  };
  return <div className="resumePdfDocument" data-page-count={pages.length}>
    <div className="resumePdfToolbar" aria-label="PDF page controls">
      <div className="resumePdfPageControls">
        <button type="button" className="resumePdfNavButton" onClick={() => setPage(pageNumber - 1)} disabled={pageNumber <= 1} aria-label="Previous page"><ArrowLeft size={15} aria-hidden="true" /></button>
        <span aria-live="polite">Page {pages.length ? pageNumber : 1} of {pages.length || "…"}</span>
        <button type="button" className="resumePdfNavButton" onClick={() => setPage(pageNumber + 1)} disabled={pageNumber >= pages.length} aria-label="Next page"><ArrowRight size={15} aria-hidden="true" /></button>
      </div>
      <div className="resumePdfZoomControls" aria-label="PDF zoom controls">
        <button type="button" className="resumePdfNavButton" onClick={() => setZoom((value) => Math.max(0.9, value - 0.1))} disabled={zoom <= 0.9} aria-label="Zoom out"><Minus size={14} aria-hidden="true" /></button>
        <span>{Math.round((zoom / 1.35) * 100)}%</span>
        <button type="button" className="resumePdfNavButton" onClick={() => setZoom((value) => Math.min(2, value + 0.1))} disabled={zoom >= 2} aria-label="Zoom in"><Plus size={14} aria-hidden="true" /></button>
      </div>
    </div>
    <div ref={viewportRef} className={`resumePdfPageViewport is-${direction}`} onScroll={(event) => onScrollChange?.(event.currentTarget.scrollTop)}>
      {currentPage && <PdfPage key={`${currentPage.pageNumber}-${zoom}`} page={currentPage} scale={zoom} highlights={highlights.filter((item) => !item.page || item.page === currentPage.pageNumber)} selectedId={selectedId} accepted={accepted} acceptedEdits={acceptedEdits} onSelect={onSelect} onRendered={markRendered} onError={onError} />}
    </div>
  </div>;
}

const ANALYSIS_STAGES = [
  "Analyzing experience",
  "Checking ATS compatibility",
  "Evaluating projects",
  "Reviewing technical skills",
  "Generating recruiter feedback",
  "Finding measurable impact",
  "Building recommendations",
];

function AnalysisProgress({ progress }) {
  const current = progress?.phase === "reviewing" ? Math.min(ANALYSIS_STAGES.length - 1, Math.floor((progress.percent || 0) / 16)) : 0;
  return <div className="resumeAnalysisProgress" role="status" aria-live="polite">
    <div className="resumeAnalysisProgressHead"><span><LoaderCircle size={15} className="resumeSpin" aria-hidden="true" /> AI coach is reviewing</span><strong>{progress?.phase === "reviewing" ? "Working" : `${progress?.percent || 0}%`}</strong></div>
    <div className="resumeAnalysisSkeleton" aria-hidden="true"><span /><span /><span /></div>
    <ol>{ANALYSIS_STAGES.map((stage, index) => <li className={index === current ? "is-active" : index < current ? "is-done" : ""} key={stage}><span aria-hidden="true" />{stage}</li>)}</ol>
  </div>;
}

function AnimatedMetric({ value, label, suffix = "/100", delay = 0 }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const displayedValue = useRef(0);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const controls = animate(displayedValue.current, value, {
      duration: 0.55,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (next) => {
        const rounded = Math.round(next);
        displayedValue.current = rounded;
        setDisplay(rounded);
      },
    });
    return () => controls.stop();
  }, [delay, reduceMotion, value]);

  return <strong aria-label={`${label} ${value}${suffix ? " out of 100" : ""}`}><span aria-hidden="true">{reduceMotion ? value : display}</span>{suffix && <small aria-hidden="true">{suffix}</small>}</strong>;
}

function scoreStrength(value) {
  if (value >= 85) return "Excellent resume";
  if (value >= 70) return "Strong resume";
  if (value >= 55) return "Building momentum";
  return "Needs attention";
}

export default function ResumeReviewWorkspace({ analysis, file, analyzing, progress, error, autoAnalyze = false, initialPage = 1, initialScrollTop = 0, initialSelectedId = null, targetLevel = "entry_level", onAnalyze, onFileChange, onPageChange, onScrollChange, onSelectedChange, onTargetLevelChange }) {
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [accepted, setAccepted] = useState(() => new Set());
  const [acceptedEdits, setAcceptedEdits] = useState(() => new Map());
  const [skipped, setSkipped] = useState(() => new Set());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const report = analysis?.scoreReport || {};
  const highlights = useMemo(() => analysis ? reviewCandidates(analysis) : [], [analysis]);
  const visibleHighlights = highlights.filter((item) => !skipped.has(item.id));
  const selected = visibleHighlights.find((item) => item.id === selectedId) || visibleHighlights[0] || null;
  const priorities = visibleHighlights.slice(0, 3);
  const coachPriorities = selected && !priorities.some((item) => item.id === selected.id)
    ? [selected, ...priorities.slice(0, 2)]
    : priorities;
  const overallScore = Number(report.display_overall ?? report.overall ?? 0);
  const atsScore = Number(report.ats?.display_score ?? report.ats?.score ?? report.categories?.find((item) => item.id === "ats")?.score ?? 0);
  const confidence = report.confidence || {};
  const confidenceScore = Number(confidence.score ?? 0);
  const confidenceLabel = confidence.level ? `${String(confidence.level).replaceAll("_", " ")} confidence` : "Evidence-based confidence";
  const strength = scoreStrength(overallScore);
  const selectedIdForEffect = selected?.id;
  const selectedSuggestedText = selected ? acceptedEdits.get(selected.id) || selected.after || "" : "";
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [coachOpen, setCoachOpen] = useState(false);
  const inputRef = useRef(null);
  const autoAnalyzeStarted = useRef(false);
  const handlePreviewError = useCallback(() => setPreviewError("This PDF could not be rendered. Choose another PDF to continue."), []);

  useEffect(() => {
    setDraft(selectedSuggestedText);
    setEditing(false);
  }, [selectedIdForEffect, selectedSuggestedText]);

  useEffect(() => { onSelectedChange?.(selectedId); }, [selectedId, onSelectedChange]);

  useEffect(() => {
    if (!autoAnalyze || !previewReady || !file || analysis || analyzing || previewError || autoAnalyzeStarted.current) return;
    autoAnalyzeStarted.current = true;
    onAnalyze?.(file);
  }, [analysis, analyzing, autoAnalyze, file, onAnalyze, previewError, previewReady]);

  useEffect(() => {
    setPreviewReady(false);
    setPreviewError("");
  }, [file]);

  function chooseFile(next) {
    const problem = fileProblem(next);
    if (problem) {
      setPreviewError(problem);
      return;
    }
    setPreviewError("");
    onFileChange?.(next);
  }

  function acceptSelected(text = selected?.after) {
    if (!selected || !text?.trim()) return;
    setAcceptedEdits((current) => new Map(current).set(selected.id, text.trim()));
    setAccepted((current) => new Set([...current, selected.id]));
    setEditing(false);
  }

  function skipSelected() {
    if (!selected) return;
    setSkipped((current) => new Set([...current, selected.id]));
    setSelectedId(null);
  }

  return (
    <section className="resumeReviewWorkspace" aria-label="Resume review workspace">
      <div className="resumeReviewGrid">
        <aside className={`resumeSuggestionPane ${analysis ? "has-analysis" : ""} ${coachOpen ? "is-mobile-open" : ""}`} aria-label="Resume coach">
          <div className="resumeCoachHeader"><span className="resumeReviewKicker"><Sparkles size={14} aria-hidden="true" /> AI Resume Coach</span><h2>{analysis ? "Edit what matters" : "Start with a clear view"}</h2><p>{analysis ? "Short, grounded suggestions tied to the lines in your document." : "Your résumé stays visible while the coach prepares a focused review."}</p></div>
          {!analysis && <div className="resumePreviewGate">
            <div className="resumePreviewGateIcon"><FileText size={20} aria-hidden="true" /></div>
            <strong>{previewReady ? "Preview ready" : "Rendering preview"}</strong>
            <p>{previewReady ? "Take a look, then start your private review when you are ready." : "We need to render the PDF before analysis can begin."}</p>
            <label className="resumeTargetLevel" htmlFor="resumeTargetLevel">
              <span>Target level</span>
              <select id="resumeTargetLevel" value={targetLevel} onChange={(event) => onTargetLevelChange?.(event.target.value)} disabled={analyzing}>
                <option value="internship">Internship</option>
                <option value="entry_level">Entry-level</option>
              </select>
            </label>
            <button type="button" className="dashBtn resumeFileSwap" onClick={() => inputRef.current?.click()} disabled={analyzing}><UploadCloud size={15} aria-hidden="true" /> Choose another PDF</button>
            <input ref={inputRef} className="resumeWorkspaceFileInput" type="file" accept="application/pdf,.pdf" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
            {previewError && <p className="dashError" role="alert">{previewError}</p>}
            {error && <p className="dashError" role="alert">{error}</p>}
            {analyzing ? <AnalysisProgress progress={progress} /> : <button type="button" className="dashBtn dashBtn--primary resumeAnalyzeButton" disabled={!previewReady || Boolean(previewError) || !file} onClick={() => onAnalyze?.(file)}><Sparkles size={16} aria-hidden="true" /> Analyze résumé</button>}
          </div>}
          {analysis && <>
            {!file && <div className="resumeSavedNotice"><p>This saved review does not include the original PDF. Open the file again to reconnect feedback to the document.</p><button type="button" className="dashBtn resumeFileSwap" onClick={() => inputRef.current?.click()}><UploadCloud size={15} aria-hidden="true" /> Open original PDF</button><input ref={inputRef} className="resumeWorkspaceFileInput" type="file" accept="application/pdf,.pdf" onChange={(event) => chooseFile(event.target.files?.[0] || null)} /></div>}
            {file && <div className="resumeWorkspaceActions"><button type="button" className="dashBtn resumeFileSwap" onClick={() => inputRef.current?.click()}><UploadCloud size={15} aria-hidden="true" /> Upload New Resume</button><input ref={inputRef} className="resumeWorkspaceFileInput" type="file" accept="application/pdf,.pdf" onChange={(event) => { chooseFile(event.target.files?.[0] || null); event.target.value = ""; }} /></div>}
            <div className="resumeScoreCluster">
              <div className="resumeScoreHero"><AnimatedMetric value={overallScore} label="Resume score" suffix="" /><span>Resume score</span><div className="resumeScoreStrength" aria-label={`${strength}, score ${overallScore} out of 100`}><i aria-hidden="true"><b style={{ width: `${overallScore}%` }} /></i><strong>{strength}</strong></div></div>
              <div className="resumeAtsMini"><span>ATS score</span><AnimatedMetric value={atsScore} label="ATS score" suffix="" delay={0.12} /></div>
              <div className="resumeAtsMini resumeConfidenceMini"><span>Confidence</span><strong aria-label={`${confidenceLabel}${confidenceScore ? `, ${confidenceScore}%` : ""}`}>{confidenceScore > 0 ? `${confidenceScore}%` : "—"}</strong><small><i aria-hidden="true" />{confidenceLabel}</small></div>
            </div>
            <div className="resumePaneHead"><span><Lightbulb size={16} aria-hidden="true" /> Top improvements</span><small>{Math.min(visibleHighlights.length, 3)} priorities</small></div>
            {selected ? <>
              <div className="resumeTopIssueList" role="list">
                {coachPriorities.map((item, index) => {
                  const isSelected = selected.id === item.id;
                  const priority = ["High", "Medium", "Low"][index] || "Low";
                  const panelId = `resume-improvement-${item.id}`;
                  return <div role="listitem" className={`resumeTopIssueItem is-rank-${index + 1} ${isSelected ? "is-selected" : ""}`} key={item.id}>
                    <button type="button" className={`resumeTopIssue is-rank-${index + 1}`} onClick={() => setSelectedId(item.id)} aria-expanded={isSelected} aria-controls={panelId} aria-label={`Problem: ${item.problem}`}>
                      <span className="resumeTopIssueNumber">{index + 1}</span>
                      <span className="resumeTopIssueCopy"><small className="resumePriorityLabel">{priority} priority</small><strong>{item.title}</strong><span>{item.problem}</span></span>
                      <ChevronRight className="resumeTopIssueChevron" size={16} aria-hidden="true" />
                    </button>
                    <div id={panelId} className="resumeTopIssuePanel" aria-hidden={!isSelected}><div>
                      <dl className="resumeTopIssueDetails"><div><dt>Problem</dt><dd>{item.problem}</dd></div><div><dt>Why it matters</dt><dd>{item.why}</dd></div><div><dt>How to improve</dt><dd>{item.improveBy}</dd></div><div><dt>Expected impact</dt><dd>{item.impact}</dd></div>{item.after && <div className="resumeTopIssueRewrite"><dt>Suggested rewrite</dt><dd>{acceptedEdits.get(item.id) || item.after}</dd></div>}</dl>
                    </div></div>
                  </div>;
                })}
              </div>
              <details className="resumeCoachDetails">
                <summary>Supporting evidence and actions</summary>
                <div className="resumeCoachDetailsBody">
                  {selected.guidanceTitles?.length > 0 && <dl className="resumeFindingDetails"><div><dt>Curated guidance used</dt><dd>PathwayAI searched its resume-writing guidance: {selected.guidanceTitles.join(" · ")}</dd></div></dl>}
                  {selected.before && <div className="resumeSuggestionDiff"><span>Current text</span><blockquote>{selected.before}</blockquote>{editing && selected.after && <><span>Edit suggested rewrite</span><textarea className="resumeEditField" value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Edit suggested rewrite" /></>}</div>}
                  {selected.after ? <div className="resumeSuggestionActions">
                    {editing ? <button type="button" className="resumeAcceptButton" onClick={() => acceptSelected(draft)} disabled={!draft.trim()}><Check size={15} /> Save edit</button> : <button type="button" className="resumeAcceptButton" onClick={() => acceptSelected()} disabled={accepted.has(selected.id)}>{accepted.has(selected.id) ? <><Check size={15} /> Accepted</> : <>Accept suggestion <ChevronRight size={15} /></>}</button>}
                    {!editing && <button type="button" className="resumeSecondaryButton" onClick={() => setEditing(true)}><FileText size={15} /> Edit</button>}
                    <button type="button" className="resumeIgnoreButton" onClick={skipSelected}>Ignore</button>
                  </div> : <button type="button" className="resumeIgnoreButton resumeIgnoreButton--full" onClick={skipSelected}>Ignore</button>}
                </div>
              </details>
            </> : <div className="resumeSuggestionEmpty"><Check size={22} /><p>All feedback is reviewed.</p><small>Your resume is ready for another pass.</small></div>}
          </>}
        </aside>
        <div className="resumeDocumentPane">
          <div className="resumePaneHead"><span><FileText size={16} aria-hidden="true" /> {file?.name || "Resume preview"}</span><small><Lock size={13} aria-hidden="true" /> Private local preview</small><button type="button" className="resumeMobileCoachToggle" onClick={() => setCoachOpen((open) => !open)} aria-expanded={coachOpen}>{coachOpen ? "Close coach" : "Open AI coach"}</button></div>
          {file ? <PdfDocument key={`${file.name}-${file.size}-${file.lastModified}`} file={file} highlights={visibleHighlights} selectedId={selected?.id} accepted={accepted} acceptedEdits={acceptedEdits} initialPage={initialPage} initialScrollTop={initialScrollTop} onSelect={setSelectedId} onReady={setPreviewReady} onError={handlePreviewError} onPageChange={onPageChange} onScrollChange={onScrollChange} /> : <div className="resumeDocumentEmpty"><FileText size={28} /><p>Choose a PDF to open the editor.</p></div>}
        </div>
      </div>
    </section>
  );
}
