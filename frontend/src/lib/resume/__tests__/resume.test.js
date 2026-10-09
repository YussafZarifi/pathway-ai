import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = [];
const result = { data: [], error: null };
function query(table) {
  const q = {
    select: (cols) => (calls.push(["select", table, cols]), q),
    order: (col, opts) => (calls.push(["order", col, opts]), q),
    limit: (n) => (calls.push(["limit", n]), Promise.resolve(result)),
    delete: () => (calls.push(["delete", table]), q),
    eq: (col, val) => (calls.push(["eq", col, val]), Promise.resolve(result)),
  };
  return q;
}
vi.mock("../../supabase", () => ({
  supabase: {
    from: (table) => query(table),
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "tok" } } }) },
  },
  authEnabled: true,
}));

const { deleteAnalysis, fileProblem, listAnalyses, MAX_BYTES, normalizeAnalysis } = await import("..");

function file(size, { type = "application/pdf", name = "cv.pdf" } = {}) {
  return { size, type, name };
}

beforeEach(() => {
  calls.length = 0;
  result.data = [];
  result.error = null;
});

describe("fileProblem", () => {
  it("accepts a PDF between 1 KB and 2 MB", () => {
    expect(fileProblem(file(5000))).toBe("");
    expect(fileProblem(file(MAX_BYTES))).toBe("");
  });

  it("accepts a .pdf without a browser type", () => {
    expect(fileProblem(file(5000, { type: "", name: "CV.PDF" }))).toBe("");
  });

  it.each([
    [null, "Choose a PDF"],
    [file(5000, { type: "application/msword", name: "cv.doc" }), "Please choose a PDF"],
    [file(5000, { type: "", name: "cv.docx" }), "Please choose a PDF"],
    [file(MAX_BYTES + 1), "larger than 2 MB"],
    [file(1023), "too small"],
  ])("rejects %o", (f, message) => {
    expect(fileProblem(f)).toContain(message);
  });
});

describe("normalizeAnalysis", () => {
  it("maps a saved row to the page's shape", () => {
    const item = normalizeAnalysis({
      id: "1", roadmap_id: "r", career: "Data Analyst", created_at: "2026-10-07T12:00:00Z",
      analysis: {
        summary: "S", matched_skills: ["SQL"], missing_skills: ["Tableau"], strengths: ["Good"],
        gaps: [{ skill: "Tableau", why: "w", how_to_close: "h", related_step: 3 }],
        suggestions: [{ section: "projects", text: "t" }],
        score_report: { overall: 86, categories: [] },
      },
    });
    expect(item).toMatchObject({
      id: "1", roadmapId: "r", career: "Data Analyst", summary: "S",
      matchedSkills: ["SQL"], gaps: [{ skill: "Tableau", howToClose: "h", relatedStep: 3 }],
      suggestions: [{ section: "projects", text: "t" }],
      scoreReport: { overall: 86, categories: [] },
    });
    expect(item.createdAt).toBe(Date.parse("2026-10-07T12:00:00Z"));
  });

  it("tolerates missing or malformed fields", () => {
    const item = normalizeAnalysis({
      id: "2", analysis: { gaps: [null, { skill: "X", related_step: "2" }], suggestions: [{ section: "hack", text: "t" }], matched_skills: [1, "", "Go"] },
    });
    expect(item.summary).toBe("");
    expect(item.matchedSkills).toEqual(["Go"]);
    expect(item.gaps).toEqual([{ skill: "X", why: "", howToClose: "", relatedStep: null }]);
    expect(item.suggestions).toEqual([{ section: "other", text: "t" }]);
    expect(item.roadmapId).toBeNull();
    expect(item.scoreReport).toBeNull();
  });
});

describe("history", () => {
  it("lists the newest 20 of the user's reviews (RLS scopes them)", async () => {
    result.data = [{ id: "1", analysis: {}, created_at: "2026-10-07T00:00:00Z" }];
    const items = await listAnalyses();
    expect(items.map((i) => i.id)).toEqual(["1"]);
    expect(calls).toEqual([
      ["select", "resume_analyses", "id, roadmap_id, career, analysis, created_at"],
      ["order", "created_at", { ascending: false }],
      ["limit", 20],
    ]);
  });

  it("reports a load failure without the database's message", async () => {
    result.error = { code: "42501", message: "permission denied for table resume_analyses" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(listAnalyses()).rejects.toMatchObject({ status: 503, message: expect.stringContaining("couldn't load") });
    expect(spy.mock.calls.flat().join(" ")).not.toContain("permission denied");
  });

  it("deletes by id", async () => {
    await deleteAnalysis("abc");
    expect(calls).toEqual([["delete", "resume_analyses"], ["eq", "id", "abc"]]);
  });
});
