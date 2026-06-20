# Online Interview — AI English Communication Practice

A browser-based interview rehearsal tool: pick a duration and question type,
talk to your camera/mic, and get a scored breakdown of fluency, grammar,
pronunciation, confidence, and vocabulary — with charts, history, and PDF export.

Everything runs **entirely client-side**. No server, no account, no data
leaves your browser. Interview history is saved in `localStorage` only.

## ⚠️ Run this over a local server — do not double-click index.html

Camera, microphone, and speech recognition only work in a **secure context**
(`https://` or `http://localhost`). Opening `index.html` directly via
`file://` will silently block these features in Chrome and most browsers.

From inside the project folder, run one of these, then open the printed URL:

```bash
# Python 3 (built into macOS/Linux, easy on Windows too)
python3 -m http.server 8000
# then open http://localhost:8000

# Node.js, if you have it
npx serve .

# VS Code
# Right-click index.html → "Open with Live Server"
```

## Browser support

| Feature | Best support |
|---|---|
| Camera / microphone preview | Chrome, Edge, Firefox, Safari (all modern) |
| Speech-to-text (Web Speech API) | Chrome, Edge (best). Limited/no support in Firefox & Safari — the app detects this and falls back to text-only practice with a clear notice. |
| Eye contact / smile / posture detection | Chrome, Edge, Firefox with WebGL. Falls back automatically to a basic motion-based presence detector if the full model can't load (offline, blocked CDN, unsupported browser) — it will never fabricate eye-contact or emotion readings it can't actually measure. |
| PDF export | Any modern browser (uses jsPDF) |

If a feature isn't supported, the app degrades gracefully and tells you why
in the UI rather than failing silently.

## Features

- **Setup** — choose duration (1/2/5/10 min), interview type (HR, Behavioral,
  Technical, General), topic category, and optional target company. Upload a
  resume (.txt or .pdf) to get 2–4 personalized questions.
- **Camera & mic check** — live preview, toggles, permission status, and a
  text-only fallback path if you'd rather skip video.
- **Interview** — countdown timer, live transcript via speech-to-text, live
  word/filler/pause/WPM stats, skip/repeat controls, and an on-camera presence
  panel (eye contact, smiling, posture) when the camera is on.
- **Scoring engine** — fully deterministic, not random: pace deviation from
  natural speaking rate, filler-word ratio, pause analysis, grammar pattern
  checks, vocabulary diversity (type-token ratio), and recognizer-confidence
  based pronunciation (clearly flagged as an estimate if unavailable).
- **Results** — overall score ring, radar + bar + pie charts (Chart.js),
  strengths/weaknesses/suggestions, full transcript review, PDF export, and
  a shareable text summary.
- **History** — every session saved locally with search, favorites, and a
  progress-over-time line chart.

## Project structure

```
index.html
css/style.css
js/
  utils.js       shared helpers (formatting, toasts, filler-word counting)
  questions.js   question banks + session builder
  media.js       camera/mic access, audio level metering
  speech.js      Web Speech API wrapper
  analysis.js    the scoring engine
  advanced.js    eye contact / smile / posture detection (MediaPipe + fallback)
  resume.js      resume parsing (.txt / .pdf) → personalized questions
  charts.js      all chart rendering (Chart.js + hand-drawn score ring)
  history.js     localStorage-backed session history
  pdfExport.js   results → downloadable PDF (jsPDF)
  app.js         screen navigation + orchestration of all the above
```

## Notes

- All third-party libraries (Chart.js, jsPDF, pdf.js, MediaPipe) load from
  public CDNs at runtime — an internet connection is needed the first time
  each page loads, even though no interview data is ever sent anywhere.
- This was built and reviewed carefully but not run against a live browser
  in this environment — if you hit a console error, it's worth a quick look
  at which CDN script failed to load before anything else.
