/* ==========================================================================
   charts.js — data visualization (Chart.js + a hand-drawn score ring).
   ========================================================================== */

const Charts = (() => {
  let radarChart = null, barChart = null, pieChart = null, progressChart = null;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** Hand-drawn circular score indicator (kept outside Chart.js for a crisp custom look) */
  function drawScoreRing(canvas, score) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.clientWidth || 220;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2, r = size / 2 - 14;
    const track = cssVar("--c-surface-3") || "#232c44";
    const amber = cssVar("--c-amber") || "#f2a65a";
    const teal = cssVar("--c-teal") || "#4fd1c5";

    ctx.lineWidth = 14;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = track;
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, teal);
    grad.addColorStop(1, amber);

    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * Utils.clamp(score, 0, 100)) / 100;

    let progress = 0;
    const animDuration = 900;
    const start = performance.now();
    function frame(now) {
      const t = Utils.clamp((now - start) / animDuration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const currentEnd = startAngle + (endAngle - startAngle) * eased;
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = track;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, currentEnd);
      ctx.strokeStyle = grad;
      ctx.stroke();
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function baseChartColors() {
    return {
      text: cssVar("--c-text") || "#eaeef7",
      muted: cssVar("--c-text-muted") || "#9aa5bf",
      border: cssVar("--c-border") || "rgba(255,255,255,0.09)",
      amber: cssVar("--c-amber") || "#f2a65a",
      teal: cssVar("--c-teal") || "#4fd1c5",
      surface: cssVar("--c-surface-2") || "#1a2236"
    };
  }

  function renderRadarChart(canvas, scores) {
    const c = baseChartColors();
    if (radarChart) radarChart.destroy();
    radarChart = new Chart(canvas, {
      type: "radar",
      data: {
        labels: ["Fluency", "Grammar", "Pronunciation", "Confidence", "Vocabulary"],
        datasets: [{
          label: "Score",
          data: [scores.fluency, scores.grammar, scores.pronunciation, scores.confidence, scores.vocabulary],
          backgroundColor: "rgba(79,209,197,0.18)",
          borderColor: c.teal,
          pointBackgroundColor: c.amber,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        scales: {
          r: {
            angleLines: { color: c.border }, grid: { color: c.border },
            pointLabels: { color: c.muted, font: { size: 11 } },
            ticks: { display: false, stepSize: 25 },
            suggestedMin: 0, suggestedMax: 100
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  function renderBarChart(canvas, scores) {
    const c = baseChartColors();
    if (barChart) barChart.destroy();
    barChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Fluency", "Grammar", "Pronunciation", "Confidence", "Vocabulary"],
        datasets: [{
          data: [scores.fluency, scores.grammar, scores.pronunciation, scores.confidence, scores.vocabulary],
          backgroundColor: [c.teal, c.amber, c.teal, c.amber, c.teal],
          borderRadius: 8,
          maxBarThickness: 38
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { color: c.muted }, grid: { color: c.border } },
          x: { ticks: { color: c.muted }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  function renderPieChart(canvas, totals) {
    const c = baseChartColors();
    if (pieChart) pieChart.destroy();
    const speaking = Math.max(1, totals.speakingSeconds || 0);
    const pausing = Math.max(0, totals.pauseSeconds || 0);
    const thinking = Math.max(0, totals.idleSeconds || 0);
    pieChart = new Chart(canvas, {
      type: "pie",
      data: {
        labels: ["Speaking", "Long pauses", "Silent / unused"],
        datasets: [{
          data: [speaking, pausing, thinking],
          backgroundColor: [c.teal, c.amber, c.surface],
          borderColor: "transparent"
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom", labels: { color: c.muted, font: { size: 12 } } } }
      }
    });
  }

  function renderProgressChart(canvas, sessions) {
    const c = baseChartColors();
    if (progressChart) progressChart.destroy();
    const labels = sessions.map(s => Utils.formatDate(s.date));
    const data = sessions.map(s => s.overall);
    progressChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data, borderColor: c.amber, backgroundColor: "rgba(242,166,90,0.15)",
          tension: 0.35, fill: true, pointBackgroundColor: c.teal, pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { color: c.muted }, grid: { color: c.border } },
          x: { ticks: { color: c.muted }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  return { drawScoreRing, renderRadarChart, renderBarChart, renderPieChart, renderProgressChart };
})();
