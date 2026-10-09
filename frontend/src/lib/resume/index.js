/**
 * Résumé analyses for signed-in users (ADR-020).
 *
 * - Availability and new analyses go through FastAPI (lib/api.js): the PDF's
 *   bytes are the whole request body, nothing else about the file is sent.
 * - Saved analyses are read and deleted straight from Supabase; row-level
 *   security returns and deletes only the user's own rows. The browser can't
 *   create or edit them.
 *
 * Privacy: nothing here stores the file, its name or its contents (no
 * localStorage, no tracking events, no logs). The file name is read only to
 * recognize a PDF when the browser gives no type.
 */

import { ApiError, analyzeResume, getResumeAvailability } from "../api";
import { supabase } from "../supabase";

export const MIN_BYTES = 1024;
export const MAX_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY = 20;

const LOAD_FAILED = "We couldn't load your previous reviews. Please try again.";
const DELETE_FAILED = "We couldn't delete that review. Please try again.";

export const SECTION_LABELS = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  education: "Education",
  formatting: "Formatting",
  other: "Other",
};

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError("Please sign in again.", 401);
  return data.session.access_token;
}

/** A message for a file that can't be uploaded, or "" when it's fine. */
export function fileProblem(file) {
  if (!file) return "Choose a PDF file first.";
  const looksPdf = file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name || ""));
  if (!looksPdf) return "Please choose a PDF file. Export your résumé from Word or Google Docs as PDF.";
  if (file.size > MAX_BYTES) return "This PDF is larger than 2 MB. Please upload a smaller file.";
  if (file.size < MIN_BYTES) return "This file is too small to be a résumé PDF.";
  return "";
}

/** { available, reason, career } from the API. */
export async function checkAvailability({ signal } = {}) {
  return getResumeAvailability(await accessToken(), { signal });
}

/** Analyze a PDF; resolves to the saved analysis row. */
export async function analyze(file, { signal, onUploadProgress } = {}) {
  return analyzeResume(await accessToken(), file, { signal, onUploadProgress });
}

function list(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string" && v) : [];
}

/** A saved row in the shape the page renders, tolerating missing fields. */
export function normalizeAnalysis(row) {
  const a = row?.analysis && typeof row.analysis === "object" ? row.analysis : {};
  return {
    id: row.id,
    roadmapId: row.roadmap_id || null,
    career: row.career || "",
    createdAt: Date.parse(row.created_at) || null,
    summary: typeof a.summary === "string" ? a.summary : "",
    matchedSkills: list(a.matched_skills),
    missingSkills: list(a.missing_skills),
    strengths: list(a.strengths),
    gaps: (Array.isArray(a.gaps) ? a.gaps : [])
      .filter((g) => g && typeof g.skill === "string")
      .map((g) => ({
        skill: g.skill,
        why: typeof g.why === "string" ? g.why : "",
        howToClose: typeof g.how_to_close === "string" ? g.how_to_close : "",
        relatedStep: Number.isInteger(g.related_step) ? g.related_step : null,
      })),
    suggestions: (Array.isArray(a.suggestions) ? a.suggestions : [])
      .filter((s) => s && typeof s.text === "string")
      .map((s) => ({ section: SECTION_LABELS[s.section] ? s.section : "other", text: s.text })),
    scoreReport: a.score_report && typeof a.score_report === "object"
      && Array.isArray(a.score_report.categories)
      ? a.score_report
      : null,
  };
}

/** The user's saved reviews, newest first. */
export async function listAnalyses() {
  const { data, error } = await supabase
    .from("resume_analyses")
    .select("id, roadmap_id, career, analysis, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);
  if (error) {
    console.error("[Resume] Load failed:", error.code || "unknown");
    throw new ApiError(LOAD_FAILED, 503);
  }
  return (data || []).map(normalizeAnalysis);
}

/** Delete one of the user's reviews (RLS: only their own). */
export async function deleteAnalysis(id) {
  const { error } = await supabase.from("resume_analyses").delete().eq("id", id);
  if (error) {
    console.error("[Resume] Delete failed:", error.code || "unknown");
    throw new ApiError(DELETE_FAILED, 503);
  }
}
