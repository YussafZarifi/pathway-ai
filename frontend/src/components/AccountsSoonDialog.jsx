import Dialog from "./Dialog";

// Shown by the Landing "Log in" / "Sign up" buttons until accounts exist
// (ROADMAP F-7).
export default function AccountsSoonDialog({ isOpen, onClose, onTakeQuiz }) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Accounts are coming soon"
      actions={
        <>
          <button type="button" className="dashBtn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="dashBtn dashBtn--primary" onClick={onTakeQuiz}>
            Take the quiz
          </button>
        </>
      }
    >
      <p>
        You don&apos;t need an account to use PathwayAI. Take the quiz and get your
        roadmap now, no sign-up required. Saving roadmaps across devices will arrive
        with accounts.
      </p>
    </Dialog>
  );
}
