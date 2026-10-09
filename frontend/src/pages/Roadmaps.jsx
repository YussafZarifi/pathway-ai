import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, History, Map, UserRound } from "lucide-react";
import AppHeader from "../components/AppHeader";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { accountRepository } from "../lib/roadmaps";

function formatDate(ms) {
  return ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
}

function StateCard({ icon, title, children, action }) {
  return (
    <section className="dashCard dashEmpty resumeState">
      <span className="dashEmptyIcon" aria-hidden="true">{icon}</span>
      <h2 className="dashEmptyTitle">{title}</h2>
      <div className="dashEmptyText">{children}</div>
      {action}
    </section>
  );
}

function StepList({ record }) {
  return (
    <ol className="historySteps">
      {record.roadmap.map((step, i) => {
        const done = record.statuses[i]?.done;
        return (
          <li key={step.id || i} className={`historyStep ${done ? "is-done" : ""}`}>
            <span className="historyStepMark" aria-hidden="true">{done ? <Check size={13} /> : i + 1}</span>
            <span className="historyStepTitle">{step.title}</span>
            <span className="srOnly">{done ? "(done)" : "(not done)"}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Roadmap history for signed-in users: every saved roadmap, the current
// one first by date, archived ones viewable and restorable.
export default function Roadmaps() {
  const navigate = useNavigate();
  const { enabled, loading, user } = useAuth();
  const userId = user?.id || null;
  const [state, setState] = useState({ status: "loading", items: [], error: "" });
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [note, setNote] = useState({ text: "", error: false });


  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "loading", error: "" }));
    try {
      const items = await accountRepository.history();
      setState({ status: "ready", items, error: "" });
    } catch (e) {
      setState({ status: "error", items: [], error: errorMessage(e, "We couldn't load your roadmaps.") });
    }
  }, []);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  async function makeCurrent(item) {
    setBusyId(item.id);
    setNote({ text: "", error: false });
    try {
      await accountRepository.activate(item.id);
      await load();
      setNote({ text: `${item.career} is your current roadmap again.`, error: false });
    } catch (e) {
      setNote({ text: errorMessage(e, "We couldn't switch roadmaps. Please try again."), error: true });
    } finally {
      setBusyId(null);
    }
  }

  let content;
  if (!enabled) {
    content = (
      <StateCard icon={<Map size={26} />} title="Your roadmap lives in this browser"
        action={<button type="button" className="homePrimaryBtn" onClick={() => navigate("/dashboard")}>Open your dashboard</button>}>
        <p>This version of PathwayAI keeps one roadmap at a time, in this browser.</p>
      </StateCard>
    );
  } else if (loading) {
    content = <p className="dashMuted" role="status">Loading…</p>;
  } else if (!user) {
    content = (
      <StateCard icon={<UserRound size={26} />} title="Sign in to keep a roadmap history"
        action={<button type="button" className="homePrimaryBtn" onClick={() => navigate("/login", { state: { from: "/roadmaps" } })}>Sign in</button>}>
        <p>As a guest you keep one roadmap in this browser. With an account, every roadmap you generate is kept and you can switch back to any of them.</p>
      </StateCard>
    );
  } else if (state.status === "loading") {
    content = <p className="dashMuted" role="status">Loading your roadmaps…</p>;
  } else if (state.status === "error") {
    content = (
      <StateCard icon={<History size={26} />} title="Couldn't load your roadmaps"
        action={<button type="button" className="homePrimaryBtn" onClick={load}>Try again</button>}>
        <p role="alert">{state.error}</p>
      </StateCard>
    );
  } else if (state.items.length === 0) {
    content = (
      <StateCard icon={<Map size={26} />} title="No roadmaps yet"
        action={<button type="button" className="homePrimaryBtn" onClick={() => navigate("/quiz")}>Take the career quiz</button>}>
        <p>Your roadmaps will appear here.</p>
      </StateCard>
    );
  } else {
    content = (
      <>
        {note.text && <p className={note.error ? "dashError" : "coachNote"} role={note.error ? "alert" : "status"}>{note.text}</p>}
        <ul className="historyList">
          {state.items.map((item) => {
            const isCurrent = item.status === "active";
            const percent = item.total ? Math.round((item.done / item.total) * 100) : 0;
            const open = openId === item.id;
            return (
              <li key={item.id} className={`dashCard historyItem ${isCurrent ? "is-current" : ""}`}>
                <div className="historyHead">
                  <div className="historyMeta">
                    <span className="historyCareer">{item.career}</span>
                    <span className="dashMuted">
                      {formatDate(item.createdAt)}
                      {item.source === "imported" ? " · saved from this browser" : ""}
                    </span>
                  </div>
                  <span className={`historyBadge ${isCurrent ? "historyBadge--current" : ""}`}>
                    {isCurrent ? "Current" : "Archived"}
                  </span>
                </div>
                <div className="historyProgress" role="img" aria-label={`${item.done} of ${item.total} steps done`}>
                  <span style={{ width: `${percent}%` }} />
                </div>
                <div className="historyActions">
                  <span className="dashMuted">{item.done} of {item.total} steps done</span>
                  <div className="historyButtons">
                    <button type="button" className="dashBtn" aria-expanded={open} onClick={() => setOpenId(open ? null : item.id)}>
                      {open ? "Hide steps" : "View steps"}
                    </button>
                    {isCurrent ? (
                      <button type="button" className="dashBtn dashBtn--primary" onClick={() => navigate("/dashboard")}>
                        Open dashboard
                      </button>
                    ) : (
                      <button type="button" className="dashBtn" onClick={() => makeCurrent(item)} disabled={busyId !== null}>
                        {busyId === item.id ? "Switching…" : "Make current"}
                      </button>
                    )}
                  </div>
                </div>
                {open && <StepList record={item.record} />}
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <div className="homePage">
      <AppHeader />
      <main className="dashMain resumeMain">
        <div className="resumeIntro">
          <h1 className="resumeTitle">Your roadmaps</h1>
          <p className="dashMuted">Every roadmap you&apos;ve generated, with its progress. Switch back to any of them.</p>
        </div>
        {content}
      </main>
    </div>
  );
}
