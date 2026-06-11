// ── sportaclock.js ────────────────────────────────────────────────────────────
// All times stored in UTC. Everything shown in the visitor's local time zone.

const GROUP_STAGE_END = new Date("2026-06-28T00:00:00Z");

// ── Helpers ───────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }

function timeUntil(utcString) {
  const diff = new Date(utcString) - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s, diff };
}

function localTime(utcString) {
  return new Date(utcString).toLocaleString(undefined, {
    weekday: "short",
    month:   "short",
    day:     "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
    timeZoneName: "short"
  });
}

function isFinished(utcString) {
  // Treat a match as finished 2 hours after kick-off
  return Date.now() > new Date(utcString).getTime() + 2 * 3600 * 1000;
}

function isKnockoutPhase() {
  return Date.now() >= GROUP_STAGE_END.getTime();
}

// ── Flag emoji from team name (simple lookup) ─────────────────────────────────
const FLAGS = {
  "Mexico": "🇲🇽", "South Africa": "🇿🇦", "Korea Republic": "🇰🇷", "Czechia": "🇨🇿",
  "Canada": "🇨🇦", "Bosnia & Herzegovina": "🇧🇦", "Switzerland": "🇨🇭", "Venezuela": "🇻🇪",
  "Brazil": "🇧🇷", "Haiti": "🇭🇹", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Morocco": "🇲🇦",
  "USA": "🇺🇸", "Paraguay": "🇵🇾", "Türkiye": "🇹🇷", "Australia": "🇦🇺",
  "Germany": "🇩🇪", "Côte d'Ivoire": "🇨🇮", "Japan": "🇯🇵", "Senegal": "🇸🇳",
  "Argentina": "🇦🇷", "Algeria": "🇩🇿", "France": "🇫🇷", "New Zealand": "🇳🇿",
  "Spain": "🇪🇸", "Nigeria": "🇳🇬", "Netherlands": "🇳🇱", "Uganda": "🇺🇬",
  "Portugal": "🇵🇹", "Congo DR": "🇨🇩", "Croatia": "🇭🇷", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Italy": "🇮🇹", "Ecuador": "🇪🇨", "Saudi Arabia": "🇸🇦",
  "Iran": "🇮🇷", "Cameroon": "🇨🇲", "Belgium": "🇧🇪", "Ukraine": "🇺🇦",
  "Colombia": "🇨🇴", "Uzbekistan": "🇺🇿",
  "Ghana": "🇬🇭", "Panama": "🇵🇦",
  "TBD": "❓"
};

function flag(team) { return FLAGS[team] || "🏳️"; }

// ── Find replay for a match ───────────────────────────────────────────────────
function getReplay(id) {
  return REPLAYS.find(r => r.id === id) || null;
}

// ── Build a single match card ─────────────────────────────────────────────────
function buildCard(match) {
  const finished  = isFinished(match.utc);
  const replay    = getReplay(match.id);
  const localStr  = localTime(match.utc);
  const countdown = timeUntil(match.utc);

  const card = document.createElement("div");
  card.className = "card" + (finished ? " card--finished" : "");
  card.dataset.id = match.id;

  // Stage badge
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = match.stage;
  card.appendChild(badge);

  // Teams row
  const teams = document.createElement("div");
  teams.className = "teams";
  teams.innerHTML = `
    <span class="team">${flag(match.home)} ${match.home}</span>
    <span class="vs">vs</span>
    <span class="team">${flag(match.away)} ${match.away}</span>
  `;
  card.appendChild(teams);

  // Venue + local time
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `📍 ${match.venue} · ${localStr}`;
  card.appendChild(meta);

  if (!finished) {
    // Countdown block
    const cdBlock = document.createElement("div");
    cdBlock.className = "countdown";
    cdBlock.dataset.utc = match.utc;
    if (countdown) {
      cdBlock.innerHTML = `
        <span class="cd-unit"><strong class="cd-d">${countdown.d}</strong><small>d</small></span>
        <span class="cd-unit"><strong class="cd-h">${pad(countdown.h)}</strong><small>h</small></span>
        <span class="cd-unit"><strong class="cd-m">${pad(countdown.m)}</strong><small>m</small></span>
        <span class="cd-unit"><strong class="cd-s">${pad(countdown.s)}</strong><small>s</small></span>
      `;
    } else {
      cdBlock.innerHTML = `<span class="live-pill">🔴 LIVE NOW</span>`;
    }
    card.appendChild(cdBlock);
  } else {
    // Finished – spoiler-free zone
    const spoilerWrap = document.createElement("div");
    spoilerWrap.className = "spoiler-wrap";

    if (replay) {
      spoilerWrap.innerHTML = `
        <button class="reveal-btn" onclick="revealReplay(this, ${match.id})">
          👁 Reveal &amp; Watch Replay
        </button>
        <a class="replay-link hidden" href="${replay.url}" target="_blank" rel="noopener">
          ▶ ${replay.label}
        </a>
      `;
    } else {
      spoilerWrap.innerHTML = `
        <button class="reveal-btn" onclick="revealReplay(this, ${match.id})">
          👁 Show Result
        </button>
        <span class="no-replay hidden">Replay not yet available</span>
      `;
    }
    card.appendChild(spoilerWrap);
  }

  return card;
}

// ── Reveal spoiler ────────────────────────────────────────────────────────────
function revealReplay(btn, id) {
  const wrap = btn.closest(".spoiler-wrap");
  btn.style.display = "none";
  const next = wrap.querySelector(".hidden");
  if (next) next.classList.remove("hidden");
}

// ── Render all matches ────────────────────────────────────────────────────────
function render() {
  const knockout = isKnockoutPhase();
  const allMatches = knockout
    ? [...MATCHES, ...KNOCKOUT_MATCHES]
    : MATCHES;

  // Group by stage
  const stages = {};
  allMatches.forEach(m => {
    if (!stages[m.stage]) stages[m.stage] = [];
    stages[m.stage].push(m);
  });

  const root = document.getElementById("matches-root");
  root.innerHTML = "";

  // Show a phase header if we've switched to knockout
  if (knockout) {
    const ph = document.createElement("div");
    ph.className = "phase-header knockout-phase";
    ph.textContent = "⚡ Knockout Stage";
    root.appendChild(ph);
  } else {
    const ph = document.createElement("div");
    ph.className = "phase-header";
    ph.textContent = "🏟 Group Stage";
    root.appendChild(ph);
  }

  Object.entries(stages).forEach(([stageName, matches]) => {
    const section = document.createElement("section");
    section.className = "stage-section";

    const h2 = document.createElement("h2");
    h2.className = "stage-title";
    h2.textContent = stageName;
    section.appendChild(h2);

    const grid = document.createElement("div");
    grid.className = "cards-grid";
    matches.forEach(m => grid.appendChild(buildCard(m)));
    section.appendChild(grid);
    root.appendChild(section);
  });
}

// ── Tick – update every countdown every second ────────────────────────────────
function tick() {
  document.querySelectorAll(".countdown[data-utc]").forEach(el => {
    const utc = el.dataset.utc;
    const t = timeUntil(utc);
    if (!t) {
      el.innerHTML = `<span class="live-pill">🔴 LIVE NOW</span>`;
      return;
    }
    const d = el.querySelector(".cd-d");
    const h = el.querySelector(".cd-h");
    const m = el.querySelector(".cd-m");
    const s = el.querySelector(".cd-s");
    if (d) d.textContent = t.d;
    if (h) h.textContent = pad(t.h);
    if (m) m.textContent = pad(t.m);
    if (s) s.textContent = pad(t.s);
  });
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function initFilter() {
  const input = document.getElementById("team-search");
  if (!input) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll(".card").forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = (!q || text.includes(q)) ? "" : "none";
    });
    document.querySelectorAll(".stage-section").forEach(sec => {
      const visible = [...sec.querySelectorAll(".card")].some(c => c.style.display !== "none");
      sec.style.display = visible ? "" : "none";
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  render();
  initFilter();
  setInterval(tick, 1000);
  // Re-render every 5 minutes to catch newly finished games
  setInterval(render, 5 * 60 * 1000);
});
