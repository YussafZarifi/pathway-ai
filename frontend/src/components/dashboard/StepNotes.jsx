import { useState } from "react";
import { NotebookPen } from "lucide-react";

const MAX_NOTE = 2000;

/**
 * A step's personal note and target date. Saved for the signed-in user's
 * account (RLS) or in this browser for guests; never sent to the AI except
 * the target date, which the AI Coach sees as part of the user's progress.
 */
export default function StepNotes({ index, value, onSave }) {
  const [note, setNote] = useState(value?.note || "");
  const [targetDate, setTargetDate] = useState(value?.targetDate || "");
  const [state, setState] = useState({ busy: false, text: "", error: false });
  const changed = note !== (value?.note || "") || targetDate !== (value?.targetDate || "");

  async function save(event) {
    event.preventDefault();
    setState({ busy: true, text: "", error: false });
    try {
      await onSave(index, { note, targetDate });
      setState({ busy: false, text: "Saved.", error: false });
    } catch (e) {
      setState({ busy: false, text: e?.message || "Couldn't save that note. Please try again.", error: true });
    }
  }

  const noteId = `step-note-${index}`;
  const dateId = `step-date-${index}`;
  return (
    <form className="stepDetailBlock stepNotes" onSubmit={save}>
      <h4 className="timelineTasksTitle">
        <NotebookPen size={14} aria-hidden="true" /> Your notes
      </h4>
      <label htmlFor={noteId} className="srOnly">Notes for this step</label>
      <textarea
        id={noteId}
        className="coachInput stepNoteInput"
        rows={3}
        maxLength={MAX_NOTE}
        placeholder="What you learned, links, questions for later…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="stepNoteRow">
        <label htmlFor={dateId} className="stepNoteDateLabel">Target date</label>
        <input
          id={dateId}
          type="date"
          className="textInput stepNoteDate"
          min="2020-01-01"
          max="2100-12-31"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
        <button type="submit" className="dashBtn" disabled={state.busy || !changed}>
          {state.busy ? "Saving…" : "Save"}
        </button>
      </div>
      {state.text && (
        <p className={state.error ? "dashError" : "coachNote"} role={state.error ? "alert" : "status"}>
          {state.text}
        </p>
      )}
    </form>
  );
}
