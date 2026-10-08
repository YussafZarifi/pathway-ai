import { StrictMode, createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../../lib/api";

const auth = { enabled: true, loading: false, user: null, recovery: false, endRecovery: vi.fn() };
vi.mock("../../lib/authContext", () => ({ useAuth: () => auth }));

const lib = {
  loadProfile: vi.fn(),
  saveDisplayName: vi.fn(),
  changePassword: vi.fn(),
  signOutEverywhere: vi.fn(),
  exportData: vi.fn(),
  deleteMyAccount: vi.fn(),
  setRecoveredPassword: vi.fn(),
};
vi.mock("../../lib/account", async (importOriginal) => {
  const actual = await importOriginal();
  const wrapped = Object.fromEntries(Object.keys(lib).map((k) => [k, (...a) => lib[k](...a)]));
  return { ...actual, ...wrapped };
});

const { default: Settings } = await import("../Settings");
const { default: ResetPassword } = await import("../ResetPassword");

function renderPage(Page = Settings) {
  return render(
    <MemoryRouter>
      {createElement(Page)}
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(lib).forEach((fn) => fn.mockReset());
  lib.loadProfile.mockResolvedValue({ displayName: "Ada" });
  auth.enabled = true;
  auth.loading = false;
  auth.user = { id: "u1", email: "a@example.com" };
  auth.recovery = false;
});

describe("/settings", () => {
  it("signed out: asks to sign in", () => {
    auth.user = null;
    renderPage();
    expect(screen.getByText("Sign in to manage your account")).toBeTruthy();
  });

  it("loads and saves the display name", async () => {
    lib.saveDisplayName.mockResolvedValue("Ada L");
    renderPage();
    const input = await screen.findByDisplayValue("Ada");
    fireEvent.change(input, { target: { value: "Ada L" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(lib.saveDisplayName).toHaveBeenCalledWith("u1", "Ada L");
  });

  it("checks the new password before calling Supabase", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "current1" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpassword" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("The new passwords don't match.")).toBeTruthy();
    expect(lib.changePassword).not.toHaveBeenCalled();
  });

  it("changes the password", async () => {
    lib.changePassword.mockResolvedValue();
    renderPage();
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "current1" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpassword" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: "newpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Password changed.")).toBeTruthy();
    expect(lib.changePassword).toHaveBeenCalledWith("a@example.com", "current1", "newpassword");
  });

  it("shows a wrong current password", async () => {
    lib.changePassword.mockRejectedValue(new ApiError("That password isn't right.", 400));
    renderPage();
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "wrongpass" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpassword" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: "newpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("That password isn't right.")).toBeTruthy();
  });

  it("downloads the data export", async () => {
    lib.exportData.mockResolvedValue(new Blob(["{}"], { type: "application/json" }));
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    renderPage();
    await screen.findByDisplayValue("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByText("Your data was downloaded.")).toBeTruthy();
    expect(lib.exportData).toHaveBeenCalledWith({ email: "a@example.com", displayName: "Ada" });
  });

  it("deletes the account only with the password and DELETE typed", async () => {
    lib.deleteMyAccount.mockResolvedValue();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
    const dialog = document.querySelector("dialog");
    const submit = within(dialog).getByRole("button", { name: "Delete forever" });
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Your password"), { target: { value: "pw123456" } });
    fireEvent.change(within(dialog).getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    fireEvent.click(submit);
    expect(await screen.findByText("Your account was deleted")).toBeTruthy();
    expect(lib.deleteMyAccount).toHaveBeenCalledWith("a@example.com", "pw123456");
  });

  it("keeps the account and explains a failed deletion", async () => {
    lib.deleteMyAccount.mockRejectedValue(new ApiError("That password isn't right.", 400));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
    const dialog = document.querySelector("dialog");
    fireEvent.change(within(dialog).getByLabelText("Your password"), { target: { value: "wrong" } });
    fireEvent.change(within(dialog).getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete forever" }));
    expect(await within(dialog).findByText("That password isn't right.")).toBeTruthy();
    expect(screen.queryByText("Your account was deleted")).toBeNull();
  });

  it("signs out everywhere", async () => {
    lib.signOutEverywhere.mockResolvedValue();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Sign out of all devices" }));
    await waitFor(() => expect(lib.signOutEverywhere).toHaveBeenCalled());
  });
});

describe("/reset-password", () => {
  it("refuses without a recovery link (a normal session can't skip the current password)", () => {
    renderPage(ResetPassword);
    expect(screen.getByText("This reset link isn't valid")).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("sets a new password from a recovery link", async () => {
    auth.recovery = true;
    lib.setRecoveredPassword.mockResolvedValue();
    renderPage(ResetPassword);
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "brandnew1" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: "brandnew1" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    expect(await screen.findByText("Password updated")).toBeTruthy();
    expect(lib.setRecoveredPassword).toHaveBeenCalledWith("brandnew1");
    expect(auth.endRecovery).toHaveBeenCalled();
  });

  it("checks length and match first", async () => {
    auth.recovery = true;
    renderPage(ResetPassword);
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    expect(await screen.findByText(/at least 8/)).toBeTruthy();
    expect(lib.setRecoveredPassword).not.toHaveBeenCalled();
  });
});

describe("/settings regressions", () => {
  it("keeps the name field disabled until the profile has loaded (a late load can't overwrite typing)", async () => {
    let resolve;
    lib.loadProfile.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage();
    const input = screen.getByPlaceholderText("Loading…");
    expect(input.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Save name" }).disabled).toBe(true);
    resolve({ displayName: "Ada" });
    expect(await screen.findByDisplayValue("Ada")).toBeTruthy();
    expect(screen.getByDisplayValue("Ada").disabled).toBe(false);
  });
});

describe("/settings regressions (double load)", () => {
  it("a stale profile load that finishes late never overwrites what the user typed", async () => {
    const resolvers = [];
    lib.loadProfile.mockImplementation(() => new Promise((r) => resolvers.push(r)));
    // StrictMode runs the effect twice, like the dev server where this was found.
    render(
      <StrictMode>
        <MemoryRouter>{createElement(Settings)}</MemoryRouter>
      </StrictMode>
    );
    await waitFor(() => expect(resolvers.length).toBe(2));
    resolvers[1]({ displayName: "" }); // the live load
    const input = await screen.findByLabelText(/^Name/);
    await waitFor(() => expect(input.disabled).toBe(false));
    fireEvent.change(input, { target: { value: "Typed Name" } });
    resolvers[0]({ displayName: "" }); // the stale first load arrives last
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByLabelText(/^Name/).value).toBe("Typed Name");
  });
});
