/**
 * AI Coach for signed-in users (ADR-021).
 *
 * - Availability and new messages go through FastAPI (lib/api.js); it
 *   saves the question and the reply together.
 * - Conversations are read and deleted straight from Supabase; row-level
 *   security returns and deletes only the user's own. The browser can't
 *   write or edit messages.
 *
 * Nothing here stores or logs message text (no localStorage, no tracking).
 */

import { ApiError, getCoachAvailability, postCoachMessage } from "../api";
import { supabase } from "../supabase";

export const MAX_MESSAGE = 1000;
const MAX_THREADS = 30;
const MAX_MESSAGES = 200;

const LOAD_FAILED = "We couldn't load your conversations. Please try again.";
const MESSAGES_FAILED = "We couldn't load this conversation. Please try again.";
const DELETE_FAILED = "We couldn't delete that conversation. Please try again.";

// Same patterns as the server's guard (backend/strict_ai.py), so the user
// hears about it before sending.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /(?<!\w)(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}(?!\w)/;

export const ACTION_TYPES = ["open_step", "mark_step_done", "open_resume", "take_quiz"];

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError("Please sign in again.", 401);
  return data.session.access_token;
}

/** A message for text that can't be sent, or "" when it's fine. */
export function messageProblem(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return "Type a message first.";
  if (trimmed.length > MAX_MESSAGE) return `Please keep messages under ${MAX_MESSAGE} characters.`;
  if (EMAIL.test(trimmed) || PHONE.test(trimmed)) {
    return "Please remove email addresses and phone numbers. The coach doesn't need them.";
  }
  return "";
}

export async function checkAvailability({ signal } = {}) {
  return getCoachAvailability(await accessToken(), { signal });
}

export async function send(threadId, message, { signal } = {}) {
  return postCoachMessage(await accessToken(), { threadId, message: message.trim() }, { signal });
}

/** Valid actions only (the server already checked them; this is a guard). */
export function normalizeActions(actions) {
  return (Array.isArray(actions) ? actions : []).filter(
    (a) => a && ACTION_TYPES.includes(a.type) && (a.step === null || a.step === undefined || Number.isInteger(a.step))
  );
}

export function normalizeMessage(row) {
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: typeof row.content === "string" ? row.content : "",
    actions: row.role === "user" ? [] : normalizeActions(row.actions),
    createdAt: Date.parse(row.created_at) || null,
  };
}

/** The user's conversations, most recent first. */
export async function listThreads() {
  const { data, error } = await supabase
    .from("coach_threads")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_THREADS);
  if (error) {
    console.error("[Coach] Load failed:", error.code || "unknown");
    throw new ApiError(LOAD_FAILED, 503);
  }
  return (data || []).map((t) => ({ id: t.id, title: t.title, updatedAt: Date.parse(t.updated_at) || null }));
}

/** One conversation's messages, oldest first. */
export async function loadMessages(threadId) {
  const { data, error } = await supabase
    .from("coach_messages")
    .select("id, role, content, actions, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES);
  if (error) {
    console.error("[Coach] Messages failed:", error.code || "unknown");
    throw new ApiError(MESSAGES_FAILED, 503);
  }
  return (data || []).map(normalizeMessage);
}

/** Delete a conversation and its messages (RLS: only the user's own). */
export async function deleteThread(id) {
  const { error } = await supabase.from("coach_threads").delete().eq("id", id);
  if (error) {
    console.error("[Coach] Delete failed:", error.code || "unknown");
    throw new ApiError(DELETE_FAILED, 503);
  }
}
