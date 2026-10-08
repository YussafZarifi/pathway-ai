import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../../lib/api";

const auth = { enabled: true, loading: false, user: null };
vi.mock("../../lib/authContext", () => ({ useAuth: () => auth }));

const repo = { history: vi.fn(), activate: vi.fn() };
vi.mock("../../lib/roadmaps", () => ({ accountRepository: repo }));

const { default: Roadmaps } = await import("../Roadmaps");

function item(id, career, status, done = 1, total = 3) {
  return {
    id, career, status, source: "generated", createdAt: Date.parse("2026-10-01T00:00:00Z"), done, total,
    record: {
      roadmap: Array.from({ length: total }, (_, i) => ({ id: `${id}-${i}`, title: `${career} step ${i + 1}` })),
      statuses: Array.from({ length: total }, (_, i) => ({ index: i, done: i < done })),
    },
  };
}

function renderPage() {
  return render(<MemoryRouter><Roadmaps /></MemoryRouter>);
}

beforeEach(() => {
  repo.history.mockReset();
  repo.activate.mockReset();
  auth.enabled = true;
  auth.loading = false;
  auth.user = { id: "u1", email: "u1@example.test" };
});

describe("/roadmaps", () => {
  it("guests are asked to sign in; nothing is loaded", () => {
    auth.user = null;
    renderPage();
    expect(screen.getByText("Sign in to keep a roadmap history")).toBeTruthy();
    expect(repo.history).not.toHaveBeenCalled();
  });

  it("accounts off: explains the single browser roadmap", () => {
    auth.enabled = false;
    renderPage();
    expect(screen.getByText("Your roadmap lives in this browser")).toBeTruthy();
  });

  it("lists current and archived roadmaps with progress", async () => {
    repo.history.mockResolvedValue([item("r2", "Data Analyst", "active", 1, 3), item("r1", "Web Developer", "archived", 3, 3)]);
    renderPage();
    expect(await screen.findByText("Data Analyst")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByRole("img", { name: "3 of 3 steps done" })).toBeTruthy();
  });

  it("shows an archived roadmap's steps read-only", async () => {
    repo.history.mockResolvedValue([item("r1", "Web Developer", "archived", 1, 2)]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "View steps" }));
    expect(screen.getByText("Web Developer step 1")).toBeTruthy();
    expect(screen.getByText("(done)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Mark/ })).toBeNull();
  });

  it("makes an archived roadmap current and reloads", async () => {
    repo.history
      .mockResolvedValueOnce([item("r2", "Data Analyst", "active"), item("r1", "Web Developer", "archived")])
      .mockResolvedValueOnce([item("r2", "Data Analyst", "archived"), item("r1", "Web Developer", "active")]);
    repo.activate.mockResolvedValue({});
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Make current" }));
    await waitFor(() => expect(repo.activate).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("Web Developer is your current roadmap again.")).toBeTruthy();
    expect(repo.history).toHaveBeenCalledTimes(2);
  });

  it("explains a failed switch", async () => {
    repo.history.mockResolvedValue([item("r2", "Data Analyst", "active"), item("r1", "Web Developer", "archived")]);
    repo.activate.mockRejectedValue(new ApiError("Too many requests. Please wait a minute and try again.", 429));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Make current" }));
    expect(await screen.findByText("Too many requests. Please wait a minute and try again.")).toBeTruthy();
  });

  it("load error with retry, and an empty state", async () => {
    repo.history.mockRejectedValueOnce(new ApiError("We couldn't load your saved roadmaps. Please try again.", 503)).mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByText("We couldn't load your saved roadmaps. Please try again.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No roadmaps yet")).toBeTruthy();
  });
});
