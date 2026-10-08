// The single Supabase client (accounts, ADR-018). It only gets the project
// URL and the publishable key, which are safe in the browser; data access
// is limited by row-level security. Without both variables auth is off and
// the app runs exactly as the guest-only version did (see .env.example).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();

// Read before the client consumes the URL below: a password-reset link
// lands with "type=recovery" in the hash (ADR-022). The PASSWORD_RECOVERY
// event can fire before React subscribes, so this is the reliable signal.
export const openedFromRecoveryLink =
  typeof window !== "undefined" && /(^|[#&])type=recovery(&|$)/.test(window.location.hash);
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

export const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Picks up the session from the email confirmation link.
          detectSessionInUrl: true,
        },
      })
    : null;

export const authEnabled = supabase !== null;
