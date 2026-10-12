import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  authEnabled: true,
  openedFromRecoveryLink: false,
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
    },
  },
}));

const { default: AuthProvider } = await import("../AuthProvider");
const { useAuth } = await import("../../lib/authContext");

function AuthStatus() {
  const { loading, user } = useAuth();
  return <p role="status">{loading ? "Loading session" : user ? `Signed in as ${user.email}` : "Signed out"}</p>;
}

function renderProvider() {
  return render(<AuthProvider><AuthStatus /></AuthProvider>);
}

beforeEach(() => {
  vi.useFakeTimers();
  authMocks.getSession.mockReset();
  authMocks.onAuthStateChange.mockReset();
  authMocks.unsubscribe.mockReset();
  authMocks.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: authMocks.unsubscribe } } }));
});

afterEach(() => vi.useRealTimers());

describe("initial auth session", () => {
  it("ends loading when the initial session request stalls", async () => {
    authMocks.getSession.mockImplementation(() => new Promise(() => {}));
    renderProvider();
    expect(screen.getByRole("status").textContent).toBe("Loading session");
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(screen.getByRole("status").textContent).toBe("Signed out");
  });

  it("treats an initial session request rejection as signed out", async () => {
    authMocks.getSession.mockRejectedValue(new Error("network detail"));
    renderProvider();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("status").textContent).toBe("Signed out");
  });

  it("uses the session returned by Supabase", async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: { user: { email: "learner@example.test" } } } });
    renderProvider();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("status").textContent).toBe("Signed in as learner@example.test");
  });
});
