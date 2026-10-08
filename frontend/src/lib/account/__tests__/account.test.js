import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
};
const profileCalls = [];
vi.mock("../../supabase", () => ({
  supabase: {
    auth,
    from: () => ({
      update: (values) => ({ eq: (col, val) => (profileCalls.push(["update", values, col, val]), Promise.resolve({ error: null })) }),
    }),
  },
  authEnabled: true,
}));
const api = { deleteAccount: vi.fn(), getAccountExport: vi.fn() };
vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, deleteAccount: (...a) => api.deleteAccount(...a), getAccountExport: (...a) => api.getAccountExport(...a) };
});

const { changePassword, deleteMyAccount, exportData, newPasswordProblem, saveDisplayName } = await import("..");

beforeEach(() => {
  Object.values(auth).forEach((fn) => fn.mockReset());
  Object.values(api).forEach((fn) => fn.mockReset());
  profileCalls.length = 0;
  auth.signOut.mockResolvedValue({ error: null });
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "old" } } });
});

describe("newPasswordProblem", () => {
  it("needs 8+ characters and a matching repeat", () => {
    expect(newPasswordProblem("short", "short")).toContain("at least 8");
    expect(newPasswordProblem("longenough", "different")).toContain("don't match");
    expect(newPasswordProblem("longenough", "longenough")).toBe("");
  });
});

describe("saveDisplayName", () => {
  it("collapses whitespace, caps the length and clears an empty name", async () => {
    expect(await saveDisplayName("u1", "  Ada   Lovelace ")).toBe("Ada Lovelace");
    expect(profileCalls[0]).toEqual(["update", { display_name: "Ada Lovelace" }, "id", "u1"]);
    await saveDisplayName("u1", "   ");
    expect(profileCalls[1][1]).toEqual({ display_name: null });
    expect((await saveDisplayName("u1", "x".repeat(80))).length).toBe(60);
  });
});

describe("changePassword", () => {
  it("proves the current password before changing it", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    await changePassword("a@example.com", "current", "newpassword");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@example.com", password: "current" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "newpassword" });
  });

  it("stops when the current password is wrong", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials" } });
    await expect(changePassword("a@example.com", "wrong", "newpassword")).rejects.toMatchObject({ message: "That password isn't right." });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe("deleteMyAccount", () => {
  it("signs in again and deletes with the fresh token", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "fresh" } }, error: null });
    api.deleteAccount.mockResolvedValue(null);
    await deleteMyAccount("a@example.com", "pw");
    expect(api.deleteAccount).toHaveBeenCalledWith("fresh");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("deletes nothing with a wrong password", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials" } });
    await expect(deleteMyAccount("a@example.com", "wrong")).rejects.toBeTruthy();
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });
});

describe("exportData", () => {
  it("adds the email and display name to the server's export", async () => {
    api.getAccountExport.mockResolvedValue({ format: "pathwayai-export-1", account: { id: "u1", email: "a@example.com" }, roadmaps: [] });
    const blob = await exportData({ email: "a@example.com", displayName: "Ada" });
    const data = JSON.parse(await blob.text());
    expect(data.account).toEqual({ id: "u1", email: "a@example.com", display_name: "Ada" });
    expect(blob.type).toBe("application/json");
    expect(api.getAccountExport).toHaveBeenCalledWith("old");
  });
});
