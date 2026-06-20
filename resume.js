/* ==========================================================================
   resume.js — resume upload, text extraction and personalized questions.
   Supports plain .txt directly, and .pdf via pdf.js (loaded from CDN).
   This is a lightweight keyword-based reader, not a full resume parser.
   ========================================================================== */

const Resume = (() => {

  const SKILL_KEYWORDS = [
    "javascript", "python", "java", "react", "node", "sql", "aws", "azure", "docker", "kubernetes",
    "machine learning", "data analysis", "project management", "communication", "leadership",
    "excel", "figma", "ui/ux", "marketing", "sales", "accounting", "c++", "c#", "typescript",
    "html", "css", "django", "flask", "tensorflow", "pandas", "salesforce", "seo", "agile", "scrum"
  ];

  const TITLE_PATTERNS = [
    /software (engineer|developer)/i, /data (analyst|scientist|engineer)/i, /product manager/i,
    /project manager/i, /business analyst/i, /marketing (manager|specialist)/i, /ux\/?ui designer/i,
    /sales (manager|executive|representative)/i, /financial analyst/i, /hr (manager|specialist)/i,
    /intern(ship)?/i, /teacher|educator/i, /accountant/i, /consultant/i
  ];

  let extractedText = "";
  let detectedSkills = [];
  let detectedTitle = null;

  async function readFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "txt") {
      extractedText = await file.text();
    } else if (ext === "pdf") {
      extractedText = await extractPdfText(file);
    } else {
      throw new Error("unsupported-format");
    }
    analyzeText(extractedText);
    return { text: extractedText, skills: detectedSkills, title: detectedTitle };
  }

  async function extractPdfText(file) {
    if (!window.pdfjsLib) throw new Error("pdfjs-unavailable");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    let text = "";
    const maxPages = Math.min(pdf.numPages, 6); // resumes are short; cap for performance
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(" ") + "\n";
    }
    return text;
  }

  function analyzeText(text) {
    const lower = text.toLowerCase();
    detectedSkills = SKILL_KEYWORDS.filter(skill => lower.includes(skill));
    detectedTitle = null;
    for (const pattern of TITLE_PATTERNS) {
      const m = text.match(pattern);
      if (m) { detectedTitle = m[0]; break; }
    }
  }

  /** Build 2-4 resume-aware questions from detected skills/title */
  function buildQuestions() {
    const qs = [];
    if (detectedTitle) {
      qs.push(`I see you have experience as a ${detectedTitle.toLowerCase()}. What's a project from that role you're most proud of?`);
    }
    Utils.shuffle(detectedSkills).slice(0, 3).forEach(skill => {
      qs.push(`Your resume mentions ${skill}. Can you walk me through a time you used it to solve a real problem?`);
    });
    if (qs.length === 0) {
      qs.push("Walk me through your resume and what you're hoping to do next.");
    }
    return qs;
  }

  function hasResume() { return extractedText.length > 0; }
  function getSkills() { return detectedSkills.slice(); }
  function getTitle() { return detectedTitle; }
  function clear() { extractedText = ""; detectedSkills = []; detectedTitle = null; }

  return { readFile, buildQuestions, hasResume, getSkills, getTitle, clear };
})();
