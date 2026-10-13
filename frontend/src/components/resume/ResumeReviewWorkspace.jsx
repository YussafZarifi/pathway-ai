import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, FileText, Lightbulb, Lock, Sparkles } from "lucide-react";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

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
  project_purpose: ["Problem", "The project description does not make the user or problem clear.", "A clear purpose helps a reviewer understand the value quickly."],
  project_stack: ["Missing technologies", "The implementation stack is only partially named.", "Specific frameworks and technologies make the work easier to assess."],
  project_apis: ["Missing framework detail", "The project does not show enough of its application or integration layer.", "Framework and API detail signals implementation depth."],
  project_testing: ["Missing testing", "No testing approach is visible in this project review.", "Testing evidence increases confidence in production readiness."],
  project_deployment: ["Missing deployment", "A deployment target or delivery path is not evidenced.", "Deployment context turns a project into a more credible shipped result."],
  project_impact: ["Missing impact metric", "The project does not include a measurable outcome.", "A metric gives the reviewer a concrete sense of scale or improvement."],
  experience_actions: ["Use stronger action verbs", "The bullet does not lead with a specific ownership-oriented action.", "Sharper verbs make contribution and scope immediately legible."],
  experience_relevance: ["Make relevance explicit", "The connection to the target role is not clear from the cited line.", "Role-specific language improves both ATS matching and human review."],
  experience_results: ["Missing measurable achievement", "The bullet does not show a result, scale, or outcome.", "Results distinguish activity from impact."],
  experience_ownership: ["Clarify ownership", "The work described does not show what you personally owned.", "Ownership helps reviewers separate contribution from team context."],
};

function findingDetails(item) {
  const missing = item.missingChecks || [];
  const [label, problem, why] = CHECK_LABELS[missing[0]] || ["Add grounded detail", "This finding needs more specific evidence.", "Specific evidence makes the claim easier to verify."];
  return { problem: label, why, impact: missing.length ? `Addressing this may also improve ${missing.length} related review signal${missing.length === 1 ? "" : "s"}.` : "A clearer, measurable line will be easier to scan and verify." , missing: problem };
}

function reviewCandidates(analysis) {
  const items = [];
  const work = [...(analysis.projectReviews || []), ...(analysis.experienceReviews || [])];
  work.forEach((item, index) => {
    const details = findingDetails(item);
    if (item.bulletRewrite?.before) {
      items.push({
        id: `rewrite-${index}`,
        title: `Strengthen ${item.title}`,
        description: item.summary || "Make this line more specific and outcome-led.",
        problem: details.missing,
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
        problem: details.missing,
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
      problem: "Priority improvement",
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

function PdfPage({ page, highlights, selectedId, accepted, acceptedEdits, onSelect }) {
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
      const viewport = page.getViewport({ scale: 1.35 });
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
      if (!cancelled) setRendered({ canvas, width: viewport.width, height: viewport.height, textItems });
    }
    render().catch(() => { if (!cancelled) setRendered(null); });
    return () => { cancelled = true; task?.cancel(); };
  }, [page, pdfjs]);

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

function PdfDocument({ file, highlights, selectedId, accepted, acceptedEdits, onSelect }) {
  const [pages, setPages] = useState([]);
  const [error, setError] = useState("");
  const [pdfjs, setPdfjs] = useState(null);
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
      if (!cancelled) setPages(next);
    }).catch(() => { if (!cancelled) setError("This PDF could not be rendered in the review workspace."); });
    return () => { cancelled = true; loading?.destroy(); };
  }, [file, pdfjs]);
  useEffect(() => {
    if (!selectedId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector(`[data-highlight-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId, pages]);
  if (error) return <p className="resumePdfError" role="alert">{error}</p>;
  return <div className="resumePdfDocument" data-page-count={pages.length}>{pages.map((page) => <PdfPage key={page.pageNumber} page={page} highlights={highlights.filter((item) => !item.page || item.page === page.pageNumber)} selectedId={selectedId} accepted={accepted} acceptedEdits={acceptedEdits} onSelect={onSelect} />)}</div>;
}

export default function ResumeReviewWorkspace({ analysis, file }) {
  const [selectedId, setSelectedId] = useState(null);
  const [accepted, setAccepted] = useState(() => new Set());
  const [acceptedEdits, setAcceptedEdits] = useState(() => new Map());
  const [skipped, setSkipped] = useState(() => new Set());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const report = analysis.scoreReport || {};
  const highlights = useMemo(() => reviewCandidates(analysis), [analysis]);
  const visibleHighlights = highlights.filter((item) => !skipped.has(item.id));
  const selected = visibleHighlights.find((item) => item.id === selectedId) || visibleHighlights[0] || null;
  const overallScore = Number(report.display_overall ?? report.overall ?? 0);
  const atsScore = Number(report.ats?.display_score ?? report.ats?.score ?? report.categories?.find((item) => item.id === "ats")?.score ?? 0);
  const confidence = report.confidence || {};
  const selectedIdForEffect = selected?.id;
  const selectedSuggestedText = selected ? acceptedEdits.get(selected.id) || selected.after || "" : "";

  useEffect(() => {
    setDraft(selectedSuggestedText);
    setEditing(false);
  }, [selectedIdForEffect, selectedSuggestedText]);

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
      <div className="resumeReviewSummary">
        <div><span className="resumeReviewKicker"><Sparkles size={14} aria-hidden="true" /> Resume coach</span><h3>Edit what matters</h3><p>Work through grounded feedback line by line. Your original PDF stays unchanged.</p></div>
        <div className="resumeScoreCluster">
          <div className="resumeAtsScore"><span>Overall score</span><strong>{overallScore}<small>/100</small></strong><em>{confidence.level ? `${String(confidence.level).replaceAll("_", " ")} confidence` : "Evidence-based review"}</em></div>
          <div className="resumeAtsMini"><span>ATS fit</span><strong>{atsScore}/100</strong></div>
        </div>
      </div>
      <div className="resumeReviewGrid">
        <div className="resumeDocumentPane">
          <div className="resumePaneHead"><span><FileText size={16} aria-hidden="true" /> {file?.name || "Resume preview"}</span><small><Lock size={13} aria-hidden="true" /> Local preview</small></div>
          {file ? <PdfDocument file={file} highlights={visibleHighlights} selectedId={selected?.id} accepted={accepted} acceptedEdits={acceptedEdits} onSelect={setSelectedId} /> : <div className="resumeDocumentEmpty"><FileText size={28} /><p>Upload this PDF again to reopen the document view.</p><small>Saved reports remain available below.</small></div>}
        </div>
        <aside className="resumeSuggestionPane" aria-label="Resume suggestions">
          <div className="resumePaneHead"><span><Lightbulb size={16} aria-hidden="true" /> Line feedback</span><small>{visibleHighlights.length} open</small></div>
          {selected ? <>
            <div className="resumeSuggestionTitle"><span className={`resumeSuggestionBadge ${selected.kind === "suggestion" ? "is-warning" : ""}`}>{selected.kind === "suggestion" ? "Improve" : "Review"}</span><h4>{selected.title}</h4><p>{selected.description}</p></div>
            <dl className="resumeFindingDetails"><div><dt>Problem</dt><dd>{selected.problem}</dd></div><div><dt>Why it matters</dt><dd>{selected.why}</dd></div><div><dt>Expected impact</dt><dd>{selected.impact}</dd></div></dl>
            {selected.before && <div className="resumeSuggestionDiff"><span>Current text</span><blockquote>{selected.before}</blockquote>{selected.after && <><span>Suggested rewrite</span>{editing ? <textarea className="resumeEditField" value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Edit suggested rewrite" /> : <blockquote className="is-after">{acceptedEdits.get(selected.id) || selected.after}</blockquote>}</>}</div>}
            {selected.after ? <div className="resumeSuggestionActions">
              {editing ? <button type="button" className="resumeAcceptButton" onClick={() => acceptSelected(draft)} disabled={!draft.trim()}><Check size={15} /> Save edit</button> : <button type="button" className="resumeAcceptButton" onClick={() => acceptSelected()} disabled={accepted.has(selected.id)}>{accepted.has(selected.id) ? <><Check size={15} /> Accepted</> : <>Accept suggestion <ChevronRight size={15} /></>}</button>}
              {!editing && <button type="button" className="resumeSecondaryButton" onClick={() => setEditing(true)}><FileText size={15} /> Edit</button>}
              <button type="button" className="resumeSkipButton" onClick={skipSelected}>Skip</button>
            </div> : <button type="button" className="resumeSkipButton resumeSkipButton--full" onClick={skipSelected}>Mark as reviewed</button>}
          </> : <div className="resumeSuggestionEmpty"><Check size={22} /><p>All feedback is reviewed.</p><small>Your resume is ready for another pass.</small></div>}
        </aside>
      </div>
    </section>
  );
}
