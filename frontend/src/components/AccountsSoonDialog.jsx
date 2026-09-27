import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// Shown by the Landing "Log in" / "Sign up" buttons until accounts exist
// (ROADMAP F-7). Uses the native <dialog> for focus trapping, Esc to close
// and focus return to the trigger.
export default function AccountsSoonDialog({ isOpen, onClose, onTakeQuiz }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  // Close when the backdrop (the dialog element itself) is clicked.
  const handleClick = (e) => {
    if (e.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="accountsDialog"
      aria-labelledby="accountsDialogTitle"
      aria-describedby="accountsDialogDesc"
      onClose={onClose}
      onClick={handleClick}
    >
      <div className="accountsDialogContent">
        <div className="accountsDialogHeader">
          <h2 id="accountsDialogTitle" className="accountsDialogTitle">
            Accounts are coming soon
          </h2>
          <button
            type="button"
            className="shareModalClose"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <p id="accountsDialogDesc" className="accountsDialogText">
          You don&apos;t need an account to use PathwayAI. Take the quiz and get
          your roadmap now, no sign-up required. Saving roadmaps across devices
          will arrive with accounts.
        </p>

        <div className="accountsDialogActions">
          <button type="button" className="ghostBtn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="uiverseBtn" onClick={onTakeQuiz}>
            Take the quiz
          </button>
        </div>
      </div>
    </dialog>
  );
}
