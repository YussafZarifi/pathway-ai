import { motion } from "framer-motion";
import { X, Download, Share2, Copy, Check } from "lucide-react";
import { useState } from "react";

export default function ShareModal({ isOpen, onClose, selectedCareer, roadmap, answers }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/share/${selectedCareer?.toLowerCase().replace(/\s+/g, "-")}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          <h2 className="shareModalTitle">Share Your Results</h2>
          <button className="shareModalClose" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="shareModalBody">
          <p className="shareModalSubtitle">
            Export your career roadmap or share it with others.
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
              <Share2 size={24} />
              <div>
                <h3 className="shareOptionTitle">Print</h3>
                <p className="shareOptionDesc">Open print dialog for physical copy</p>
              </div>
            </button>

            <button className="shareOption" onClick={handleCopyLink}>
              {copied ? <Check size={24} /> : <Copy size={24} />}
              <div>
                <h3 className="shareOptionTitle">Copy Link</h3>
                <p className="shareOptionDesc">
                  {copied ? "Link copied!" : "Copy shareable link (requires account)"}
                </p>
              </div>
            </button>
          </div>

          {!copied && (
            <div className="shareAuthNote">
              <p className="shareAuthNoteText">
                💡 Create a free account to save and access your results anytime.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
