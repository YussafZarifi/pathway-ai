import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, MessageSquare, Plus, Send, ShieldCheck, Trash2, UserRound } from "lucide-react";
import AppHeader from "../components/AppHeader";
import Dialog from "../components/Dialog";
import CoachMessage from "../components/coach/CoachMessage";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { useCurrentRoadmap } from "../lib/roadmaps/useCurrentRoadmap";
import {
  MAX_MESSAGE,
  checkAvailability,
  deleteThread,
  listThreads,
  loadMessages,
  messageProblem,
  normalizeMessage,
  send,
} from "../lib/coach";

const SEND_FAILED = "The coach couldn't reply right now. Please try again.";
const STARTERS = [
  "What should I focus on this week?",
  "How can I turn my current step into a portfolio project?",
  "I'm stuck and losing motivation. Any advice?",
];

function StateCard({ icon, title, children, action }) {
  return (
    <section className="dashCard dashEmpty resumeState">
      <span className="dashEmptyIcon" aria-hidden="true">
        {icon}
      </span>
      <h2 className="dashEmptyTitle">{title}</h2>
      <div className="dashEmptyText">{children}</div>
      {action}
    </section>
  );
}

function formatDate(ms) {
  return ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
}

export default function Coach() {
  const navigate = useNavigate();
  const { enabled: accountsEnabled, loading: authLoading, user } = useAuth();
  const userId = user?.id || null;
  const { record, setStepDone } = useCurrentRoadmap();

  const [availability, setAvailability] = useState({ status: "loading", data: null });
  const [threads, setThreads] = useState({ status: "loading", items: [], error: "" });
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState({ status: "idle", items: [], error: "" });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [threadFull, setThreadFull] = useState(false);
  const [actionNote, setActionNote] = useState("");
  const [busyAction, setBusyAction] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const listEnd = useRef(null);
  const inputRef = useRef(null);
  const sendAbort = useRef(null);

  useEffect(() => {
    document.body.classList.add("theme-landing");
    return () => document.body.classList.remove("theme-landing");
  }, []);

  const refreshAvailability = useCallback(async (signal) => {
    try {
      const data = await checkAvailability({ signal });
      setAvailability({ status: "ready", data });
    } catch (e) {
      if (signal?.aborted) return;
      setAvailability({ status: "error", data: null, error: errorMessage(e, "We couldn't check whether the coach is available. Please try again.") });
    }
  }, []);

  const refreshThreads = useCallback(async () => {
    try {
      const items = await listThreads();
      setThreads({ status: "ready", items, error: "" });
    } catch (e) {
      setThreads({ status: "error", items: [], error: errorMessage(e, "We couldn't load your conversations.") });
    }
  }, []);

  useEffect(() => {
    if (!userId) return undefined;
    const controller = new AbortController();
    refreshAvailability(controller.signal);
    refreshThreads();
    return () => controller.abort();
  }, [userId, refreshAvailability, refreshThreads]);

  useEffect(() => () => sendAbort.current?.abort(), []);

  // Keep the newest message in view.
  useEffect(() => {
    listEnd.current?.scrollIntoView?.({ block: "end" });
  }, [messages.items.length]);

  async function openThread(id) {
    setActiveId(id);
    setSendError("");
    setThreadFull(false);
    setActionNote("");
    setMessages({ status: "loading", items: [], error: "" });
    try {
      const items = await loadMessages(id);
      setMessages({ status: "ready", items, error: "" });
    } catch (e) {
      setMessages({ status: "error", items: [], error: errorMessage(e, "We couldn't load this conversation.") });
    }
  }

  function newConversation() {
    setActiveId(null);
    setMessages({ status: "idle", items: [], error: "" });
    setSendError("");
    setThreadFull(false);
    setActionNote("");
    inputRef.current?.focus();
  }

  async function submit(text) {
    const problem = messageProblem(text);
    if (problem) {
      setSendError(problem);
      return;
    }
    const pending = { id: `pending-${Date.now()}`, role: "user", content: text.trim(), actions: [], pending: true };
    setMessages((prev) => ({ status: "ready", items: [...prev.items, pending], error: "" }));
    setDraft("");
    setSending(true);
    setSendError("");
    setActionNote("");
    const controller = new AbortController();
    sendAbort.current = controller;
    try {
      const saved = await send(activeId, text, { signal: controller.signal });
      setActiveId(saved.thread_id);
      // Show the conversation at the top of the list right away; the
      // refresh below brings the authoritative list.
      setThreads((prev) => ({
        ...prev,
        items: [
          { id: saved.thread_id, title: saved.title, updatedAt: Date.now() },
          ...prev.items.filter((t) => t.id !== saved.thread_id),
        ],
      }));
      setMessages((prev) => ({
        status: "ready",
        items: [...prev.items.filter((m) => m.id !== pending.id), ...saved.messages.map(normalizeMessage)],
        error: "",
      }));
      refreshThreads();
    } catch (e) {
      if (controller.signal.aborted) return;
      setMessages((prev) => ({ ...prev, items: prev.items.filter((m) => m.id !== pending.id) }));
      setDraft(text);
      setSendError(errorMessage(e, SEND_FAILED));
      if (e?.status === 409) setThreadFull(true);
      if (e?.status === 404) {
        setActiveId(null);
        refreshThreads();
      }
      if ([401, 503].includes(e?.status)) refreshAvailability();
    } finally {
      setSending(false);
      sendAbort.current = null;
    }
  }

  async function runAction(action, key) {
    setActionNote("");
    if (action.type === "open_step") navigate(`/dashboard#step-${action.step}`);
    else if (action.type === "open_resume") navigate("/resume");
    else if (action.type === "take_quiz") navigate("/quiz");
    else if (action.type === "mark_step_done") {
      setBusyAction(key);
      try {
        await setStepDone(action.step - 1, true);
        setActionNote(`Step ${action.step} marked done.`);
      } catch (e) {
        setActionNote(errorMessage(e, "Couldn't save that change. Please try again."));
      } finally {
        setBusyAction(null);
      }
    }
  }

  async function removeConfirmed() {
    const thread = confirmDelete;
    setConfirmDelete(null);
    if (!thread) return;
    try {
      await deleteThread(thread.id);
      setThreads((prev) => ({ ...prev, items: prev.items.filter((t) => t.id !== thread.id) }));
      if (activeId === thread.id) newConversation();
    } catch (e) {
      setThreads((prev) => ({ ...prev, error: errorMessage(e, "We couldn't delete that conversation.") }));
    }
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!sending) submit(draft);
    }
  }

  const steps = record?.mode === "account" ? record.roadmap : [];
  const statuses = record?.mode === "account" ? record.statuses : [];

  let body;
  if (!accountsEnabled) {
    body = (
      <StateCard icon={<UserRound size={26} />} title="The AI Coach needs an account">
        <p>Conversations are saved to your account, and accounts aren&apos;t available in this version of PathwayAI.</p>
      </StateCard>
    );
  } else if (authLoading) {
    body = <p className="dashMuted" role="status">Loading…</p>;
  } else if (!user) {
    body = (
      <StateCard
        icon={<UserRound size={26} />}
        title="Sign in to talk to your coach"
        action={
          <button type="button" className="homePrimaryBtn" onClick={() => navigate("/login", { state: { from: "/coach" } })}>
            Sign in
          </button>
        }
      >
        <p>The coach knows your roadmap and progress, and your conversations are saved to your account.</p>
      </StateCard>
    );
  } else if (availability.status === "loading") {
    body = <p className="dashMuted" role="status">Checking the coach…</p>;
  } else if (availability.status === "error") {
    body = (
      <StateCard
        icon={<MessageSquare size={26} />}
        title="Couldn't reach the coach"
        action={<button type="button" className="homePrimaryBtn" onClick={() => refreshAvailability()}>Try again</button>}
      >
        <p role="alert">{availability.error}</p>
      </StateCard>
    );
  } else if (!availability.data?.available) {
    body = (
      <StateCard icon={<Lock size={26} />} title="The AI Coach isn't available yet">
        <p>The coach is switched off for now. Your roadmap and dashboard work as usual.</p>
        {sendError && <p role="alert">{sendError}</p>}
      </StateCard>
    );
  } else {
    const canSend = !sending && !threadFull;
    body = (
      <div className="coachLayout">
        <aside className="dashCard coachThreads" aria-labelledby="coachThreadsTitle">
          <div className="coachThreadsHead">
            <h2 id="coachThreadsTitle" className="dashRailTitle">Conversations</h2>
            <button type="button" className="dashBtn coachNew" onClick={newConversation}>
              <Plus size={15} aria-hidden="true" /> New
            </button>
          </div>
          {threads.error && <p className="dashError" role="alert">{threads.error}</p>}
          {threads.status === "loading" ? (
            <p className="dashMuted" role="status">Loading…</p>
          ) : threads.items.length === 0 ? (
            <p className="dashMuted coachNone">No conversations yet.</p>
          ) : (
            <ul className="coachThreadList">
              {threads.items.map((t) => (
                <li key={t.id} className={`coachThread ${t.id === activeId ? "is-active" : ""}`}>
                  <button
                    type="button"
                    className="coachThreadOpen"
                    onClick={() => openThread(t.id)}
                    aria-current={t.id === activeId ? "true" : undefined}
                  >
                    <span className="coachThreadTitle">{t.title}</span>
                    <span className="dashMuted coachThreadDate">{formatDate(t.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="coachThreadDelete"
                    onClick={() => setConfirmDelete(t)}
                    aria-label={`Delete the conversation "${t.title}"`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="dashCard coachChat" aria-labelledby="coachChatTitle">
          <h2 id="coachChatTitle" className="srOnly">Chat with your coach</h2>
          {messages.status === "loading" && <p className="dashMuted" role="status">Loading conversation…</p>}
          {messages.status === "error" && <p className="dashError" role="alert">{messages.error}</p>}
          {messages.items.length === 0 && messages.status !== "loading" ? (
            <div className="coachWelcome">
              <p className="coachWelcomeText">
                Ask about your roadmap, what to learn next, projects or your job search.
                {record?.career ? ` Your coach knows your ${record.career} roadmap and progress.` : ""}
              </p>
              <div className="coachStarters">
                {STARTERS.map((s) => (
                  <button key={s} type="button" className="dashBtn coachStarter" onClick={() => submit(s)} disabled={!canSend}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="coachMessages" aria-live="polite" aria-busy={sending}>
              {messages.items.map((m) => (
                <CoachMessage
                  key={m.id}
                  message={m}
                  steps={steps}
                  statuses={statuses}
                  busyAction={busyAction}
                  onAction={runAction}
                />
              ))}
              {sending && (
                <li className="coachMsg coachMsg--coach coachTyping" aria-label="The coach is replying">
                  <span className="coachDot" /><span className="coachDot" /><span className="coachDot" />
                </li>
              )}
              <li ref={listEnd} aria-hidden="true" className="coachEnd" />
            </ol>
          )}

          {actionNote && <p className="coachNote" role="status">{actionNote}</p>}
          {sendError && (
            <p className="dashError" role="alert">
              {sendError}{" "}
              {threadFull && (
                <button type="button" className="authLink" onClick={newConversation}>Start a new conversation</button>
              )}
            </p>
          )}

          <form
            className="coachComposer"
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
            }}
          >
            <label htmlFor="coachInput" className="srOnly">Message the coach</label>
            <textarea
              id="coachInput"
              ref={inputRef}
              className="coachInput"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask your coach… (Enter to send, Shift+Enter for a new line)"
              rows={2}
              maxLength={MAX_MESSAGE}
              disabled={!canSend}
            />
            <div className="coachComposerEnd">
              <span className="dashMuted coachCount">{draft.length}/{MAX_MESSAGE}</span>
              <button type="submit" className="dashBtn dashBtn--primary" disabled={!canSend || !draft.trim()}>
                <Send size={15} aria-hidden="true" /> Send
              </button>
            </div>
          </form>
          <p className="dashMuted coachPrivacy">
            <ShieldCheck size={14} aria-hidden="true" /> Messages are processed by Google Gemini and saved to your
            account until you delete them. Please don&apos;t share personal details.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="homePage">
      <AppHeader />
      <main className="dashMain resumeMain">
        <div className="resumeIntro">
          <h1 className="resumeTitle">AI Coach</h1>
          <p className="dashMuted">
            Personal guidance grounded in your roadmap and progress. The coach suggests next steps; you decide
            what to do with them.
          </p>
        </div>
        {body}
      </main>

      <Dialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete this conversation?"
        actions={
          <>
            <button type="button" className="dashBtn" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button type="button" className="dashBtn dashBtn--primary" onClick={removeConfirmed}>Delete</button>
          </>
        }
      >
        <p>&ldquo;{confirmDelete?.title}&rdquo; and all its messages will be removed from your account. This can&apos;t be undone.</p>
      </Dialog>
    </div>
  );
}
