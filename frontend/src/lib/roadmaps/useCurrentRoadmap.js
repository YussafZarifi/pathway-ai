import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../authContext";
import { repositoryFor } from "./index";

function initialState(repo, authLoading, fallbackState) {
  // Local storage is synchronous: render the roadmap on the first frame,
  // exactly as before Milestone 2. Other repositories start loading.
  if (!authLoading && repo.loadSync) {
    return { status: "ready", record: repo.loadSync(fallbackState), error: null };
  }
  return { status: "loading", record: null, error: null };
}

/**
 * The visitor's current roadmap and the actions on it, whichever repository
 * holds it (lib/roadmaps/index.js).
 *
 * @param {{ fallbackState?: object }} options router state with a roadmap
 *   that couldn't be saved locally (ADR-013)
 * @returns {{ mode, status: "loading"|"ready"|"error", record, error,
 *   reload, setStepDone, setStepNote, regenerate, setRecord }}
 */
export function useCurrentRoadmap({ fallbackState } = {}) {
  const { loading: authLoading, session } = useAuth();
  const repo = repositoryFor(session);

  const [state, setState] = useState(() => initialState(repo, authLoading, fallbackState));
  const [reloadKey, setReloadKey] = useState(0);
  const fallbackRef = useRef(fallbackState);

  useEffect(() => {
    if (authLoading) return undefined;
    let active = true;
    repo.load(fallbackRef.current).then(
      (record) => {
        if (active) setState({ status: "ready", record, error: null });
      },
      (error) => {
        if (active) setState({ status: "error", record: null, error });
      }
    );
    return () => {
      active = false;
    };
  }, [repo, authLoading, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const setRecord = useCallback((record) => {
    setState({ status: "ready", record, error: null });
  }, []);

  /** Optimistic: the step flips at once; on failure it flips back and rethrows. */
  const setStepDone = useCallback(
    async (index, done) => {
      const before = state.record;
      if (!before) return;
      const optimistic = {
        ...before,
        statuses: before.statuses.map((s) =>
          s.index === index ? { ...s, done, completedAt: done ? Date.now() : null } : s
        ),
      };
      setState((prev) => ({ ...prev, record: optimistic }));
      try {
        const next = await repo.setStepDone(before, index, done);
        setState((prev) => ({ ...prev, record: next }));
      } catch (error) {
        setState((prev) => ({ ...prev, record: before }));
        throw error;
      }
    },
    [repo, state.record]
  );

  /** Save a step's note and target date; the record updates when saved. */
  const setStepNote = useCallback(
    async (index, value) => {
      if (!state.record) return;
      const next = await repo.setStepNote(state.record, index, value);
      setState((prev) => ({ ...prev, record: next }));
    },
    [repo, state.record]
  );

  const regenerate = useCallback(async () => {
    if (!state.record) return null;
    const next = await repo.regenerate(state.record);
    setState({ status: "ready", record: next, error: null });
    return next;
  }, [repo, state.record]);

  return {
    mode: repo.mode,
    status: state.status,
    record: state.record,
    error: state.error,
    reload,
    setStepDone,
    setStepNote,
    regenerate,
    setRecord,
  };
}
