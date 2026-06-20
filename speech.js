/* ==========================================================================
   speech.js — Web Speech API wrapper.
   Tracks final transcript, interim transcript, recognizer confidence per
   utterance, and pause gaps (used later by the analysis engine).
   ========================================================================== */

const Speech = (() => {
  let recognition = null;
  let listening = false;

  let finalTranscript = "";
  let interimTranscript = "";
  let confidences = [];     // confidence value per finalized result
  let pauseGaps = [];       // seconds between consecutive finalized chunks
  let lastFinalAt = null;
  let speechStartedAt = null;
  let totalSpeechTime = 0;  // ms estimate of active speech (rough)

  let handlers = { onUpdate: null, onError: null, onEnd: null };

  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function create() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (event) => {
      interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          const now = Date.now();
          if (lastFinalAt !== null) {
            const gap = (now - lastFinalAt) / 1000;
            if (gap > 0.8) pauseGaps.push(gap);
          }
          lastFinalAt = now;
          finalTranscript += (finalTranscript ? " " : "") + text.trim();
          if (typeof result[0].confidence === "number" && result[0].confidence > 0) {
            confidences.push(result[0].confidence);
          }
        } else {
          interimTranscript += text;
        }
      }
      if (handlers.onUpdate) {
        handlers.onUpdate({ finalTranscript, interimTranscript });
      }
    };

    r.onerror = (event) => {
      if (handlers.onError) handlers.onError(event.error || "unknown-error");
    };

    r.onend = () => {
      listening = false;
      // Auto-restart while the user intends to keep listening (browsers
      // stop recognition after periods of silence).
      if (wantsListening) {
        try { r.start(); listening = true; } catch (e) { /* already starting */ }
      } else if (handlers.onEnd) {
        handlers.onEnd();
      }
    };

    return r;
  }

  let wantsListening = false;

  function start() {
    if (!isSupported()) {
      if (handlers.onError) handlers.onError("unsupported");
      return false;
    }
    if (!recognition) recognition = create();
    if (speechStartedAt === null) speechStartedAt = Date.now();
    wantsListening = true;
    try {
      recognition.start();
      listening = true;
      return true;
    } catch (e) {
      // start() throws if already started — treat as success
      listening = true;
      return true;
    }
  }

  function stop() {
    wantsListening = false;
    if (recognition && listening) {
      try { recognition.stop(); } catch (e) {}
    }
    listening = false;
  }

  function reset() {
    finalTranscript = "";
    interimTranscript = "";
    confidences = [];
    pauseGaps = [];
    lastFinalAt = null;
    speechStartedAt = null;
    totalSpeechTime = 0;
  }

  function getState() {
    return {
      finalTranscript,
      interimTranscript,
      fullText: (finalTranscript + " " + interimTranscript).trim(),
      confidences: confidences.slice(),
      pauseGaps: pauseGaps.slice(),
      elapsedMs: speechStartedAt ? Date.now() - speechStartedAt : 0
    };
  }

  function setHandlers(h) { handlers = { ...handlers, ...h }; }
  function isListening() { return listening; }

  return { isSupported, start, stop, reset, getState, setHandlers, isListening };
})();
