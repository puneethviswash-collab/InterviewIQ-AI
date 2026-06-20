/* ==========================================================================
   utils.js — shared helpers used across modules.
   Everything here is intentionally framework-free and dependency-free.
   ========================================================================== */

const Utils = (() => {

  /** Format seconds as M:SS or MM:SS */
  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  /** Clamp a number between min/max */
  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /** Round to a fixed number of decimals, returned as a Number */
  function round(n, decimals = 0) {
    const f = 10 ** decimals;
    return Math.round(n * f) / f;
  }

  /** Pick a random item from an array */
  function sample(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** Shuffle a copy of an array (Fisher-Yates) */
  function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Simple id generator, good enough for local-only records */
  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Show a small toast notification in the corner of the screen */
  function toast(message, type = "info", duration = 3800) {
    const stack = document.getElementById("toastStack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = `toast${type !== "info" ? ` toast--${type}` : ""}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateX(16px)";
      setTimeout(() => el.remove(), 320);
    }, duration);
  }

  /** Whether we are in a secure context where getUserMedia / SpeechRecognition can work */
  function isSecureEnoughForMedia() {
    return window.isSecureContext === true;
  }

  /** Format a date for the history list, e.g. "Jun 18, 2026" */
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  /** Count occurrences of each word in an array of filler words within a transcript */
  function countFillers(text, fillerWords) {
    const lower = ` ${text.toLowerCase()} `;
    let total = 0;
    const breakdown = {};
    fillerWords.forEach((w) => {
      const re = new RegExp(`[^a-z]${w}[^a-z]`, "g");
      const matches = lower.match(re);
      const count = matches ? matches.length : 0;
      if (count > 0) breakdown[w] = count;
      total += count;
    });
    return { total, breakdown };
  }

  /** Split transcript text into words, stripping punctuation */
  function wordsOf(text) {
    return (text.match(/[a-zA-Z']+/g) || []);
  }

  return { formatTime, clamp, round, sample, shuffle, uid, toast, isSecureEnoughForMedia, formatDate, countFillers, wordsOf };
})();
