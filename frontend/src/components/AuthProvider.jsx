import { useEffect, useMemo, useState } from "react";
import { supabase, authEnabled } from "../lib/supabase";
import { AuthContext } from "../lib/authContext";

// Tracks the Supabase session for the whole app. Guests (and builds without
// Supabase configured) get session = null and everything else works as before.
export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(authEnabled);

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    // Keep this callback synchronous: awaiting other supabase.auth calls
    // inside it can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      enabled: authEnabled,
      loading,
      session,
      user: session?.user ?? null,
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
