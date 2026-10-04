import { useCallback, useState } from "react";
import { importLocalRoadmap } from "../api";
import { getStepStatuses } from "../dashboardData";
import { clearCurrentRoadmap, loadCurrentRoadmap, stepProgressPrefix } from "../roadmapStore";
import { supabase } from "../supabase";
import { clearProgress, getAllProgress } from "../trackingEngine";

const DISMISS_KEY = "pathwayai_import_dismissed";

function dismissedId() {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/** The roadmap saved in this browser, with its progress, ready to import. */
function localCandidate() {
  const stored = loadCurrentRoadmap();
  if (!stored || dismissedId() === stored.id) return null;
  const statuses = getStepStatuses(stored.roadmap, getAllProgress(), stored.id);
  return {
    stored,
    done: statuses.filter((s) => s.done).length,
    total: statuses.length,
    completed: statuses
      .filter((s) => s.done)
      .map((s) => ({ position: s.index, completed_at: s.completedAt })),
  };
}

function payloadFor({ stored, completed }) {
  return {
    local_id: stored.id,
    career: stored.career,
    career_data: stored.careerData || null,
    answers: stored.answers || null,
    generated_at: stored.generatedAt || null,
    steps: stored.roadmap,
    completed,
  };
}

/**
 * Offer to save this browser's roadmap to the signed-in account, once
 * (ADR-019). Never automatic: on a shared computer the next person to sign
 * in shouldn't silently receive someone else's roadmap.
 *
 * - save(): imports it (the server is idempotent per local id), then clears
 *   the browser copy and its progress so it can't be imported again here.
 *   On failure the browser copy is kept and the error is shown.
 * - dismiss(): "Not now" — hidden for this browser session; the copy stays.
 *
 * @param {{ enabled: boolean, onImported?: () => void }} options
 */
export function useLocalImport({ enabled, onImported }) {
  const [candidate, setCandidate] = useState(localCandidate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = useCallback(async () => {
    if (!candidate) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Not signed in");
      await importLocalRoadmap(data.session.access_token, payloadFor(candidate));
      clearProgress(stepProgressPrefix(candidate.stored.id));
      clearCurrentRoadmap();
      setCandidate(null);
      onImported?.();
    } catch (e) {
      console.error("Error importing roadmap:", e);
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [candidate, onImported]);

  const dismiss = useCallback(() => {
    if (!candidate) return;
    try {
      sessionStorage.setItem(DISMISS_KEY, candidate.stored.id);
    } catch {
      // Storage blocked: hiding it for this page view is enough.
    }
    setCandidate(null);
  }, [candidate]);

  return {
    candidate: enabled ? candidate : null,
    busy,
    error,
    save,
    dismiss,
  };
}
