import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "../../lib/api";

const auth = { enabled: true, loading: false, session: null, user: null };
vi.mock("../../lib/authContext", () => ({ useAuth: () => auth }));

const roadmap = { record: null, setStepDone: vi.fn() };
vi.mock("../../lib/roadmaps/useCurrentRoadmap", () => ({ useCurrentRoadmap: () => roadmap }));

const api = {
  checkAvailability: vi.fn(),
  send: vi.fn(),
  listThreads: vi.fn(),
  loadMessages: vi.fn(),
  deleteThread: vi.fn(),
};
vi.mock("../../lib/coach", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    checkAvailability: (...a) => api.checkAvailability(...a),
    send: (...a) => api.send(...a),
    listThreads: (...a) => api.listThreads(...a),
    loadMessages: (...a) => api.loadMessages(...a),
    deleteThread: (...a) => api.deleteThread(...a),
  };
});

const { default: Coach } = await import("../Coach");

const RECORD = {
  mode: "account",
  career: "Data Analyst",
  roadmap: [{ title: "SQL" }, { title: "Python" }, { title: "Dashboards" }],
  statuses: [{ index: 0, done: true }, { index: 1, done: false }, { index: 2, done: false }],
};

function exchange(reply = "Start step 2.", actions = [{ type: "open_step", step: 2 }], threadId = "t1") {
  return {
    thread_id: threadId,
    title: "What next?",
    messages: [
      { id: `u-${Math.random()}`, role: "user", content: "What next?", actions: [], created_at: "2026-10-07T00:00:00Z" },
      { id: `a-${Math.random()}`, role: "assistant", content: reply, actions, created_at: "2026-10-07T00:00:01Z" },
    ],
  };
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.hash}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/coach"]}>
      <Routes>
        <Route path="/coach" element={<Coach />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

function signIn() {
  auth.enabled = true;
  auth.user = { id: "u1", email: "u1@example.test" };
}

async function typeAndSend(text) {
  const box = await screen.findByLabelText("Message the coach");
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /Send/ }));
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.checkAvailability.mockResolvedValue({ available: true, reason: null });
  api.listThreads.mockResolvedValue([]);
  api.loadMessages.mockResolvedValue([]);
  roadmap.record = RECORD;
  roadmap.setStepDone = vi.fn().mockResolvedValue();
  auth.enabled = true;
  auth.loading = false;
  auth.user = null;
});

afterEach(() => vi.useRealTimers());

describe("/coach access", () => {
  it("accounts off", () => {
    auth.enabled = false;
    renderPage();
    expect(screen.getByText("The AI Coach needs an account")).toBeTruthy();
    expect(api.checkAvailability).not.toHaveBeenCalled();
  });

  it("signed out", () => {
    renderPage();
    expect(screen.getByText("Sign in to talk to your coach")).toBeTruthy();
    expect(screen.queryByLabelText("Message the coach")).toBeNull();
  });

  it("clears one account's workspace when signing out, then loads after signing back in", async () => {
    signIn();
    const view = renderPage();
    expect(await screen.findByLabelText("Message the coach")).toBeTruthy();
    auth.user = null;
    view.rerender(<MemoryRouter><Coach /></MemoryRouter>);
    expect(screen.getByText("Sign in to talk to your coach")).toBeTruthy();
    signIn();
    view.rerender(<MemoryRouter><Coach /></MemoryRouter>);
    expect(await screen.findByLabelText("Message the coach")).toBeTruthy();
  });

  it("feature off", async () => {
    signIn();
    api.checkAvailability.mockResolvedValue({ available: false, reason: "feature_disabled" });
    renderPage();
    expect(await screen.findByText("The AI Coach isn't available yet")).toBeTruthy();
    expect(screen.queryByLabelText("Message the coach")).toBeNull();
  });

  it("availability error with retry", async () => {
    signIn();
    api.checkAvailability.mockRejectedValueOnce(new ApiError("Please sign in again.", 401));
    renderPage();
    expect(await screen.findByText("Sign in again to continue")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeTruthy();
  });

  it("times out a stalled availability check and retries", async () => {
    signIn();
    vi.useFakeTimers();
    api.checkAvailability.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(screen.getByText("Checking coach availability took too long. Check your connection and try again.")).toBeTruthy();
    api.checkAvailability.mockResolvedValueOnce({ available: true });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByLabelText("Message the coach")).toBeTruthy();
  });

  it("ends a sign-in check that never resolves", async () => {
    auth.loading = true;
    vi.useFakeTimers();
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(screen.getByText("Sign-in check is taking too long")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry sign in" })).toBeTruthy();
  });
});

describe("/coach chat", () => {
  it("shows the welcome with the roadmap's career and the privacy note", async () => {
    signIn();
    renderPage();
    expect(await screen.findByText(/knows your Data Analyst roadmap/)).toBeTruthy();
    expect(screen.getByText(/don't share personal details/)).toBeTruthy();
  });

  it("sends a message and shows the reply with a step button", async () => {
    signIn();
    api.send.mockResolvedValue(exchange());
    renderPage();
    await typeAndSend("What next?");
    expect(await screen.findByText("Start step 2.")).toBeTruthy();
    expect(api.send).toHaveBeenCalledWith(null, "What next?", expect.anything());
    expect(screen.getByRole("button", { name: "Open step 2: Python" })).toBeTruthy();
    expect(api.listThreads).toHaveBeenCalledTimes(2); // refreshed after the new thread
  });

  it("continues the same conversation", async () => {
    signIn();
    api.send.mockResolvedValueOnce(exchange()).mockResolvedValueOnce(exchange("Good.", [], "t1"));
    renderPage();
    await typeAndSend("What next?");
    await screen.findByText("Start step 2.");
    await typeAndSend("Thanks");
    await screen.findByText("Good.");
    expect(api.send.mock.calls[1][0]).toBe("t1");
  });

  it("starter prompts send right away", async () => {
    signIn();
    api.send.mockResolvedValue(exchange());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "What should I focus on this week?" }));
    await waitFor(() => expect(api.send).toHaveBeenCalledWith(null, "What should I focus on this week?", expect.anything()));
  });

  it("refuses contact details before sending", async () => {
    signIn();
    renderPage();
    await typeAndSend("my email is jane@example.com");
    expect(await screen.findByText(/remove email addresses/)).toBeTruthy();
    expect(api.send).not.toHaveBeenCalled();
  });

  it("keeps the draft and explains a failure", async () => {
    signIn();
    api.send.mockRejectedValue(new ApiError("internal", 502));
    renderPage();
    await typeAndSend("What next?");
    expect(await screen.findByText("The coach couldn't reply right now. Please try again.")).toBeTruthy();
    expect(screen.getByLabelText("Message the coach").value).toBe("What next?");
    expect(screen.queryByText("internal")).toBeNull();
  });

  it.each([
    [429, "You've sent a lot of messages in the last hour."],
    [422, "Please remove email addresses and phone numbers from your message."],
  ])("%i shows the server's message", async (status, message) => {
    signIn();
    api.send.mockRejectedValue(new ApiError(message, status));
    renderPage();
    await typeAndSend("hi");
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("409: offers a new conversation and blocks sending", async () => {
    signIn();
    api.send.mockRejectedValue(new ApiError("This conversation is long enough. Please start a new one.", 409));
    renderPage();
    await typeAndSend("hi");
    expect(await screen.findByRole("button", { name: "Start a new conversation" })).toBeTruthy();
    expect(screen.getByLabelText("Message the coach").disabled).toBe(true);
  });

  it("503 re-checks availability and follows a switched-off coach", async () => {
    signIn();
    api.send.mockRejectedValue(new ApiError("The AI Coach isn't available yet.", 503));
    renderPage();
    await screen.findByLabelText("Message the coach");
    api.checkAvailability.mockResolvedValue({ available: false, reason: "feature_disabled" });
    await typeAndSend("hi");
    expect(await screen.findByText("The AI Coach isn't available yet")).toBeTruthy();
  });
});

describe("/coach actions", () => {
  it("marks a step done only when the user clicks", async () => {
    signIn();
    api.send.mockResolvedValue(exchange("Well done!", [{ type: "mark_step_done", step: 2 }]));
    renderPage();
    await typeAndSend("I finished Python");
    const button = await screen.findByRole("button", { name: "Mark step 2 done" });
    expect(roadmap.setStepDone).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(roadmap.setStepDone).toHaveBeenCalledWith(1, true));
    expect(await screen.findByText("Step 2 marked done.")).toBeTruthy();
  });

  it("disables marking a step that is already done", async () => {
    signIn();
    api.send.mockResolvedValue(exchange("Nice", [{ type: "mark_step_done", step: 1 }]));
    renderPage();
    await typeAndSend("hi");
    expect((await screen.findByRole("button", { name: "Step 1 is done" })).disabled).toBe(true);
  });

  it("opens the dashboard step", async () => {
    signIn();
    api.send.mockResolvedValue(exchange());
    renderPage();
    await typeAndSend("What next?");
    fireEvent.click(await screen.findByRole("button", { name: "Open step 2: Python" }));
    expect(screen.getByTestId("where").textContent).toBe("/dashboard#step-2");
  });

  it("renders coach text as text (XSS)", async () => {
    signIn();
    api.send.mockResolvedValue(exchange("<img src=x onerror=alert(1)>", []));
    const { container } = renderPage();
    await typeAndSend("hi");
    await screen.findByText("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("/coach history", () => {
  it("times out a stalled conversation list and offers retry", async () => {
    signIn();
    vi.useFakeTimers();
    api.listThreads.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(screen.getByText("Loading your conversations took too long. Check your connection and try again.")).toBeTruthy();
    api.listThreads.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry conversations" }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("No conversations yet.")).toBeTruthy();
  });

  it("times out a conversation load and offers a retry", async () => {
    signIn();
    api.listThreads.mockResolvedValue([{ id: "t9", title: "Portfolio ideas", updatedAt: Date.now() }]);
    vi.useFakeTimers();
    api.loadMessages.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: /^Portfolio ideas/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(screen.getByText("Loading this conversation took too long. Check your connection and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("opens a saved conversation", async () => {
    signIn();
    api.listThreads.mockResolvedValue([{ id: "t9", title: "Portfolio ideas", updatedAt: Date.now() }]);
    api.loadMessages.mockResolvedValue([
      { id: "m1", role: "user", content: "Ideas?", actions: [] },
      { id: "m2", role: "assistant", content: "Build a dashboard.", actions: [] },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Portfolio ideas/ }));
    expect(await screen.findByText("Build a dashboard.")).toBeTruthy();
    expect(api.loadMessages).toHaveBeenCalledWith("t9");
  });

  it("deletes a conversation after confirmation", async () => {
    signIn();
    api.listThreads.mockResolvedValue([{ id: "t9", title: "Portfolio ideas", updatedAt: Date.now() }]);
    api.deleteThread.mockResolvedValue();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: 'Delete the conversation "Portfolio ideas"' }));
    const dialog = document.querySelector("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteThread).toHaveBeenCalledWith("t9"));
    expect(await screen.findByText("No conversations yet.")).toBeTruthy();
  });
});
