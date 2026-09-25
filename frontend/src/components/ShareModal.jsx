import { motion } from "framer-motion";
import { X, Download, Printer } from "lucide-react";

export default function ShareModal({ isOpen, onClose, selectedCareer }) {
  if (!isOpen) return null;

  const handleDownloadPdf = async () => {
    try {
      const { default: html2pdf } = await import("html2pdf.js");

      const element = document.querySelector(".resultsPage");
      const opt = {
        margin: 0.5,
        filename: `pathway-ai-${selectedCareer?.toLowerCase().replace(/\s+/g, "-")}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <motion.div
      className="shareModalOverlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="shareModalContent"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shareModalHeader">
          <h2 className="shareModalTitle">Save Your Results</h2>
          <button className="shareModalClose" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <div className="shareModalBody">
          <p className="shareModalSubtitle">
            Save a copy of your career matches.
          </p>

          <div className="shareOptions">
            <button className="shareOption" onClick={handleDownloadPdf}>
              <Download size={24} />
              <div>
                <h3 className="shareOptionTitle">Download as PDF</h3>
                <p className="shareOptionDesc">Save your complete roadmap as a PDF file</p>
              </div>
            </button>

            <button className="shareOption" onClick={handlePrint}>
              <Printer size={24} />
              <div>
                <h3 className="shareOptionTitle">Print</h3>
                <p className="shareOptionDesc">Open print dialog for physical copy</p>
              </div>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
