/* ============================================================
   YNWA — Liverpool live feed in Icelandic
   A self-contained experiment living at /ynwa on sportaclock.com.
   Touches nothing else: one file, two routes, no build step.

   HOW IT WORKS
   ESPN's soccer summary endpoint carries a full commentary array
   sourced from Stats Perform ("SA.ENVOY"), and every entry pairs
   the English prose with the structured fields behind it:

     type:         { type: "shot-on-target" }
     team:         { displayName: "AS Monaco" }
     clock:        { displayValue: "56'" }
     participants: [ shooter, assister ]

   So nothing here is translated. The Icelandic is generated from
   the structured fields through a lookup table, which means the
   grammar is right every time instead of being at the mercy of
   machine translation.

   Wiring in server.js — BEFORE the app.get("*") catch-all:
     import { ynwaApi, ynwaPage } from "./ynwa.js";
     app.get("/api/ynwa", ynwaApi);
     app.get("/ynwa", ynwaPage);
   ============================================================ */

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const LIVERPOOL = "364";

/* Liverpool's season spans several competitions and each has its own
   slug, so the fixture hunt checks all of them. */
const SLUGS = [
  "club.friendly",
  "eng.1",
  "uefa.champions",
  "eng.fa",
  "eng.league_cup",
  "uefa.europa",
  "uefa.super_cup",
  "fifa.cwc",
];

const FIXTURE_TTL = 5 * 60 * 1000;
const LIVE_TTL = 15 * 1000;   // while the ball is rolling
const IDLE_TTL = 5 * 60 * 1000; // before kickoff / after full time

let fixtureCache = { at: 0, data: null };
let feedCache = { at: 0, key: "", payload: null };

const yyyymmdd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ESPN responded ${r.status}`);
  return r.json();
}

/* ---------- find the match ---------- */
async function findMatch() {
  if (fixtureCache.data && Date.now() - fixtureCache.at < FIXTURE_TTL) {
    return fixtureCache.data;
  }
  const from = new Date(Date.now() - 36 * 3600 * 1000);
  const to = new Date(Date.now() + 21 * 24 * 3600 * 1000);
  const range = `${yyyymmdd(from)}-${yyyymmdd(to)}`;

  const found = [];
  for (const slug of SLUGS) {
    try {
      const data = await getJson(`${SITE}/${slug}/scoreboard?dates=${range}`);
      for (const ev of data.events || []) {
        const comp = (ev.competitions && ev.competitions[0]) || {};
        const teams = comp.competitors || [];
        if (!teams.some((c) => String(c.id) === LIVERPOOL)) continue;
        found.push({
          id: String(ev.id),
          slug,
          name: ev.name || ev.shortName,
          date: ev.date,
          state: (ev.status && ev.status.type && ev.status.type.state) || "pre",
          league: (data.leagues && data.leagues[0] && data.leagues[0].name) || slug,
        });
      }
    } catch { /* one dead slug shouldn't sink the hunt */ }
  }

  if (!found.length) throw new Error("Fann engan leik hjá Liverpool næstu 3 vikur");

  // a match in progress wins; otherwise the soonest one
  found.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const match = found.find((f) => f.state === "in") || found[0];
  fixtureCache = { at: Date.now(), data: match };
  return match;
}

/* ============================================================
   ICELANDIC
   One entry per ESPN event type. Names are left uninflected,
   which is how Icelandic football coverage handles foreign
   players anyway — so no case endings to get wrong.
   ============================================================ */
const TEAM_IS = {
  Liverpool: "Liverpool",
  "AS Monaco": "Monaco",
  "Manchester United": "Man Utd",
  "Manchester City": "Man City",
  "Newcastle United": "Newcastle",
  "Tottenham Hotspur": "Tottenham",
  "Nottingham Forest": "Forest",
  "Wolverhampton Wanderers": "Wolves",
};
const team = (ev) => {
  const n = (ev.team && ev.team.displayName) || "";
  return TEAM_IS[n] || n;
};
const who = (ev, i = 0) => {
  const p = (ev.participants || [])[i];
  return (p && p.athlete && p.athlete.displayName) || "";
};

// "Goal! Liverpool 1, Monaco 0. ..." → "1–0"
function scoreFrom(text) {
  const m = /^Goal!\s+.+?\s(\d+),\s+.+?\s(\d+)\./.exec(text || "");
  return m ? `${m[1]}–${m[2]}` : "";
}

// the keeper only exists in the prose, so lift it out when it's there
function keeperFrom(text) {
  const m = /saved(?:\s+in[^,]*?)?\s+by\s+([^(]+?)\s*\(/i.exec(text || "");
  return m ? m[1].trim() : "";
}

const TEMPLATES = {
  kickoff: () => "Leikurinn er hafinn.",
  halftime: () => "Hálfleikur.",
  "start-2nd-half": () => "Síðari hálfleikur hafinn.",
  "end-regular-time": () => "Venjulegum leiktíma lokið.",
  "end-2nd-half": () => "Leik lokið.",
  "full-time": () => "Leik lokið.",

  goal: (ev) => {
    const s = scoreFrom(ev.text);
    const a = who(ev, 1);
    return `MARK! ${who(ev)} (${team(ev)})${s ? ` — ${s}` : ""}.` +
      (a ? ` Stoðsending: ${a}.` : "");
  },
  "goal---header": (ev) => {
    const s = scoreFrom(ev.text);
    const a = who(ev, 1);
    return `MARK MEÐ SKALLA! ${who(ev)} (${team(ev)})${s ? ` — ${s}` : ""}.` +
      (a ? ` Stoðsending: ${a}.` : "");
  },
  "penalty---scored": (ev) => {
    const s = scoreFrom(ev.text);
    return `MARK ÚR VÍTASPYRNU! ${who(ev)} (${team(ev)})${s ? ` — ${s}` : ""}.`;
  },
  "penalty---missed": (ev) => `Víti klikkar — ${who(ev)} (${team(ev)}).`,
  "own-goal": (ev) => `SJÁLFSMARK — ${who(ev)} (${team(ev)}).`,

  "shot-on-target": (ev) => {
    const k = keeperFrom(ev.text);
    return `Skot á markið — ${who(ev)} (${team(ev)}).` +
      (k ? ` ${k} ver.` : " Markvörðurinn ver.");
  },
  "shot-off-target": (ev) => `Skot framhjá — ${who(ev)} (${team(ev)}).`,
  "shot-blocked": (ev) => `Skot í varnarmann — ${who(ev)} (${team(ev)}).`,
  "shot-woodwork": (ev) => `Í stöngina! ${who(ev)} (${team(ev)}).`,

  foul: (ev) => `Brot — ${who(ev)} (${team(ev)}).`,
  offside: (ev) => `Rangstaða — ${team(ev)}.`,
  "corner-awarded": (ev) => `Horn — ${team(ev)}.`,
  "yellow-card": (ev) => `Gult spjald — ${who(ev)} (${team(ev)}).`,
  "red-card": (ev) => `RAUTT SPJALD — ${who(ev)} (${team(ev)}).`,
  "second-yellow": (ev) => `Rautt spjald (annað gult) — ${who(ev)} (${team(ev)}).`,

  // participants are [kemur inn á, fer út af]
  substitution: (ev) =>
    `Skipting hjá ${team(ev)}: ${who(ev)} kemur inn á fyrir ${who(ev, 1)}.`,

  "start-delay": (ev) => `Töf á leiknum${team(ev) ? ` — ${team(ev)}` : ""}.`,
  "end-delay": () => "Leikur hefst að nýju.",
  var: (ev) => `VAR-skoðun — ${team(ev)}.`,
};

/* Lines with no event attached — ESPN writes these as plain prose.
   A few recur every match and are worth catching. */
const LOOSE = [
  [/^Lineups are announced/i, "Byrjunarliðin tilkynnt, leikmenn hita upp."],
  [/^Match ends,/i, "Leik lokið."],
  [/^Second Half begins/i, "Síðari hálfleikur hafinn."],
  [/^First Half begins/i, "Fyrri hálfleikur hafinn."],
  [/announced (\d+) minutes of added time/i, (m) =>
    `Uppbótartími: ${m[1]} mínútur.`],
];

function toIcelandic(entry) {
  const play = entry.play;
  if (play && play.type) {
    const fn = TEMPLATES[play.type.type];
    if (fn) return { is: fn(play), kind: play.type.type, known: true };
  }
  for (const [re, out] of LOOSE) {
    const m = re.exec(entry.text || "");
    if (m) return { is: typeof out === "function" ? out(m) : out, kind: "info", known: true };
  }
  // Nothing matched — show the English so a gap is visible rather than silent
  return { is: entry.text || "", kind: (play && play.type && play.type.type) || "annad", known: false };
}

/* ---------- build the feed ---------- */
function buildFeed(summary) {
  const seen = new Set();
  const out = [];

  for (const entry of summary.commentary || []) {
    // Fouls arrive as two entries sharing one play.id ("Foul by X" and
    // "Y wins a free kick"). Keep the first, drop the echo.
    const pid = entry.play && entry.play.id;
    if (pid) {
      if (seen.has(pid)) continue;
      seen.add(pid);
    }
    const { is, kind, known } = toIcelandic(entry);
    if (!is) continue;
    out.push({
      seq: entry.sequence,
      clock: (entry.time && entry.time.displayValue) || "",
      wallclock: (entry.play && entry.play.wallclock) || null,
      is,
      en: entry.text || "",
      kind,
      known,
      big: /^MARK|^RAUTT/.test(is),
    });
  }
  return out.reverse(); // newest first
}

function headerOf(summary) {
  const comp = (summary.header && summary.header.competitions && summary.header.competitions[0]) || {};
  const cs = comp.competitors || [];
  const side = (ha) => {
    const c = cs.find((x) => x.homeAway === ha) || {};
    return {
      name: (c.team && c.team.displayName) || "",
      short: (c.team && c.team.shortDisplayName) || "",
      logo: (c.team && c.team.logos && c.team.logos[0] && c.team.logos[0].href) || "",
      score: c.score != null ? String(c.score) : "",
      isLiverpool: String(c.id) === LIVERPOOL,
    };
  };
  const st = (comp.status && comp.status.type) || {};
  return {
    home: side("home"),
    away: side("away"),
    state: st.state || "pre",
    detail: st.detail || "",
    kickoff: comp.date || null,
    venue: (summary.gameInfo && summary.gameInfo.venue && summary.gameInfo.venue.fullName) || "",
    league: (summary.header && summary.header.league && summary.header.league.name) || "",
  };
}

/* ---------- routes ---------- */
export async function ynwaApi(req, res) {
  try {
    const forced = String(req.query.event || "").replace(/\D/g, "");
    const slugHint = String(req.query.slug || "");
    const match = forced
      ? { id: forced, slug: slugHint || "club.friendly", name: "", date: null, state: "" }
      : await findMatch();

    const cacheKey = match.id;
    const ttl = feedCache.payload && feedCache.payload.header
      && feedCache.payload.header.state === "in" ? LIVE_TTL : IDLE_TTL;
    if (feedCache.payload && feedCache.key === cacheKey && Date.now() - feedCache.at < ttl) {
      return res.json(feedCache.payload);
    }

    const summary = await getJson(`${SITE}/${match.slug}/summary?event=${match.id}`);
    const header = headerOf(summary);
    const feed = buildFeed(summary);

    /* How far behind real time is the feed? Every event carries the
       wall-clock moment it happened, so this is measurable rather than
       guessed. Only meaningful while the match is live. */
    let lagSec = null;
    const newest = feed.find((f) => f.wallclock);
    if (newest && header.state === "in") {
      lagSec = Math.round((Date.now() - Date.parse(newest.wallclock)) / 1000);
    }

    const payload = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      eventId: match.id,
      slug: match.slug,
      kickoffIso: header.kickoff,
      header,
      lagSec,
      untranslated: feed.filter((f) => !f.known).length,
      feed,
    };
    feedCache = { at: Date.now(), key: cacheKey, payload };
    res.json(payload);
  } catch (err) {
    console.error("[/api/ynwa]", err.message);
    res.json({ ok: false, reason: err.message });
  }
}

export function ynwaPage(req, res) {
  res.set("Content-Type", "text/html; charset=utf-8").send(PAGE);
}

/* ------------------------------------------------------------
   The page. Deliberately one static string with no build step,
   so this whole experiment is a single file that can be deleted
   in one commit, or lifted onto ynwa.is unchanged.
   ------------------------------------------------------------ */
const PAGE = `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>YNWA — Liverpool í beinni</title>
<meta name="description" content="Beint textalýsing frá leikjum Liverpool á íslensku." />
<meta name="theme-color" content="#0B0B0D" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
<style>
:root{
  --bg:#0B0B0D; --panel:#141417; --line:#242429; --line2:#33333A;
  --text:#F2F2F4; --muted:#A2A2AC; --dim:#74747E; --faint:#4A4A53;
  --red:#C8102E; --redbright:#FF2D48; --gold:#F6EB61;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  --sans:'Archivo',system-ui,-apple-system,sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);
  background-image:radial-gradient(ellipse 70% 40% at 50% -8%,rgba(200,16,46,.18),transparent 70%)}
.wrap{max-width:760px;margin:0 auto;padding:0 16px 72px}
a{color:inherit}

header{padding:26px 0 14px;border-bottom:1px solid var(--line2)}
.brand{display:flex;align-items:center;gap:11px}
.mark{width:20px;height:3px;background:var(--red);border-radius:1px}
.eyebrow{font-size:.66rem;letter-spacing:.26em;text-transform:uppercase;color:var(--muted);font-weight:700}
h1{font-weight:900;font-size:clamp(1.8rem,7vw,2.7rem);margin:9px 0 2px;letter-spacing:-.02em}
.tag{font-weight:700;font-size:.9rem;color:var(--muted)}
.tag b{color:var(--red)}

.score{margin-top:16px;padding:18px 16px;background:var(--panel);border:1px solid var(--line2);
  border-radius:12px;display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center}
.side{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.side img{width:44px;height:44px;object-fit:contain}
.side .nm{font-weight:700;font-size:.9rem}
.nums{font-family:var(--mono);font-weight:600;font-size:clamp(1.9rem,9vw,3rem);
  font-variant-numeric:tabular-nums;letter-spacing:.02em;white-space:nowrap}
.state{text-align:center;font-size:.64rem;letter-spacing:.18em;text-transform:uppercase;
  color:var(--muted);margin-top:6px}
.state.live{color:var(--redbright);font-weight:900;animation:pulse 1.6s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.meta{margin-top:10px;color:var(--dim);font-size:.76rem;text-align:center;line-height:1.6}

.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0 4px}
.btn{padding:6px 12px;border-radius:20px;font-size:.72rem;font-weight:600;cursor:pointer;
  background:transparent;border:1px solid var(--line2);color:var(--dim);font-family:inherit}
.btn:hover{color:var(--text)}
.btn.on{background:rgba(200,16,46,.14);border-color:var(--red);color:var(--text)}
.note{font-size:.7rem;color:var(--faint);margin-top:6px;line-height:1.6}

.feed{margin-top:14px;display:flex;flex-direction:column;gap:8px}
.row{display:grid;grid-template-columns:52px 1fr;gap:14px;padding:12px 14px;
  background:var(--panel);border:1px solid var(--line);border-left:3px solid transparent;
  border-radius:9px}
.row.big{border-left-color:var(--red);background:#1A1216}
.row.info{opacity:.72}
.row.unknown{border-left-color:var(--gold)}
.min{font-family:var(--mono);font-weight:600;font-size:1rem;color:var(--muted);
  font-variant-numeric:tabular-nums}
.txt{font-size:.95rem;line-height:1.5}
.row.big .txt{font-weight:700}
.en{margin-top:5px;font-size:.76rem;color:var(--faint);line-height:1.45;display:none}
body.show-en .en{display:block}
.kind{font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-top:4px}
.empty{padding:22px 16px;text-align:center;color:var(--dim);font-size:.9rem;line-height:1.6;
  background:var(--panel);border:1px solid var(--line);border-radius:10px}
footer{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);
  color:var(--faint);font-size:.68rem;line-height:1.7}
@media (max-width:520px){.row{grid-template-columns:44px 1fr;gap:10px}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><span class="mark"></span>
      <span class="eyebrow">Liverpool í beinni · á íslensku</span></div>
    <h1>YNWA</h1>
    <p class="tag">You'll <b>Never</b> Walk Alone</p>
  </header>

  <div id="score"></div>

  <div class="bar">
    <button class="btn" id="toggleEn">Sýna enska textann</button>
    <button class="btn" id="refresh">Uppfæra núna</button>
    <span class="note" id="status"></span>
  </div>
  <p class="note" id="diag"></p>

  <div class="feed" id="feed"></div>

  <footer>
    <p><strong>YNWA</strong> — tilraun. Lýsingin er búin til sjálfvirkt úr
    atburðaskrá ESPN (gögn frá Stats Perform) og þýdd með sniðmátum, ekki
    vélþýðingu — þess vegna er íslenskan alltaf málfræðilega rétt.</p>
    <p>Uppfærist sjálfkrafa á 20 sekúndna fresti meðan á leik stendur.</p>
  </footer>
</div>

<script>
const qs = new URLSearchParams(location.search);
const api = "/api/ynwa" + (qs.toString() ? "?" + qs.toString() : "");
let timer = null;

const fmtTime = (iso) => new Date(iso).toLocaleString("is-IS",
  { weekday:"long", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit" });

function stateLabel(h){
  if (h.state === "in") return { text:"í beinni · " + (h.detail||""), live:true };
  if (h.state === "post") return { text:"leik lokið", live:false };
  return { text:"hefst " + (h.kickoff ? fmtTime(h.kickoff) : "síðar"), live:false };
}

function render(d){
  const scoreEl = document.getElementById("score");
  const feedEl = document.getElementById("feed");
  const statusEl = document.getElementById("status");
  const diagEl = document.getElementById("diag");

  if (!d.ok){
    scoreEl.innerHTML = "";
    feedEl.innerHTML = '<div class="empty">Enginn leikur fannst.<br><span style="color:#4A4A53">'
      + (d.reason||"") + '</span></div>';
    return;
  }

  const h = d.header, s = stateLabel(h);
  const shown = h.state === "pre" ? "–" : (h.home.score || "0");
  const shown2 = h.state === "pre" ? "–" : (h.away.score || "0");
  scoreEl.innerHTML =
    '<div class="score">'
    + '<div class="side">' + (h.home.logo ? '<img src="'+h.home.logo+'" alt="">' : "")
      + '<span class="nm">'+h.home.short+'</span></div>'
    + '<div><div class="nums">'+shown+' – '+shown2+'</div>'
      + '<div class="state'+(s.live?" live":"")+'">'+s.text+'</div></div>'
    + '<div class="side">' + (h.away.logo ? '<img src="'+h.away.logo+'" alt="">' : "")
      + '<span class="nm">'+h.away.short+'</span></div>'
    + '</div>'
    + '<p class="meta">' + [h.league, h.venue].filter(Boolean).join(" · ") + '</p>';

  if (!d.feed.length){
    feedEl.innerHTML = '<div class="empty">Lýsingin byrjar þegar flautað er til leiks.'
      + '<br><span style="color:#4A4A53">Atburðir birtast hér sjálfkrafa.</span></div>';
  } else {
    feedEl.innerHTML = d.feed.map(function(f){
      const cls = "row" + (f.big?" big":"") + (f.kind==="info"?" info":"")
        + (f.known?"":" unknown");
      return '<div class="'+cls+'">'
        + '<div class="min">'+(f.clock||"")+'</div>'
        + '<div><div class="txt">'+esc(f.is)+'</div>'
        + (f.known ? "" : '<div class="kind">óþýtt: '+esc(f.kind)+'</div>')
        + '<div class="en">'+esc(f.en)+'</div></div></div>';
    }).join("");
  }

  const t = new Date(d.fetchedAt).toLocaleTimeString("is-IS");
  statusEl.textContent = "uppfært " + t;
  const bits = ["atburðir: " + d.feed.length];
  if (d.lagSec != null) bits.push("seinkun frá vellinum: ~" + d.lagSec + "s");
  if (d.untranslated) bits.push("óþýddar gerðir: " + d.untranslated);
  bits.push("leikur " + d.eventId + " (" + d.slug + ")");
  diagEl.textContent = bits.join("  ·  ");

  const live = h.state === "in";
  clearTimeout(timer);
  timer = setTimeout(load, live ? 20000 : 120000);
}

function esc(s){ return String(s==null?"":s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

async function load(){
  try{
    const r = await fetch(api, { cache:"no-store" });
    render(await r.json());
  } catch(e){
    document.getElementById("status").textContent = "tenging brást — reyni aftur";
    clearTimeout(timer); timer = setTimeout(load, 15000);
  }
}

document.getElementById("toggleEn").addEventListener("click", function(){
  document.body.classList.toggle("show-en");
  this.classList.toggle("on");
  this.textContent = document.body.classList.contains("show-en")
    ? "Fela enska textann" : "Sýna enska textann";
});
document.getElementById("refresh").addEventListener("click", load);
load();
</script>
</body>
</html>`;
