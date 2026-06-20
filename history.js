/* ==========================================================================
   history.js - interview history stored locally on this device.
   ========================================================================== */

const History = (() => {
  const STORAGE_KEY = "onlineInterview.sessions.v1";

  function getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn("Could not read history from localStorage", e);
      return [];
    }
  }

  function save(sessions) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      return true;
    } catch (e) {
      console.warn("Could not write history to localStorage (quota or privacy mode?)", e);
      return false;
    }
  }

  function addSession(record) {
    const sessions = getAll();
    const entry = {
      id: Utils.uid(),
      date: new Date().toISOString(),
      type: record.type,
      typeLabel: record.typeLabel,
      topic: record.topic,
      topicLabel: record.topicLabel,
      company: record.company,
      durationSeconds: record.durationSeconds,
      overall: record.overall,
      scores: record.scores,
      strengths: record.strengths || [],
      weaknesses: record.weaknesses || [],
      suggestions: record.suggestions || [],
      transcriptAnalysis: record.transcriptAnalysis || [],
      questionHistory: record.questionHistory || [],
      skippedQuestions: record.skippedQuestions || [],
      favorite: false
    };
    sessions.unshift(entry);
    save(sessions);
    return entry;
  }

  function toggleFavorite(id) {
    const sessions = getAll();
    const s = sessions.find(x => x.id === id);
    if (s) { s.favorite = !s.favorite; save(sessions); }
    return s ? s.favorite : false;
  }

  function deleteSession(id) {
    const sessions = getAll().filter(s => s.id !== id);
    save(sessions);
  }

  function search(query, favoritesOnly) {
    let sessions = getAll();
    if (favoritesOnly) sessions = sessions.filter(s => s.favorite);
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      sessions = sessions.filter(s =>
        (s.typeLabel || "").toLowerCase().includes(q) ||
        (s.topicLabel || "").toLowerCase().includes(q) ||
        (s.company || "").toLowerCase().includes(q)
      );
    }
    return sessions;
  }

  function renderList(container, sessions) {
    container.innerHTML = "";
    sessions.forEach(s => {
      const row = document.createElement("div");
      row.className = "history-row";
      row.innerHTML = `
        <div class="history-row__score">${s.overall}</div>
        <div class="history-row__info">
          <div class="history-row__title">${s.typeLabel || "Interview"} - ${s.topicLabel || "General"}${s.company && s.company !== "none" ? " - " + s.company.toUpperCase() : ""}</div>
          <div class="history-row__meta">${Utils.formatDate(s.date)} - ${Utils.formatTime(s.durationSeconds)} duration</div>
        </div>
        <div class="history-row__actions">
          <button class="fav-btn${s.favorite ? " is-fav" : ""}" data-id="${s.id}" title="Toggle favorite">?</button>
        </div>
      `;
      container.appendChild(row);
    });
  }

  return { getAll, addSession, toggleFavorite, deleteSession, search, renderList };
})();