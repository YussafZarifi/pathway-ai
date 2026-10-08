import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = [];
const result = { data: [], error: null };
function query(table) {
  const q = {
    select: (cols) => (calls.push(["select", table, cols]), q),
    eq: (col, val) => (calls.push(["eq", col, val]), table === "coach_threads" && calls.some((c) => c[0] === "delete") ? Promise.resolve(result) : q),
    order: (col, opts) => (calls.push(["order", col, opts]), q),
    limit: (n) => (calls.push(["limit", n]), Promise.resolve(result)),
    delete: () => (calls.push(["delete", table]), q),
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

const { deleteThread, listThreads, loadMessages, messageProblem, normalizeActions, normalizeMessage } = await import("..");

beforeEach(() => {
  calls.length = 0;
  result.data = [];
  result.error = null;
});

describe("messageProblem", () => {
  it("accepts a normal question", () => {
    expect(messageProblem("What should I learn next?")).toBe("");
  });

  it.each([
    ["", "Type a message"],
    ["   ", "Type a message"],
    ["x".repeat(1001), "under 1000 characters"],
    ["mail me at jane@example.com", "remove email addresses"],
    ["call 555-123-4567", "remove email addresses"],
  ])("rejects %j", (text, message) => {
    expect(messageProblem(text)).toContain(message);
  });

  it("doesn't mistake years or ranges for phone numbers", () => {
    expect(messageProblem("I studied 2019-2023 and built apps for 1000-2000 users")).toBe("");
  });
});

describe("normalize", () => {
  it("keeps only known actions with a whole-number or empty step", () => {
    expect(normalizeActions([
      { type: "open_step", step: 2 },
      { type: "delete_account", step: null },
      { type: "mark_step_done", step: "2" },
      { type: "take_quiz", step: null },
      null,
    ])).toEqual([{ type: "open_step", step: 2 }, { type: "take_quiz", step: null }]);
    expect(normalizeActions("x")).toEqual([]);
  });

  it("never gives user messages actions", () => {
    const msg = normalizeMessage({ id: "1", role: "user", content: "hi", actions: [{ type: "take_quiz", step: null }], created_at: "2026-10-07T00:00:00Z" });
    expect(msg).toMatchObject({ role: "user", actions: [] });
  });

  it("treats anything but 'user' as the coach and tolerates bad content", () => {
    expect(normalizeMessage({ id: "2", role: "system", content: 5 })).toMatchObject({ role: "assistant", content: "" });
  });
});

describe("Supabase reads and delete", () => {
  it("lists the 30 most recent conversations", async () => {
    result.data = [{ id: "t1", title: "Hi", updated_at: "2026-10-07T00:00:00Z" }];
    expect(await listThreads()).toEqual([{ id: "t1", title: "Hi", updatedAt: Date.parse("2026-10-07T00:00:00Z") }]);
    expect(calls).toEqual([
      ["select", "coach_threads", "id, title, updated_at"],
      ["order", "updated_at", { ascending: false }],
      ["limit", 30],
    ]);
  });

  it("loads one conversation oldest first", async () => {
    result.data = [{ id: "m1", role: "user", content: "q", actions: [], created_at: "2026-10-07T00:00:00Z" }];
    const messages = await loadMessages("t1");
    expect(messages[0]).toMatchObject({ id: "m1", role: "user", content: "q" });
    expect(calls).toContainEqual(["eq", "thread_id", "t1"]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: true }]);
  });

  it("hides the database's message on failure", async () => {
    result.error = { code: "42501", message: "permission denied for table coach_threads" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(listThreads()).rejects.toMatchObject({ status: 503 });
    expect(spy.mock.calls.flat().join(" ")).not.toContain("permission denied");
  });

  it("deletes a conversation by id", async () => {
    await deleteThread("t1");
    expect(calls).toEqual([["delete", "coach_threads"], ["eq", "id", "t1"]]);
  });
});
