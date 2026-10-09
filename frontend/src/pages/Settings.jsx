import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, KeyRound, LogOut, Trash2, UserRound } from "lucide-react";
import AppHeader from "../components/AppHeader";
import Dialog from "../components/Dialog";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/authContext";
import {
  MAX_DISPLAY_NAME,
  changePassword,
  deleteMyAccount,
  exportData,
  loadProfile,
  newPasswordProblem,
  saveDisplayName,
  signOutEverywhere,
} from "../lib/account";

function Section({ icon, title, children }) {
  return (
    <section className="dashCard settingsSection">
      <h2 className="dashRailTitle settingsTitle">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function Status({ text, error }) {
  if (!text) return null;
  return (
    <p className={error ? "dashError" : "coachNote"} role={error ? "alert" : "status"}>
      {text}
    </p>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { enabled, loading, user } = useAuth();
  const userId = user?.id || null;
  const email = user?.email || "";

  const [name, setName] = useState("");
  // The name field stays disabled until the profile has loaded, so a late
  // load can never overwrite what the user typed (found in browser QA).
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [nameState, setNameState] = useState({ busy: false, text: "", error: false });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwState, setPwState] = useState({ busy: false, text: "", error: false });
  const [sessionState, setSessionState] = useState({ busy: false, text: "", error: false });
  const [exportState, setExportState] = useState({ busy: false, text: "", error: false });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [del, setDel] = useState({ password: "", typed: "" });
  const [delState, setDelState] = useState({ busy: false, text: "", error: false });
  const [deleted, setDeleted] = useState(false);


  // Typed text always wins over a load that finishes later.
  const nameEdited = useRef(false);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    loadProfile(userId).then(
      (p) => {
        if (!active) return;
        if (!nameEdited.current) setName(p.displayName);
        setProfileLoaded(true);
      },
      (e) => {
        if (active) setNameState({ busy: false, text: errorMessage(e, "We couldn't load your profile."), error: true });
      }
    );
    return () => {
      active = false;
    };
  }, [userId]);

  async function onSaveName(event) {
    event.preventDefault();
    setNameState({ busy: true, text: "", error: false });
    try {
      const saved = await saveDisplayName(userId, name);
      setName(saved);
      setNameState({ busy: false, text: "Saved.", error: false });
    } catch (e) {
      setNameState({ busy: false, text: errorMessage(e, "We couldn't save your name."), error: true });
    }
  }

  async function onChangePassword(event) {
    event.preventDefault();
    const problem = newPasswordProblem(pw.next, pw.confirm);
    if (problem) {
      setPwState({ busy: false, text: problem, error: true });
      return;
    }
    setPwState({ busy: true, text: "", error: false });
    try {
      await changePassword(email, pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      setPwState({ busy: false, text: "Password changed.", error: false });
    } catch (e) {
      setPwState({ busy: false, text: errorMessage(e, "We couldn't change your password."), error: true });
    }
  }

  async function onSignOutEverywhere() {
    setSessionState({ busy: true, text: "", error: false });
    try {
      await signOutEverywhere();
      navigate("/login", { replace: true });
    } catch (e) {
      setSessionState({ busy: false, text: errorMessage(e, "We couldn't sign you out everywhere."), error: true });
    }
  }

  async function onExport() {
    setExportState({ busy: true, text: "", error: false });
    try {
      const blob = await exportData({ email, displayName: name });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "pathwayai-export.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportState({ busy: false, text: "Your data was downloaded.", error: false });
    } catch (e) {
      setExportState({ busy: false, text: errorMessage(e, "We couldn't prepare your data."), error: true });
    }
  }

  async function onDelete(event) {
    event.preventDefault();
    if (del.typed !== "DELETE") {
      setDelState({ busy: false, text: "Type DELETE to confirm.", error: true });
      return;
    }
    setDelState({ busy: true, text: "", error: false });
    try {
      await deleteMyAccount(email, del.password);
      setDeleteOpen(false);
      setDeleted(true);
    } catch (e) {
      setDelState({ busy: false, text: errorMessage(e, "We couldn't delete your account."), error: true });
    }
  }

  let content;
  if (deleted) {
    content = (
      <section className="dashCard dashEmpty resumeState" role="status">
        <span className="dashEmptyIcon" aria-hidden="true">
          <Trash2 size={26} />
        </span>
        <h2 className="dashEmptyTitle">Your account was deleted</h2>
        <p className="dashEmptyText">
          Your account and everything saved to it (roadmaps, progress, résumé reviews and coach conversations) are
          gone. A roadmap you kept in this browser as a guest isn&apos;t affected.
        </p>
        <button type="button" className="homePrimaryBtn" onClick={() => navigate("/")}>
          Back to PathwayAI
        </button>
      </section>
    );
  } else if (!enabled) {
    content = (
      <section className="dashCard dashEmpty resumeState">
        <span className="dashEmptyIcon" aria-hidden="true">
          <UserRound size={26} />
        </span>
        <h2 className="dashEmptyTitle">Accounts aren&apos;t available here</h2>
        <p className="dashEmptyText">This version of PathwayAI runs without accounts.</p>
      </section>
    );
  } else if (loading) {
    content = <p className="dashMuted" role="status">Loading…</p>;
  } else if (!user) {
    content = (
      <section className="dashCard dashEmpty resumeState">
        <span className="dashEmptyIcon" aria-hidden="true">
          <UserRound size={26} />
        </span>
        <h2 className="dashEmptyTitle">Sign in to manage your account</h2>
        <button type="button" className="homePrimaryBtn" onClick={() => navigate("/login", { state: { from: "/settings" } })}>
          Sign in
        </button>
      </section>
    );
  } else {
    content = (
      <div className="settingsGrid">
        <Section icon={<UserRound size={16} aria-hidden="true" />} title="Profile">
          <form className="authForm" onSubmit={onSaveName}>
            <label className="authField">
              <span className="authLabel">Email</span>
              <input className="textInput" type="email" value={email} readOnly aria-readonly="true" />
            </label>
            <label className="authField">
              <span className="authLabel">
                Name <span className="dashMuted">(optional)</span>
              </span>
              <input
                className="textInput"
                type="text"
                autoComplete="name"
                maxLength={MAX_DISPLAY_NAME}
                value={name}
                onChange={(e) => {
                  nameEdited.current = true;
                  setName(e.target.value);
                }}
                disabled={!profileLoaded}
                placeholder={profileLoaded ? "" : "Loading…"}
              />
            </label>
            <Status {...nameState} />
            <button type="submit" className="dashBtn dashBtn--primary settingsSubmit" disabled={nameState.busy || !profileLoaded}>
              {nameState.busy ? "Saving…" : "Save name"}
            </button>
          </form>
        </Section>

        <Section icon={<KeyRound size={16} aria-hidden="true" />} title="Password">
          <form className="authForm" onSubmit={onChangePassword}>
            <label className="authField">
              <span className="authLabel">Current password</span>
              <input className="textInput" type="password" autoComplete="current-password" required
                value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </label>
            <label className="authField">
              <span className="authLabel">New password</span>
              <input className="textInput" type="password" autoComplete="new-password" required minLength={8}
                value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </label>
            <label className="authField">
              <span className="authLabel">Repeat the new password</span>
              <input className="textInput" type="password" autoComplete="new-password" required
                value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </label>
            <Status {...pwState} />
            <button type="submit" className="dashBtn dashBtn--primary settingsSubmit" disabled={pwState.busy}>
              {pwState.busy ? "Changing…" : "Change password"}
            </button>
          </form>
        </Section>

        <Section icon={<LogOut size={16} aria-hidden="true" />} title="Sessions">
          <p className="dashMuted settingsText">Signed in on a shared or lost device? Sign out everywhere, including here.</p>
          <Status {...sessionState} />
          <button type="button" className="dashBtn" onClick={onSignOutEverywhere} disabled={sessionState.busy}>
            Sign out of all devices
          </button>
        </Section>

        <Section icon={<Download size={16} aria-hidden="true" />} title="Your data">
          <p className="dashMuted settingsText">
            Download everything PathwayAI stores about you as a JSON file: quiz answers, roadmaps and progress, résumé
            reviews and coach conversations.
          </p>
          <Status {...exportState} />
          <button type="button" className="dashBtn" onClick={onExport} disabled={exportState.busy}>
            {exportState.busy ? "Preparing…" : "Download my data"}
          </button>
        </Section>

        <section className="dashCard settingsSection settingsDanger">
          <h2 className="dashRailTitle settingsTitle">
            <Trash2 size={16} aria-hidden="true" /> Delete account
          </h2>
          <p className="dashMuted settingsText">
            Permanently deletes your account and everything saved to it. This can&apos;t be undone.
          </p>
          <button type="button" className="dashBtn settingsDangerBtn" onClick={() => { setDel({ password: "", typed: "" }); setDelState({ busy: false, text: "", error: false }); setDeleteOpen(true); }}>
            Delete my account…
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="homePage">
      <AppHeader />
      <main className="dashMain resumeMain">
        <div className="resumeIntro">
          <h1 className="resumeTitle">Settings</h1>
          <p className="dashMuted">Your profile, password, sessions and data.</p>
        </div>
        {content}
      </main>

      <Dialog isOpen={deleteOpen} onClose={() => !delState.busy && setDeleteOpen(false)} title="Delete your account?">
        <form className="authForm" onSubmit={onDelete}>
          <p>
            Everything saved to <strong>{email}</strong> will be deleted: roadmaps, progress, résumé reviews and coach
            conversations. Consider downloading your data first.
          </p>
          <label className="authField">
            <span className="authLabel">Your password</span>
            <input className="textInput" type="password" autoComplete="current-password" required
              value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />
          </label>
          <label className="authField">
            <span className="authLabel">Type DELETE to confirm</span>
            <input className="textInput" type="text" autoComplete="off" required
              value={del.typed} onChange={(e) => setDel({ ...del, typed: e.target.value })} />
          </label>
          <Status {...delState} />
          <div className="appDialogActions">
            <button type="button" className="dashBtn" onClick={() => setDeleteOpen(false)} disabled={delState.busy}>
              Cancel
            </button>
            <button type="submit" className="dashBtn settingsDangerBtn" disabled={delState.busy || del.typed !== "DELETE" || !del.password}>
              {delState.busy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
