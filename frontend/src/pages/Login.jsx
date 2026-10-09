import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, MailCheck, UserRound } from "lucide-react";
import AppHeader from "../components/AppHeader";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/authContext";
import { MIN_PASSWORD, authErrorMessage } from "../lib/authErrors";

// Where the email confirmation link lands. It must be listed under
// Supabase > Authentication > URL Configuration (docs/deployment.md).
function confirmRedirectUrl() {
  return `${window.location.origin}/home`;
}

// Where the password-reset link lands (ADR-022); also listed under
// Supabase > Authentication > URL Configuration.
function resetRedirectUrl() {
  return `${window.location.origin}/reset-password`;
}

// Email + password sign-in and sign-up (ADR-018). Accounts are optional:
// every page also works as a guest.
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { enabled, loading, user } = useAuth();

  const [mode, setMode] = useState(
    ["signup", "forgot"].includes(location.state?.mode) ? location.state.mode : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [resent, setResent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  useEffect(() => {
    document.title = `${isSignup ? "Create account" : isForgot ? "Reset password" : "Sign in"} · PathwayAI`;
    return () => {
      document.title = "PathwayAI";
    };
  }, [isSignup, isForgot]);

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setErrorCode("");
    setResetSent(false);
  };

  // Same answer whether or not the email has an account (no enumeration).
  const handleReset = async (event) => {
    event.preventDefault();
    if (busy || !supabase) return;
    setBusy(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: resetRedirectUrl(),
    });
    setBusy(false);
    if (resetError && ["over_email_send_rate_limit", "over_request_rate_limit", "email_address_invalid"].includes(resetError.code)) {
      setError(authErrorMessage(resetError));
      return;
    }
    setResetSent(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy || !supabase) return;

    const cleanEmail = email.trim();
    if (isSignup && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      setErrorCode("");
      return;
    }

    setBusy(true);
    setError("");
    setErrorCode("");

    const { data, error: authError } = isSignup
      ? await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: confirmRedirectUrl(),
            data: displayName.trim() ? { display_name: displayName.trim().slice(0, 60) } : {},
          },
        })
      : await supabase.auth.signInWithPassword({ email: cleanEmail, password });

    setBusy(false);

    if (authError) {
      setError(authErrorMessage(authError));
      setErrorCode(authError.code || "");
      return;
    }

    if (isSignup && !data.session) {
      // Email confirmation is on: the account exists once the link is used.
      setSentTo(cleanEmail);
      setPassword("");
      return;
    }

    navigate(location.state?.from || "/home", { replace: true });
  };

  const handleResend = async () => {
    if (!supabase || busy) return;
    const target = sentTo || email.trim();
    if (!target) return;
    setBusy(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: target,
      options: { emailRedirectTo: confirmRedirectUrl() },
    });
    setBusy(false);
    if (resendError) {
      setError(authErrorMessage(resendError));
      setErrorCode(resendError.code || "");
    } else {
      setResent(true);
    }
  };

  let content;

  if (!enabled) {
    content = (
      <section className="dashCard dashEmpty" aria-labelledby="authTitle">
        <span className="dashEmptyIcon" aria-hidden="true">
          <UserRound size={26} />
        </span>
        <h1 className="dashEmptyTitle" id="authTitle">
          Accounts aren&apos;t available here
        </h1>
        <p className="dashEmptyText">
          This version of PathwayAI runs without accounts. You can still take the quiz and
          keep your roadmap in this browser.
        </p>
        <button type="button" className="homePrimaryBtn" onClick={() => navigate("/quiz")}>
          Take the quiz
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </section>
    );
  } else if (!loading && user) {
    content = (
      <section className="dashCard dashEmpty" aria-labelledby="authTitle">
        <span className="dashEmptyIcon" aria-hidden="true">
          <UserRound size={26} />
        </span>
        <h1 className="dashEmptyTitle" id="authTitle">
          You&apos;re signed in
        </h1>
        <p className="dashEmptyText">
          Signed in as <strong>{user.email}</strong>.
        </p>
        <button type="button" className="homePrimaryBtn" onClick={() => navigate("/home")}>
          Go to your home
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </section>
    );
  } else if (isForgot) {
    content = (
      <section className="dashCard authCard" aria-labelledby="authTitle">
        <h1 className="authTitle" id="authTitle">
          Reset your password
        </h1>
        {resetSent ? (
          <p className="authLead" role="status">
            If an account exists for <strong>{email.trim()}</strong>, a link to choose a new password
            is on its way. It works once and expires after an hour.
          </p>
        ) : (
          <>
            <p className="authLead">Enter your account&apos;s email and we&apos;ll send you a reset link.</p>
            <form className="authForm" onSubmit={handleReset}>
              <label className="authField">
                <span className="authLabel">Email</span>
                <input
                  className="textInput"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {error && (
                <p className="dashError" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="homePrimaryBtn authSubmit" disabled={busy}>
                {busy ? "Please wait…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <p className="authGuest">
          <button type="button" className="authLink" onClick={() => switchMode("signin")}>
            Back to sign in
          </button>
        </p>
      </section>
    );
  } else if (sentTo) {
    content = (
      <section className="dashCard dashEmpty" aria-labelledby="authTitle">
        <span className="dashEmptyIcon" aria-hidden="true">
          <MailCheck size={26} />
        </span>
        <h1 className="dashEmptyTitle" id="authTitle">
          Check your email
        </h1>
        <p className="dashEmptyText" role="status">
          We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish
          creating your account, then sign in.
        </p>
        {error && (
          <p className="dashError" role="alert">
            {error}
          </p>
        )}
        <div className="notFoundActions">
          <button
            type="button"
            className="homePrimaryBtn"
            onClick={() => {
              setSentTo("");
              setResent(false);
              switchMode("signin");
            }}
          >
            Back to sign in
          </button>
          <button type="button" className="ghostBtn" onClick={handleResend} disabled={busy || resent}>
            {resent ? "Email sent again" : "Resend the email"}
          </button>
        </div>
      </section>
    );
  } else {
    content = (
      <section className="dashCard authCard" aria-labelledby="authTitle">
        <h1 className="authTitle" id="authTitle">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="authLead">
          {isSignup
            ? "Save your progress under an account. The quiz works without one too."
            : "Sign in with your email and password."}
        </p>

        <div className="authTabs" role="group" aria-label="Account">
          <button
            type="button"
            className={`authTab ${!isSignup ? "active" : ""}`}
            aria-pressed={!isSignup}
            onClick={() => switchMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`authTab ${isSignup ? "active" : ""}`}
            aria-pressed={isSignup}
            onClick={() => switchMode("signup")}
          >
            Create account
          </button>
        </div>

        <form className="authForm" onSubmit={handleSubmit}>
          {isSignup && (
            <label className="authField">
              <span className="authLabel">
                Name <span className="dashMuted">(optional)</span>
              </span>
              <input
                className="textInput"
                type="text"
                name="name"
                autoComplete="name"
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
          )}

          <label className="authField">
            <span className="authLabel">Email</span>
            <input
              className="textInput"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="authField">
            <span className="authLabel">Password</span>
            <input
              className="textInput"
              type="password"
              name="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={isSignup ? MIN_PASSWORD : undefined}
              aria-describedby={isSignup ? "passwordHint" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {isSignup && (
              <span className="authHint" id="passwordHint">
                At least {MIN_PASSWORD} characters.
              </span>
            )}
          </label>
          {!isSignup && (
            <button type="button" className="authLink authForgot" onClick={() => switchMode("forgot")}>
              Forgot your password?
            </button>
          )}

          {error && (
            <p className="dashError" role="alert">
              {error}
            </p>
          )}
          {errorCode === "email_not_confirmed" && (
            <button type="button" className="authLink" onClick={handleResend} disabled={busy || resent}>
              {resent ? "Confirmation email sent" : "Resend the confirmation email"}
            </button>
          )}

          <button type="submit" className="homePrimaryBtn authSubmit" disabled={busy || loading}>
            {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="authGuest">
          No account needed to get started.{" "}
          <button type="button" className="authLink" onClick={() => navigate("/quiz")}>
            Take the quiz as a guest
          </button>
        </p>
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
