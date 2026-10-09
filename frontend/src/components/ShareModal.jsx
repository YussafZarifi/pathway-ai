import { useState } from "react";
import { Download, Printer } from "lucide-react";
import Dialog from "./Dialog";

// Save the results as a PDF or print them, in the shared accessible dialog
// (TD-20). Failures are shown inline, not with alert() (B-4).
export default function ShareModal({ isOpen, onClose, selectedCareer }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleDownloadPdf = async () => {
    setBusy(true);
    setError("");
    try {
      const { default: html2pdf } = await import("html2pdf.js");
      const element = document.querySelector(".resultsPage");
      const name = (selectedCareer || "results").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await html2pdf()
        .set({
          margin: 0.5,
          filename: `pathwayai-${name || "results"}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        })
        .from(element)
        .save();
    } catch (e) {
      console.error("[PathwayAI] PDF generation failed:", e?.name || "Error");
      setError("We couldn't create the PDF. Please try again, or use Print and choose \"Save as PDF\".");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Save your results">
      <p className="shareModalSubtitle">Save a copy of your career matches.</p>
      <div className="shareOptions">
        <button type="button" className="shareOption" onClick={handleDownloadPdf} disabled={busy}>
          <Download size={24} aria-hidden="true" />
          <span>
            <span className="shareOptionTitle">{busy ? "Creating the PDF…" : "Download as PDF"}</span>
            <span className="shareOptionDesc">Save your career matches as a PDF file</span>
          </span>
        </button>
        <button type="button" className="shareOption" onClick={() => window.print()}>
          <Printer size={24} aria-hidden="true" />
          <span>
            <span className="shareOptionTitle">Print</span>
            <span className="shareOptionDesc">Open the print dialog for a paper copy</span>
          </span>
        </button>
      </div>
      {error && (
        <p className="dashError" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
