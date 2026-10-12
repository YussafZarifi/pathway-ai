import { useEffect, useMemo, useState } from "react";
import { supabase, authEnabled, openedFromRecoveryLink } from "../lib/supabase";
import { AuthContext } from "../lib/authContext";

const INITIAL_SESSION_TIMEOUT_MS = 8_000;

// Tracks the Supabase session for the whole app. Guests (and builds without
// Supabase configured) get session = null and everything else works as before.
export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(authEnabled);
  // True after Supabase reports a password-recovery sign-in (the reset
  // link); /reset-password only accepts a new password then (ADR-022).
  const [recovery, setRecovery] = useState(authEnabled && openedFromRecoveryLink);

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    let initialSessionResolved = false;
    const finishInitialSession = (nextSession) => {
      if (!active || initialSessionResolved) return;
      initialSessionResolved = true;
      clearTimeout(sessionTimeout);
      setSession(nextSession);
      setLoading(false);
    };
    const sessionTimeout = setTimeout(() => finishInitialSession(null), INITIAL_SESSION_TIMEOUT_MS);
    supabase.auth.getSession().then(({ data }) => {
      finishInitialSession(data?.session || null);
    }).catch(() => finishInitialSession(null));

    // Keep this callback synchronous: awaiting other supabase.auth calls
    // inside it can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      initialSessionResolved = true;
      clearTimeout(sessionTimeout);
      setSession(next);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
    });

    return () => {
      active = false;
      clearTimeout(sessionTimeout);
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      enabled: authEnabled,
      loading,
      session,
      user: session?.user ?? null,
      recovery,
      endRecovery: () => setRecovery(false),
    }),
    [loading, session, recovery]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
