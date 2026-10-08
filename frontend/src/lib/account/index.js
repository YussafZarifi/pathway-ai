/**
 * Account management for signed-in users (ADR-022): profile, password,
 * sessions, data export and deletion. Supabase Auth handles credentials;
 * the profile is updated through RLS; export and deletion go through
 * FastAPI. Passwords are only passed to Supabase, never stored or logged.
 */

import { ApiError, deleteAccount, getAccountExport } from "../api";
import { MIN_PASSWORD, authErrorMessage } from "../authErrors";
import { supabase } from "../supabase";

export const MAX_DISPLAY_NAME = 60;

async function session() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError("Please sign in again.", 401);
  return data.session;
}

/** Prove the current password (a fresh sign-in); returns the new session. */
async function confirmPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message = error.code === "invalid_credentials" ? "That password isn't right." : authErrorMessage(error);
    throw new ApiError(message, 400);
  }
  return data.session;
}

export async function loadProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  if (error) {
    console.error("[Account] Profile load failed:", error.code || "unknown");
    throw new ApiError("We couldn't load your profile. Please try again.", 503);
  }
  return { displayName: data?.display_name || "" };
}

export async function saveDisplayName(userId, name) {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_DISPLAY_NAME);
  const { error } = await supabase.from("profiles").update({ display_name: clean || null }).eq("id", userId);
  if (error) {
    console.error("[Account] Profile save failed:", error.code || "unknown");
    throw new ApiError("We couldn't save your name. Please try again.", 503);
  }
  return clean;
}

export function newPasswordProblem(next, confirm) {
  if (next.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for your new password.`;
  if (next !== confirm) return "The new passwords don't match.";
  return "";
}

/** Change the password after proving the current one. */
export async function changePassword(email, current, next) {
  await confirmPassword(email, current);
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) throw new ApiError(authErrorMessage(error), 400);
}

/** Set a new password from a recovery link (/reset-password). */
export async function setRecoveredPassword(next) {
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) throw new ApiError(authErrorMessage(error), 400);
}

/** Sign out on every device (revokes all refresh tokens). */
export async function signOutEverywhere() {
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) throw new ApiError(authErrorMessage(error), 503);
}

/** A downloadable JSON file with all the user's data. */
export async function exportData({ email, displayName }) {
  const s = await session();
  const data = await getAccountExport(s.access_token);
  const body = { ...data, account: { ...data.account, email, display_name: displayName || null } };
  return new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
}

/** Delete the account after proving the password; signs out locally. */
export async function deleteMyAccount(email, password) {
  const fresh = await confirmPassword(email, password);
  await deleteAccount(fresh.access_token);
  // The server already removed the user and their sessions; clear this tab.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
}
