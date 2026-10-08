import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ErrorBoundary from "../ErrorBoundary";
import AppFooter from "../AppFooter";

vi.mock("../../lib/authContext", () => ({ useAuth: () => ({ enabled: true, loading: false, user: null }) }));
const { default: Landing } = await import("../../pages/Landing");

function Boom() {
  throw new Error("secret data in the message");
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
}

describe("ErrorBoundary", () => {
  it("shows an honest fallback and logs only the error's name", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong on this page");
    const logged = spy.mock.calls.filter((c) => String(c[0]).startsWith("[PathwayAI]"));
    expect(logged).toEqual([["[PathwayAI] Page error:", "Error"]]);
    expect(JSON.stringify(logged)).not.toContain("secret data");
  });
});

describe("AppFooter", () => {
  it("credits the author and links to About", () => {
    render(<MemoryRouter><AppFooter /></MemoryRouter>);
    expect(screen.getByText(/Built by Yussaf Zarifi/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "GitHub" }).getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: "About" }).getAttribute("href")).toBe("/#about");
  });
});

describe("Landing", () => {
  function renderLanding() {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("feature cards are keyboard-reachable buttons to real pages (no 'coming soon')", () => {
    const { container } = renderLanding();
    expect(container.textContent).not.toMatch(/coming soon/i);
    fireEvent.click(screen.getByRole("button", { name: /AI Coach/ }));
    expect(screen.getByTestId("where").textContent).toBe("/coach");
  });

  it("explains how it works and has an About section", () => {
    renderLanding();
    expect(screen.getByRole("heading", { name: "How PathwayAI works" })).toBeTruthy();
    expect(document.getElementById("about")).toBeTruthy();
  });
});
