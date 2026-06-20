/* ==========================================================================
   pdfExport.js — turns a finished session report into a downloadable PDF
   using jsPDF (loaded from CDN as window.jspdf.jsPDF).
   ========================================================================== */

const PdfExport = (() => {

  function addWrappedText(doc, text, x, y, maxWidth, lineHeight) {
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((line) => {
      doc.text(line, x, y);
      y += lineHeight;
    });
    return y;
  }

  function addListSection(doc, title, items, x, y, maxWidth) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(title, x, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    items.forEach((item) => {
      y = addWrappedText(doc, `• ${item}`, x, y, maxWidth, 15);
      y += 2;
    });
    return y + 10;
  }

  /**
   * Export a completed session report to PDF and trigger a download.
   * @param {Object} report Result of Analysis.scoreSession(...)
   * @param {Object} meta { typeLabel, topicLabel, company, durationSeconds, date }
   * @param {Array} qaPairs [{ question, answerText }]
   */
  function exportReport(report, meta, qaPairs) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("jspdf-unavailable");
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 48;
    const maxWidth = pageWidth - margin * 2;
    let y = 56;

    // ---- Header ----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Online Interview — Results", margin, y);
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(110, 110, 110);
    const metaLine = `${meta.typeLabel || "Interview"} · ${meta.topicLabel || "General"}${meta.company && meta.company !== "none" ? " · " + meta.company.toUpperCase() : ""} · ${Utils.formatTime(meta.durationSeconds)} · ${Utils.formatDate(meta.date || new Date().toISOString())}`;
    y = addWrappedText(doc, metaLine, margin, y, maxWidth, 14);
    doc.setTextColor(20, 20, 20);
    y += 14;

    // ---- Overall score ----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    doc.text(`${report.overall}`, margin, y + 30);
    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.text("/ 100 overall", margin + 70, y + 30);
    y += 56;

    // ---- Individual scores ----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Individual scores", margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const scoreLines = [
      `Fluency: ${report.scores.fluency} / 100`,
      `Grammar: ${report.scores.grammar} / 100`,
      `Pronunciation: ${report.scores.pronunciation} / 100${report.usedEstimatePronunciation ? " (estimated)" : ""}`,
      `Confidence: ${report.scores.confidence} / 100`,
      `Vocabulary: ${report.scores.vocabulary} / 100`
    ];
    scoreLines.forEach((line) => {
      doc.text(line, margin, y);
      y += 16;
    });
    y += 10;

    // ---- Strengths / Weaknesses / Suggestions ----
    y = addListSection(doc, "Strengths", report.strengths, margin, y, maxWidth);
    if (y > 680) { doc.addPage(); y = 56; }
    y = addListSection(doc, "Weaknesses", report.weaknesses, margin, y, maxWidth);
    if (y > 680) { doc.addPage(); y = 56; }
    y = addListSection(doc, "Suggestions", report.suggestions, margin, y, maxWidth);

    // ---- Full transcript ----
    if (qaPairs && qaPairs.length) {
      doc.addPage();
      y = 56;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Full transcript", margin, y);
      y += 24;
      qaPairs.forEach((qa, i) => {
        if (y > 720) { doc.addPage(); y = 56; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        y = addWrappedText(doc, `Q${i + 1}. ${qa.question}`, margin, y, maxWidth, 15);
        y += 2;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        const answer = qa.answerText && qa.answerText.trim() ? qa.answerText.trim() : "(No answer recorded)";
        y = addWrappedText(doc, answer, margin, y, maxWidth, 14);
        doc.setTextColor(20, 20, 20);
        y += 16;
      });
    }

    doc.save(`online-interview-results-${Date.now()}.pdf`);
  }

  return { exportReport };
})();
