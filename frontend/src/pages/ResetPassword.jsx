import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import AppHeader from "../components/AppHeader";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { MIN_PASSWORD } from "../lib/authErrors";
import { newPasswordProblem, setRecoveredPassword } from "../lib/account";

// Where the password-reset email's link lands (ADR-022). Supabase turns the
// link into a recovery session; only then does this page accept a new
// password. A normal session can't use it to skip the current password.
export default function ResetPassword() {
  const navigate = useNavigate();
  const { enabled, loading, recovery, endRecovery } = useAuth();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState({ busy: false, text: "", error: false, done: false });

  async function onSubmit(event) {
    event.preventDefault();
    const problem = newPasswordProblem(next, confirm);
    if (problem) {
      setState({ busy: false, text: problem, error: true, done: false });
      return;
    }
    setState({ busy: true, text: "", error: false, done: false });
    try {
      await setRecoveredPassword(next);
      endRecovery();
      setState({ busy: false, text: "", error: false, done: true });
    } catch (e) {
      setState({ busy: false, text: errorMessage(e, "We couldn't set your new password."), error: true, done: false });
    }
  }

  let content;
  if (!enabled) {
    content = <p className="dashMuted">Accounts aren&apos;t available in this version of PathwayAI.</p>;
  } else if (loading) {
    content = <p className="dashMuted" role="status">Checking your link…</p>;
  } else if (state.done) {
    content = (
      <section className="dashCard dashEmpty resumeState" role="status">
        <span className="dashEmptyIcon" aria-hidden="true"><KeyRound size={26} /></span>
        <h1 className="dashEmptyTitle">Password updated</h1>
        <p className="dashEmptyText">You&apos;re signed in with your new password.</p>
        <button type="button" className="homePrimaryBtn" onClick={() => navigate("/home")}>Go to your home</button>
      </section>
    );
  } else if (!recovery) {
    content = (
      <section className="dashCard dashEmpty resumeState">
        <span className="dashEmptyIcon" aria-hidden="true"><KeyRound size={26} /></span>
        <h1 className="dashEmptyTitle">This reset link isn&apos;t valid</h1>
        <p className="dashEmptyText">It may have expired or already been used. Request a new one.</p>
        <button type="button" className="homePrimaryBtn" onClick={() => navigate("/login", { state: { mode: "forgot" } })}>
          Request a new link
        </button>
      </section>
    );
  } else {
    content = (
      <section className="dashCard authCard" aria-labelledby="resetTitle">
        <h1 className="authTitle" id="resetTitle">Choose a new password</h1>
        <form className="authForm" onSubmit={onSubmit}>
          <label className="authField">
            <span className="authLabel">New password</span>
            <input className="textInput" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD}
              value={next} onChange={(e) => setNext(e.target.value)} />
            <span className="authHint">At least {MIN_PASSWORD} characters.</span>
          </label>
          <label className="authField">
            <span className="authLabel">Repeat the new password</span>
            <input className="textInput" type="password" autoComplete="new-password" required
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {state.text && <p className="dashError" role="alert">{state.text}</p>}
          <button type="submit" className="homePrimaryBtn authSubmit" disabled={state.busy}>
            {state.busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <div className="homePage">
      <AppHeader />
      <main className="dashMain">{content}</main>
    </div>
  );
}
