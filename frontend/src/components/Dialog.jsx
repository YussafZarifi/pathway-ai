import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// Accessible modal built on the native <dialog> (showModal): focus trap,
// Esc to close and focus return to the trigger come from the browser.
// Clicking the backdrop closes it.
export default function Dialog({ isOpen, onClose, title, children, actions, wide = false }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const handleClick = (e) => {
    if (e.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`appDialog ${wide ? "appDialog--wide" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={onClose}
      onClick={handleClick}
    >
      <div className="appDialogContent">
        <div className="appDialogHeader">
          <h2 id={titleId} className="appDialogTitle">
            {title}
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

        <div id={descId} className="appDialogText">
          {children}
        </div>

        {actions && <div className="appDialogActions">{actions}</div>}
      </div>
    </dialog>
  );
}
