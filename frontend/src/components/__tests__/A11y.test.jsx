import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CareerCompareModal from "../CareerCompareModal";
import ShareModal from "../ShareModal";

vi.mock("../../lib/trackingEngine", () => ({
  trackEvent: vi.fn(), trackMetric: vi.fn(), startSession: vi.fn(), endSession: vi.fn(),
  EVENT_TYPES: {}, METRIC_NAMES: {},
}));
const { default: Quiz } = await import("../../pages/Quiz");

describe("modals use the accessible shared dialog", () => {
  const careers = [
    { title: "Data Analyst", reason: "Fits.", salary_range: "$60k", growth_rate: "+20%", skills: ["SQL"] },
    { title: "Web Developer", reason: "Also fits.", salary_range: "$70k", skills: ["JS"] },
  ];

  it("compare: a native dialog, AI estimates labelled, no N/A rows, Esc/close works", () => {
    const onClose = vi.fn();
    render(<CareerCompareModal isOpen onClose={onClose} selectedCareers={["Data Analyst", "Web Developer"]} careerData={careers} />);
    const dialog = document.querySelector("dialog");
    expect(dialog.open).toBe(true);
    expect(within(dialog).getAllByText("Salary range (AI estimate)")).toHaveLength(2);
    expect(dialog.textContent).not.toContain("N/A");
    expect(within(dialog).getAllByText("Job growth (AI estimate)")).toHaveLength(1); // only where the AI gave one
    fireEvent(dialog, new Event("close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("share: failures are shown inline, never with alert()", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("html2pdf.js", () => ({ default: () => { throw new Error("canvas"); } }));
    render(<ShareModal isOpen onClose={() => {}} selectedCareer="Data Analyst" />);
    fireEvent.click(screen.getByRole("button", { name: /Download as PDF/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
  });
});

describe("quiz focus management", () => {
  it("moves focus to the next question's heading after Continue", async () => {
    render(<MemoryRouter><Quiz /></MemoryRouter>);
    const first = screen.getByRole("heading", { level: 1 });
    const firstTitle = first.textContent;
    const option = within(screen.getByRole("group")).getAllByRole("button")[0];
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: /Continue|Next/ }));
    await waitFor(() => {
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).not.toBe(firstTitle);
      expect(document.activeElement).toBe(heading);
    });
  });
});
