import html2pdf from "html2pdf.js";

export const exportToPdf = (element, filename = "pathway-ai-results.pdf") => {
  const opt = {
    margin: 0.5,
    filename: filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
  };

  return html2pdf().set(opt).from(element).save();
};

export const preparePrintStyles = () => {
  const style = document.createElement("style");
  style.textContent = `
    @media print {
      .topbar, .compareModalOverlay, .shareModalOverlay,
      .quizBottom, .resultsActions button:not(.print-only) {
        display: none !important;
      }

      .resultsPage {
        background: white !important;
        color: black !important;
      }

      .resultsCard {
        box-shadow: none !important;
        border: 1px solid #ccc !important;
      }

      .careerCard, .roadmapBox {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      body {
        background: white !important;
      }

      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `;
  document.head.appendChild(style);
  return () => document.head.removeChild(style);
};

export const removePrintStyles = preparePrintStyles;
