/* ==========================================================================
   app.js — main orchestration: navigation, setup state, camera/mic check,
   interview flow, results rendering, history screen, share + PDF export.
   ========================================================================== */

(() => {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Global state                                                        */
  /* ------------------------------------------------------------------ */
  const state = {
    setup: { duration: 300, type: "hr", topic: "random", company: "none" },
    resumeQuestions: [],
    resumeUsed: false,
    questions: [],
    askedQuestionTexts: new Set(),
    skippedQuestionTexts: new Set(),
    questionHistory: [],
    currentIndex: 0,
    answers: [],          // [{ text, confidences, pauseGaps, durationSeconds, questionDurationSeconds, volumeSamples }]
    questionStartedAt: null,
    answerStartedAt: null,
    volumeSamplesCurrent: [],
    interviewTimer: null,
    timerStarted: false,
    totalSeconds: 300,
    remainingSeconds: 300,
    lastReport: null,
    lastMeta: null,
    cameraGranted: false,
    micGranted: false
  };

  const el = (id) => document.getElementById(id);
  const normalizeQuestionText = (text) => (text || "").trim().toLowerCase();

  /* ------------------------------------------------------------------ */
  /* Theme toggle                                                        */
  /* ------------------------------------------------------------------ */
  function initTheme() {
    const saved = localStorage.getItem("onlineInterview.theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
    el("themeToggle").addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("onlineInterview.theme", next);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                          */
  /* ------------------------------------------------------------------ */
  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((s) => {
      s.classList.toggle("screen--active", s.dataset.screen === name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (name === "check") initCheckScreen();
    if (name === "history") initHistoryScreen();
    if (name !== "interview" && name !== "results") {
      cleanupInterviewRuntime();
    }
  }

  function initNav() {
    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        showScreen(btn.dataset.nav);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Decorative waveform bars (hero + live)                              */
  /* ------------------------------------------------------------------ */
  function initHeroWave() {
    const wrap = el("heroWave");
    if (!wrap) return;
    const bars = 28;
    for (let i = 0; i < bars; i++) {
      const span = document.createElement("span");
      const h = 40 + Math.round(Math.sin(i * 0.7) * 30 + Math.random() * 40);
      span.style.height = `${Utils.clamp(h, 20, 110)}px`;
      span.style.animationDelay = `${(i * 0.09).toFixed(2)}s`;
      wrap.appendChild(span);
    }
  }

  let liveWaveBars = [];
  function initLiveWave() {
    const wrap = el("liveWave");
    if (!wrap) return;
    wrap.innerHTML = "";
    liveWaveBars = [];
    const count = 28;
    for (let i = 0; i < count; i++) {
      const span = document.createElement("span");
      span.style.height = "6px";
      wrap.appendChild(span);
      liveWaveBars.push(span);
    }
  }

  function pushLiveWaveLevel(level) {
    if (!liveWaveBars.length) return;
    for (let i = 0; i < liveWaveBars.length - 1; i++) {
      liveWaveBars[i].style.height = liveWaveBars[i + 1].style.height;
    }
    const h = Utils.clamp(6 + level * 60, 6, 34);
    liveWaveBars[liveWaveBars.length - 1].style.height = `${h}px`;
  }

  /* ------------------------------------------------------------------ */
  /* SETUP SCREEN                                                        */
  /* ------------------------------------------------------------------ */
  function wireChoiceGroup(containerId, stateKey, onChange) {
    const group = el(containerId);
    if (!group) return;
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-value]");
      if (!btn || !group.contains(btn)) return;
      group.querySelectorAll("[role='radio']").forEach((b) => {
        b.classList.remove("is-selected");
        b.setAttribute("aria-checked", "false");
      });
      btn.classList.add("is-selected");
      btn.setAttribute("aria-checked", "true");
      state.setup[stateKey] = btn.dataset.value;
      if (onChange) onChange(btn.dataset.value);
    });
  }

  function initSetupScreen() {
    wireChoiceGroup("durationChoices", "duration", (v) => {
      state.setup.duration = parseInt(v, 10);
    });
    wireChoiceGroup("typeChoices", "type");
    wireChoiceGroup("topicChoices", "topic");
    wireChoiceGroup("companyChoices", "company");

    state.setup.duration = parseInt(state.setup.duration, 10) || 300;

    el("resumeBtn").addEventListener("click", () => el("resumeInput").click());
    el("resumeInput").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      el("resumeFilename").textContent = `Reading ${file.name}…`;
      try {
        const result = await Resume.readFile(file);
        state.resumeQuestions = Resume.buildQuestions();
        state.resumeUsed = true;
        el("resumeFilename").textContent = `${file.name} ✓`;
        const skillNote = result.skills.length ? ` Detected: ${result.skills.slice(0, 4).join(", ")}.` : "";
        Utils.toast(`Resume loaded — a few questions will reference it.${skillNote}`, "success", 4500);
      } catch (err) {
        el("resumeFilename").textContent = "No file selected";
        state.resumeUsed = false;
        Utils.toast(
          err && err.message === "unsupported-format"
            ? "Please upload a .txt or .pdf resume."
            : "Couldn't read that resume file — try a different one.",
          "error"
        );
      }
    });

    el("proceedToCheck").addEventListener("click", () => showScreen("check"));
  }

  /* ------------------------------------------------------------------ */
  /* CHECK SCREEN                                                        */
  /* ------------------------------------------------------------------ */
  function setStatus(itemEl, ok, label) {
    itemEl.classList.remove("is-ok", "is-error");
    itemEl.classList.add(ok ? "is-ok" : "is-error");
    const strong = itemEl.querySelector("strong");
    if (strong) strong.textContent = label;
  }

  function updateToggleBtn(btn, isOn, onLabel, offLabel) {
    btn.classList.toggle("is-on", isOn);
    btn.classList.toggle("is-off", !isOn);
    const svg = btn.querySelector("svg");
    btn.textContent = "";
    if (svg) btn.appendChild(svg);
    btn.appendChild(document.createTextNode(isOn ? onLabel : offLabel));
  }

  let checkScreenInitialized = false;

  async function initCheckScreen() {
    if (!Utils.isSecureEnoughForMedia()) {
      el("secureContextNote").hidden = false;
    }

    setStatus(el("statusSpeech"), Speech.isSupported(), Speech.isSupported() ? "Supported" : "Not supported in this browser");

    if (Media.hasStream()) {
      attachCheckScreenStream();
    } else {
      setStatus(el("statusCamera"), false, "Requesting…");
      setStatus(el("statusMic"), false, "Requesting…");
      const result = await Media.requestAccess();
      handleMediaResult(result);
    }

    if (!checkScreenInitialized) {
      el("toggleCamera").addEventListener("click", () => {
        const on = Media.toggleCamera();
        updateToggleBtn(el("toggleCamera"), on, "Camera on", "Camera off");
      });
      el("toggleMic").addEventListener("click", () => {
        const on = Media.toggleMic();
        updateToggleBtn(el("toggleMic"), on, "Microphone on", "Microphone off");
      });
      el("retryPermissions").addEventListener("click", async () => {
        Media.stopAll();
        setStatus(el("statusCamera"), false, "Requesting…");
        setStatus(el("statusMic"), false, "Requesting…");
        const r = await Media.requestAccess();
        handleMediaResult(r);
      });
      el("proceedToInterview").addEventListener("click", () => startInterview());
      el("skipPermissions").addEventListener("click", () => startInterview());
      checkScreenInitialized = true;
    }
  }

  function handleMediaResult(result) {
    state.cameraGranted = !!result.camera;
    state.micGranted = !!result.mic;

    if (result.error === "insecure-context") {
      setStatus(el("statusCamera"), false, "Blocked (insecure context)");
      setStatus(el("statusMic"), false, "Blocked (insecure context)");
      el("permissionNote").textContent = "This page must be served over https:// or http://localhost for camera/mic access.";
    } else if (result.error === "unsupported") {
      setStatus(el("statusCamera"), false, "Not supported in this browser");
      setStatus(el("statusMic"), false, "Not supported in this browser");
    } else {
      setStatus(el("statusCamera"), result.camera, result.camera ? "Connected" : "Not available");
      setStatus(el("statusMic"), result.mic, result.mic ? "Connected" : "Denied or unavailable");
      if (result.error === "camera-denied") {
        el("permissionNote").textContent = "Microphone connected. Camera access was denied, so video will stay off — speech analysis still works.";
      }
    }

    attachCheckScreenStream();
    el("proceedToInterview").disabled = !state.micGranted && !state.cameraGranted;
  }

  function attachCheckScreenStream() {
    if (!Media.hasStream()) return;
    Media.attachToVideo(el("previewVideo"));
    el("cameraPlaceholder").hidden = state.cameraGranted;
    updateToggleBtn(el("toggleCamera"), Media.getCameraEnabled(), "Camera on", "Camera off");
    updateToggleBtn(el("toggleMic"), Media.getMicEnabled(), "Microphone on", "Microphone off");

    Media.setLevelCallback((level) => {
      const badge = el("micLevelBadge");
      const dot = badge.querySelector(".mic-dot");
      const text = level > 0.06 ? "Mic active" : "Mic idle";
      dot.classList.toggle("is-live", level > 0.06);
      badge.lastChild.textContent = ` ${text}`;
    });
  }

  /* ------------------------------------------------------------------ */
  /* INTERVIEW SCREEN                                                    */
  /* ------------------------------------------------------------------ */
  const DURATION_TO_INITIAL_COUNT = { 60: 1, 120: 2, 300: 3, 600: 4 };

  function buildQuestionSet() {
    const count = DURATION_TO_INITIAL_COUNT[state.setup.duration] || 3;
    return Questions.buildSession({
      type: state.setup.type,
      topic: state.setup.topic,
      company: state.setup.company,
      duration: state.setup.duration,
      count,
      resumeQuestions: state.resumeUsed ? state.resumeQuestions : []
    });
  }

  function speakQuestion(text) {
    if (!("speechSynthesis" in window)) return false;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.98;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
      return true;
    } catch (e) {
      return false;
    }
  }

  function startInterview() {
    state.questions = buildQuestionSet();
    state.askedQuestionTexts = new Set();
    state.skippedQuestionTexts = new Set();
    state.questionHistory = [];
    state.currentIndex = 0;
    state.answers = [];
    state.answerStartedAt = null;
    state.timerStarted = false;
    state.totalSeconds = state.setup.duration;
    state.remainingSeconds = state.setup.duration;

    initLiveWave();
    Speech.setHandlers({ onUpdate: handleSpeechUpdate, onError: handleSpeechError, onEnd: () => {} });

    if (Media.hasStream()) {
      Media.setLevelCallback((level) => {
        state.volumeSamplesCurrent.push(level);
        pushLiveWaveLevel(level);
      });
      const interviewVideo = el("interviewVideo");
      Media.attachToVideo(interviewVideo);
      el("interviewCameraPlaceholder").hidden = state.cameraGranted;
      if (state.cameraGranted) {
        AdvancedVision.start(interviewVideo, handleVisionReading);
      }
    } else {
      el("interviewCameraPlaceholder").hidden = false;
    }

    showScreen("interview");
    updateTimerUI();
    loadQuestion(0);
  }

  function startInterviewTimer() {
    clearInterval(state.interviewTimer);
    updateTimerUI();
    state.interviewTimer = setInterval(() => {
      state.remainingSeconds -= 1;
      updateTimerUI();
      if (state.remainingSeconds <= 0) {
        clearInterval(state.interviewTimer);
        finalizeCurrentAnswer();
        finishInterview();
      }
    }, 1000);
  }

  function updateTimerUI() {
    el("timerDisplay").textContent = Utils.formatTime(Math.max(0, state.remainingSeconds));
    const pct = Utils.clamp(((state.totalSeconds - state.remainingSeconds) / state.totalSeconds) * 100, 0, 100);
    el("progressFill").style.width = `${pct}%`;
    el("timerDisplay").classList.toggle("is-low", state.remainingSeconds <= Math.max(10, state.totalSeconds * 0.1));
  }

  function loadQuestion(index) {
    if (!state.questions[index]) ensureQuestionAt(index);
    const q = state.questions[index];
    if (!q) {
      finishInterview();
      return;
    }
    const normalized = normalizeQuestionText(q.text);
    state.askedQuestionTexts.add(normalized);
    state.questionHistory.push({ text: q.text, difficulty: q.difficulty || "intermediate", source: q.source || "generated", at: new Date().toISOString() });
    state.questionStartedAt = Date.now();
    state.answerStartedAt = null;
    state.volumeSamplesCurrent = [];
    Speech.reset();

    el("questionMeta").textContent = q.topicLabel || "Interview";
    el("questionText").textContent = q.text;
    el("questionCounter").textContent = `Question ${index + 1}`;

    const transcriptText = el("transcriptText");
    transcriptText.innerHTML = '<span class="transcript-placeholder">Press "Start speaking" and answer the question out loud. Your words will appear here in real time.</span>';
    el("transcriptError").hidden = true;
    updateLiveStats({ wordCount: 0, fillerTotal: 0, pauseCount: 0, wpm: 0 });

    el("startListening").disabled = false;
    el("stopListening").disabled = true;
    el("liveWave").classList.remove("is-live");

    const next = state.questions[index + 1];
    el("nextQuestionPreview").textContent = next ? next.text : "This is your last question.";

    speakQuestion(q.text);
  }

  function handleSpeechUpdate({ finalTranscript, interimTranscript }) {
    const transcriptText = el("transcriptText");
    const full = (finalTranscript + " " + interimTranscript).trim();
    if (!full) {
      transcriptText.innerHTML = '<span class="transcript-placeholder">Listening…</span>';
    } else {
      transcriptText.textContent = full;
    }
    el("transcriptError").hidden = true;

    const words = Utils.wordsOf(full);
    const fillers = Utils.countFillers(full, Analysis.FILLER_WORDS);
    const elapsedSeconds = Math.max(1, (Date.now() - state.questionStartedAt) / 1000);
    const wpm = Utils.round((words.length / elapsedSeconds) * 60);
    const speechState = Speech.getState();
    updateLiveStats({
      wordCount: words.length,
      fillerTotal: fillers.total,
      pauseCount: speechState.pauseGaps.filter((g) => g > 1.5).length,
      wpm
    });
  }

  function handleSpeechError(errCode) {
    const errMsg = el("transcriptError");
    const messages = {
      "no-speech": "No speech detected — try speaking a little closer to the mic.",
      "audio-capture": "No microphone could be found.",
      "not-allowed": "Microphone access was blocked — allow it in your browser settings to use speech-to-text.",
      unsupported: "Speech recognition isn't supported in this browser. Try Chrome or Edge."
    };
    errMsg.textContent = messages[errCode] || "Speech recognition hit an error — you can try again.";
    errMsg.hidden = false;
    el("startListening").disabled = false;
    el("stopListening").disabled = true;
    el("liveWave").classList.remove("is-live");
    if (errCode === "unsupported" || errCode === "not-allowed") {
      Utils.toast(errMsg.textContent, "error", 5000);
    }
  }

  function updateLiveStats({ wordCount, fillerTotal, pauseCount, wpm }) {
    el("statWords").textContent = wordCount;
    el("statFillers").textContent = fillerTotal;
    el("statPauses").textContent = pauseCount;
    el("statWpm").textContent = wpm || 0;
  }

  function handleVisionReading(reading) {
    const tags = el("overlayTags");
    const hint = el("presenceHint");
    tags.innerHTML = "";

    if (!reading.faceDetected) {
      tags.innerHTML = '<span class="overlay-tag"><span class="dot" style="background:#e2664d"></span>No face detected</span>';
      hint.textContent = "On-camera read: make sure your face is in frame.";
      return;
    }

    if (reading.mode === "mediapipe") {
      const eyeTag = reading.eyeContact ? "Eye contact: good" : "Eye contact: look at the camera";
      const smileTag = reading.smiling ? "Smiling" : null;
      tags.innerHTML = `
        <span class="overlay-tag"><span class="dot" style="background:${reading.eyeContact ? "#4fd1c5" : "#e2664d"}"></span>${eyeTag}</span>
        ${smileTag ? `<span class="overlay-tag"><span class="dot" style="background:#f2a65a"></span>${smileTag}</span>` : ""}
      `;
      hint.textContent = `On-camera read: ${reading.posture}, ${reading.emotion}.`;
    } else {
      tags.innerHTML = '<span class="overlay-tag"><span class="dot" style="background:#4fd1c5"></span>Presence detected</span>';
      hint.textContent = `On-camera read (basic mode): ${reading.posture}. Detailed eye-contact/emotion needs the full vision model.`;
    }
  }

  function finalizeCurrentAnswer() {
    Speech.stop();
    if (!state.questions[state.currentIndex]) return;
    const s = Speech.getState();
    const questionDurationSeconds = Math.max(1, (Date.now() - state.questionStartedAt) / 1000);
    const answerDurationSeconds = s.elapsedMs > 0
      ? Math.max(1, s.elapsedMs / 1000)
      : (state.answerStartedAt ? Math.max(1, (Date.now() - state.answerStartedAt) / 1000) : 0);
    state.answers[state.currentIndex] = {
      question: state.questions[state.currentIndex].text,
      text: s.fullText,
      confidences: s.confidences,
      pauseGaps: s.pauseGaps,
      durationSeconds: answerDurationSeconds || questionDurationSeconds,
      questionDurationSeconds,
      volumeSamples: state.volumeSamplesCurrent.slice()
    };
    el("startListening").disabled = false;
    el("stopListening").disabled = true;
    el("liveWave").classList.remove("is-live");
  }

  function usedQuestionTexts(excludedIndex) {
    const reservedTexts = state.questions
      .map((q, i) => (i === excludedIndex || !q ? null : q.text))
      .filter(Boolean);
    return Array.from(new Set([
      ...Array.from(state.askedQuestionTexts),
      ...Array.from(state.skippedQuestionTexts),
      ...reservedTexts
    ]));
  }

  function buildAdaptiveQuestion(nextIndex, lastScore) {
    return Questions.nextByPerformance({
      type: state.setup.type,
      topic: state.setup.topic,
      company: state.setup.company,
      duration: state.setup.duration,
      resumeQuestions: state.resumeUsed ? state.resumeQuestions : [],
      usedTexts: usedQuestionTexts(nextIndex),
      lastScore: typeof lastScore === "number" ? lastScore : 0,
      nextIndex,
      totalCount: Math.max(state.questions.length, nextIndex + 1)
    });
  }

  function ensureQuestionAt(index, lastScore) {
    if (state.questions[index]) return true;
    const next = buildAdaptiveQuestion(index, lastScore);
    if (!next) return false;
    state.questions[index] = next;
    return true;
  }

  function adaptNextQuestionFromLastAnswer() {
    const currentAnswer = state.answers[state.currentIndex];
    const nextIndex = state.currentIndex + 1;
    if (!currentAnswer) return;
    const currentScore = Analysis.scoreAnswer(currentAnswer).scores.overall;
    const next = buildAdaptiveQuestion(nextIndex, currentScore);
    if (next && !state.askedQuestionTexts.has(normalizeQuestionText(next.text))) state.questions[nextIndex] = next;
  }

  function goToNextQuestion(options = {}) {
    const currentQuestion = state.questions[state.currentIndex];
    if (options.skipped && currentQuestion) {
      state.skippedQuestionTexts.add(normalizeQuestionText(currentQuestion.text));
    }
    finalizeCurrentAnswer();
    adaptNextQuestionFromLastAnswer();
    state.currentIndex += 1;
    if (!state.questions[state.currentIndex]) ensureQuestionAt(state.currentIndex);
    if (state.questions[state.currentIndex]) {
      loadQuestion(state.currentIndex);
    } else {
      clearInterval(state.interviewTimer);
      finishInterview();
    }
  }

  function initInterviewScreen() {
    el("startListening").addEventListener("click", () => {
      if (!Speech.isSupported()) {
        handleSpeechError("unsupported");
        return;
      }
      if (!state.timerStarted) {
        state.timerStarted = true;
        state.questionStartedAt = Date.now();
        startInterviewTimer();
      }
      state.answerStartedAt = Date.now();
      Speech.start();
      el("startListening").disabled = true;
      el("stopListening").disabled = false;
      el("liveWave").classList.add("is-live");
    });

    el("stopListening").addEventListener("click", () => {
      goToNextQuestion();
    });

    el("skipQuestionBtn").addEventListener("click", () => {
      Speech.stop();
      goToNextQuestion({ skipped: true });
    });

    el("repeatQuestionBtn").addEventListener("click", () => {
      const q = state.questions[state.currentIndex];
      if (!q) return;
      if (!speakQuestion(q.text)) {
        Utils.toast("Text-to-speech isn't supported in this browser — the question text is shown above.", "info");
      }
      el("questionText").textContent = q.text;
    });

    el("endInterviewBtn").addEventListener("click", () => {
      clearInterval(state.interviewTimer);
      finalizeCurrentAnswer();
      finishInterview();
    });
  }

  function cleanupInterviewRuntime() {
    clearInterval(state.interviewTimer);
    Speech.stop();
    AdvancedVision.stop();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  /* ------------------------------------------------------------------ */
  /* RESULTS SCREEN                                                      */
  /* ------------------------------------------------------------------ */
  function finishInterview() {
    cleanupInterviewRuntime();

    const answerRecords = state.answers.filter(Boolean);
    const basisRecords = answerRecords.length
      ? answerRecords
      : [{ question: "", text: "", confidences: [], pauseGaps: [], durationSeconds: 1, volumeSamples: [] }];
    const report = Analysis.scoreSession(basisRecords);
    state.lastReport = report;
    state.lastMeta = {
      typeLabel: Questions.TYPE_LABELS[state.setup.type],
      topicLabel: state.setup.topic === "random" ? "General" : Questions.TOPIC_LABELS[state.setup.topic],
      company: state.setup.company,
      durationSeconds: state.totalSeconds,
      date: new Date().toISOString()
    };

    renderResults(report, state.lastMeta, answerRecords);

    History.addSession({
      type: state.setup.type,
      typeLabel: state.lastMeta.typeLabel,
      topic: state.setup.topic,
      topicLabel: state.lastMeta.topicLabel,
      company: state.setup.company,
      durationSeconds: state.totalSeconds,
      overall: report.overall,
      scores: report.scores,
      strengths: report.strengths,
      weaknesses: report.weaknesses,
      suggestions: report.suggestions,
      transcriptAnalysis: answerRecords.map((a, i) => ({
        question: a.question,
        answer: a.text,
        analysisNotes: report.perAnswer[i] ? report.perAnswer[i].analysisNotes : [],
        scores: report.perAnswer[i] ? report.perAnswer[i].scores : null
      })),
      questionHistory: state.questionHistory,
      skippedQuestions: Array.from(state.skippedQuestionTexts)
    });

    showScreen("results");
  }

  function headlineForScore(score) {
    if (score >= 85) return "Excellent communication";
    if (score >= 70) return "Solid performance";
    if (score >= 55) return "Good foundation, room to grow";
    return "Worth another rep";
  }

  function summaryForScore(score) {
    if (score >= 85) return "You came across as fluent, clear and confident across most answers. Fine-tune the small details below to make it consistently great.";
    if (score >= 70) return "A solid pass overall — your fluency and grammar held up well. A few specific areas below are worth deliberate practice.";
    if (score >= 55) return "There's a real foundation here. Focus on the one or two weakest areas first rather than trying to fix everything at once.";
    return "Treat this as a baseline, not a verdict. Run through it again after working on the suggestions below — most people improve quickly with repetition.";
  }

  function renderResults(report, meta, answerRecords) {
    Charts.drawScoreRing(el("overallScoreRing"), report.overall);
    el("overallScoreValue").textContent = report.overall;

    el("resultsMeta").textContent = `${meta.typeLabel} · ${Utils.formatTime(meta.durationSeconds)}${meta.company !== "none" ? " · " + meta.company.toUpperCase() : ""}`;
    el("resultsHeadline").textContent = headlineForScore(report.overall);
    el("resultsSummary").textContent = summaryForScore(report.overall) + (report.usedEstimatePronunciation ? " Pronunciation is an estimate — your browser didn't return confidence data for some answers." : "");

    Charts.renderRadarChart(el("radarChart"), report.scores);
    Charts.renderBarChart(el("barChart"), report.scores);

    Charts.renderPieChart(el("pieChart"), {
      speakingSeconds: report.totals.speakingSeconds,
      pauseSeconds: report.totals.pauseSeconds,
      idleSeconds: report.totals.silentSeconds
    });

    fillList("strengthsList", report.strengths);
    fillList("weaknessesList", report.weaknesses);
    fillList("suggestionsList", report.suggestions);

    const transcriptList = el("fullTranscriptList");
    transcriptList.innerHTML = "";
    if (!answerRecords.length) {
      transcriptList.innerHTML = "<p>No answers were recorded for this session.</p>";
    } else {
      answerRecords.forEach((a, i) => {
        const scoredAnswer = report.perAnswer[i];
        const row = document.createElement("div");
        row.className = "transcript-review__item";
        const qLine = document.createElement("p");
        qLine.className = "transcript-review__q";
        qLine.innerHTML = `<strong>Q${i + 1}.</strong> `;
        qLine.appendChild(document.createTextNode(a.question || ""));
        const aLine = document.createElement("p");
        aLine.className = "transcript-review__a";
        if (a.text) {
          aLine.textContent = a.text;
        } else {
          const em = document.createElement("em");
          em.textContent = "No answer recorded.";
          aLine.appendChild(em);
        }
        row.appendChild(qLine);
        row.appendChild(aLine);
        if (scoredAnswer && scoredAnswer.analysisNotes && scoredAnswer.analysisNotes.length) {
          const details = document.createElement("ul");
          details.className = "transcript-review__analysis";
          scoredAnswer.analysisNotes.forEach((note) => {
            const li = document.createElement("li");
            li.textContent = note;
            details.appendChild(li);
          });
          row.appendChild(details);
        }
        transcriptList.appendChild(row);
      });
    }
  }

  function fillList(id, items) {
    const ul = el(id);
    ul.innerHTML = "";
    items.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    });
  }

  function initResultsScreen() {
    el("exportPdfBtn").addEventListener("click", () => {
      if (!state.lastReport) return;
      try {
        const qaPairs = state.answers.filter(Boolean).map((a) => ({ question: a.question, answerText: a.text }));
        PdfExport.exportReport(state.lastReport, state.lastMeta, qaPairs);
      } catch (e) {
        Utils.toast("Couldn't generate the PDF — the export library may not have loaded.", "error");
      }
    });

    el("shareScoreBtn").addEventListener("click", () => {
      if (!state.lastReport) return;
      const r = state.lastReport;
      const text = `I scored ${r.overall}/100 on an Online Interview practice session (${state.lastMeta.typeLabel}).\nFluency ${r.scores.fluency} · Grammar ${r.scores.grammar} · Pronunciation ${r.scores.pronunciation} · Confidence ${r.scores.confidence} · Vocabulary ${r.scores.vocabulary}`;
      el("shareText").value = text;
      openShareModal();
    });

    const shareModal = el("shareModal");
    const closeShareModal = () => { shareModal.hidden = true; };
    const openShareModal = () => { shareModal.hidden = false; };

    el("closeShareModal").addEventListener("click", closeShareModal);
    shareModal.addEventListener("click", (e) => {
      if (e.target === shareModal) closeShareModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !shareModal.hidden) closeShareModal();
    });

    el("copyShareText").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(el("shareText").value);
        Utils.toast("Copied to clipboard.", "success");
      } catch (e) {
        el("shareText").select();
        Utils.toast("Couldn't access the clipboard — text is selected, press Ctrl/Cmd+C.", "error");
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* HISTORY SCREEN                                                      */
  /* ------------------------------------------------------------------ */
  let historyScreenInitialized = false;

  function renderHistory() {
    const query = el("historySearch").value;
    const favOnly = el("historyFavFilter").value === "favorite";
    const sessions = History.search(query, favOnly);

    el("historyEmpty").hidden = sessions.length > 0;
    History.renderList(el("historyList"), sessions);

    const all = History.getAll();
    const card = el("progressChartCard");
    if (all.length > 1) {
      Charts.renderProgressChart(el("progressChart"), all.slice().reverse());
      card.hidden = false;
    } else {
      card.hidden = true;
    }
  }

  function initHistoryScreen() {
    renderHistory();
    if (historyScreenInitialized) return;
    historyScreenInitialized = true;

    el("historySearch").addEventListener("input", renderHistory);
    el("historyFavFilter").addEventListener("change", renderHistory);

    el("historyList").addEventListener("click", (e) => {
      const btn = e.target.closest(".fav-btn");
      if (!btn) return;
      const isFav = History.toggleFavorite(btn.dataset.id);
      btn.classList.toggle("is-fav", isFav);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initNav();
    initHeroWave();
    initSetupScreen();
    initInterviewScreen();
    initResultsScreen();
    if (!Utils.isSecureEnoughForMedia()) {
      const note = el("secureContextNote");
      if (note) note.hidden = false;
    }
  });
})();
