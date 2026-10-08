import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import StepNotes from "./StepNotes";
import { localRepository } from "../../lib/roadmaps/localRepository";

describe("StepNotes", () => {
  it("saves the note and the target date, only when something changed", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(<StepNotes index={2} value={{ note: "", targetDate: "" }} onSave={onSave} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Notes for this step"), { target: { value: "Read chapter 3" } });
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2026-10-20" } });
    fireEvent.click(save);
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(onSave).toHaveBeenCalledWith(2, { note: "Read chapter 3", targetDate: "2026-10-20" });
  });

  it("shows a failure", async () => {
    render(<StepNotes index={0} value={{ note: "x", targetDate: "" }} onSave={vi.fn().mockRejectedValue(new Error("Couldn't save that change. Please try again."))} />);
    fireEvent.change(screen.getByLabelText("Notes for this step"), { target: { value: "y" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Couldn't save that change. Please try again.")).toBeTruthy();
  });
});

describe("guest notes (localRepository)", () => {
  beforeEach(() => localStorage.clear());

  it("stores notes per roadmap in this browser and clears empty ones", async () => {
    const record = { id: "r1", roadmap: [{ title: "A" }, { title: "B" }] };
    let next = await localRepository.setStepNote(record, 1, { note: "  hello ", targetDate: "2026-10-20" });
    expect(next.notes).toEqual([{ note: "", targetDate: "" }, { note: "hello", targetDate: "2026-10-20" }]);
    next = await localRepository.setStepNote(record, 1, { note: "", targetDate: "" });
    expect(next.notes[1]).toEqual({ note: "", targetDate: "" });
    expect(localStorage.getItem("pathwayai_step_notes")).toBe("{}");
  });

  it("keeps only the current roadmap's notes and ignores corrupt storage", async () => {
    localStorage.setItem("pathwayai_step_notes", "{broken");
    const a = { id: "old", roadmap: [{ title: "A" }] };
    const b = { id: "new", roadmap: [{ title: "B" }] };
    await localRepository.setStepNote(a, 0, { note: "old note", targetDate: "" });
    await localRepository.setStepNote(b, 0, { note: "new note", targetDate: "" });
    expect(Object.keys(JSON.parse(localStorage.getItem("pathwayai_step_notes")))).toEqual(["new"]);
  });
});
