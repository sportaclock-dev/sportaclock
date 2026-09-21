import {
  TEAMS, DIVISIONS, divisionOf, shortWhen, longWhen, weekLabel, weekKey,
  POSITIONS, ROSTER_GROUPS, KEY_PLAYERS, GLOSSARY,
} from "./content.js";
import { videoFor, searchUrl } from "./data.js";
/* ============================================================
   NFL á íslensku — HTML.

   Rendered on the server, so the page works before (and without)
   any JavaScript. EVERY value that came from outside this file goes
   through esc(), including ones that look safe: team names come from
   our own table today, but that is not a promise about tomorrow.
   Colours from ESPN are validated as 6-digit hex in data.js before
   they can reach a style attribute.
   ============================================================ */

export const BASE = "/nfl";
const V = "3"; // bump to bust the CSS/JS cache

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Icelandic number agreement: 1, 21, 31… take the singular, 11 doesn't.
export function count(n, one, many) {
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : many}`;
}

const teamHref = (ab) => `${BASE}/lid/${ab.toLowerCase()}`;
const weekHref = (type, week) => `${BASE}/leikir?vika=${weekKey(type, week)}`;

const ICON = {
  chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/></svg>',
  bigPlay: '<svg width="46" height="46" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l12 7-12 7z" fill="#FFFFFF"/></svg>',
  clock: '<svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#FFC629" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

function logo(meta, ab, size = 28) {
  const src = meta?.[ab]?.logo;
  if (!src) return "";
  return `<img class="logo" src="${esc(src)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
}

/* ---------- page shell ---------- */
function layout({ title, description, active, ticker, body }) {
  const nav = [
    ["byrja", `${BASE}#byrja`, "Byrja hér"],
    ["leikir", `${BASE}/leikir`, "Leikir"],
    ["lid", `${BASE}/lid`, "Lið"],
    ["ordabok", `${BASE}/ordabok`, "Orðabók"],
  ].map(([id, href, label]) =>
    `<a href="${href}"${active === id ? ' aria-current="page"' : ""}>${label}</a>`).join("");

  return `<!doctype html>
<html lang="is" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0B1B3F">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Big+Shoulders+Display:wght@700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${BASE}/static/nfl.css?v=${V}">
<script src="${BASE}/static/nfl.js?v=${V}" defer></script>
</head>
<body>
<a class="skip" href="#efni">Beint í efnið</a>
${ticker || ""}
<header class="bar">
  <a class="brand" href="${BASE}"><span class="brand-word">sportaclock</span><span class="tag tag-red brand-nfl">NFL</span></a>
  <nav aria-label="Aðalvalmynd">${nav}</nav>
</header>
<main id="efni">
${body}
</main>
<footer class="foot">
  <a class="brand" href="${BASE}"><span class="brand-word">sportaclock</span><span class="tag tag-red brand-nfl">NFL</span></a>
  <p>Sportaclock NFL er óháð aðdáendasíða og tengist ekki NFL eða neinu liði deildarinnar. Öll nöfn og vörumerki eru eign eigenda sinna. Highlights eru myndbönd af YouTube-rás NFL. Allir tímar eru að íslenskum tíma.</p>
</footer>
</body>
</html>`;
}

/* ---------- small pieces ---------- */
function ticker(games, current) {
  if (!current) return "";
  const done = games.filter((g) => g.type === current.type && g.week === current.week && g.state !== "pre");
  if (!done.length) return "";
  const items = done.map((g) =>
    `<li${g.state === "in" ? ' class="live"' : ""}>${esc(g.away.ab)} ${esc(g.away.score)} – ${esc(g.home.ab)} ${esc(g.home.score)}</li>`).join("");
  return `<div class="ticker" aria-label="Úrslit vikunnar">
  <span class="tag tag-gold">${esc(weekLabel(current.type, current.week))}</span>
  <ul>${items}</ul>
</div>`;
}

function countdownBoxes(iso) {
  const cell = (u, label) =>
    `<div class="cd-cell"><span class="cd-num" data-u="${u}">–</span><span class="cd-label">${label}</span></div>`;
  return `<div class="countdown" data-countdown="${esc(iso)}" role="timer" aria-label="Tími þar til leikurinn hefst">
  ${cell("d", "dagar")}${cell("h", "klst")}${cell("m", "mín")}${cell("s", "sek")}
</div>`;
}

function nextGameCard(g, { dark = false } = {}) {
  if (!g) return "";
  const vs = g.neutral ? "gegn" : "@";
  return `<div class="card next${dark ? " next-dark" : ""}">
  <div class="next-head">
    <span class="tag tag-gold">Næsti leikur</span>
    <span class="muted">${esc(weekLabel(g.type, g.week))}</span>
  </div>
  <div class="next-teams">
    <a href="${teamHref(g.away.ab)}"><span class="big-ab">${esc(g.away.ab)}</span><span class="muted">${esc(TEAMS[g.away.ab].name)}</span></a>
    <span class="at">${vs}</span>
    <a class="right" href="${teamHref(g.home.ab)}"><span class="big-ab">${esc(g.home.ab)}</span><span class="muted">${esc(TEAMS[g.home.ab].name)}</span></a>
  </div>
  <p class="when">${esc(longWhen(g.date))}</p>
  ${countdownBoxes(g.date)}
</div>`;
}

/* ---------- games ---------- */
function gameRow(g, playingId) {
  const vid = videoFor(g);
  const side = (s, won) =>
    `<div class="gr-team${g.state === "post" && !won ? " lost" : ""}">
      <a class="gr-ab" href="${teamHref(s.ab)}">${esc(s.ab)}</a>
      <span class="gr-name">${esc(TEAMS[s.ab].name)}</span>
      <span class="gr-score" data-score="${s === g.home ? "h" : "a"}">${s.score == null ? "" : esc(s.score)}</span>
    </div>`;
  const aw = g.away.score > g.home.score, hw = g.home.score > g.away.score;

  let status;
  if (g.state === "in") {
    status = `<span class="tag tag-gold live-tag"><span class="dot"></span>Í beinni</span>
      <span class="gr-meta" data-detail>${esc(g.detail)}</span>`;
  } else if (g.state === "post") {
    status = vid
      ? `<button type="button" class="btn btn-red btn-sm" data-video="${esc(vid)}" data-title="${esc(`${TEAMS[g.away.ab].name} @ ${TEAMS[g.home.ab].name}`)}"${vid === playingId ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${ICON.play}Highlights</button>`
      : `<a class="btn btn-red btn-sm" href="${esc(searchUrl(g))}" target="_blank" rel="noopener">${ICON.play}Highlights</a>`;
    status += `<span class="gr-meta">Lokið · ${esc(shortWhen(g.date))}</span>`;
  } else {
    status = `<span class="gr-meta">Fram undan</span><span class="gr-when">${esc(shortWhen(g.date))}</span>`;
  }
  return `<li class="game" data-game="${esc(g.id)}" data-state="${esc(g.state)}">
    <div class="gr-teams">${side(g.away, aw)}${side(g.home, hw)}</div>
    <div class="gr-status">${status}</div>
  </li>`;
}

function player(featured) {
  if (!featured) {
    return `<div class="player player-empty">${ICON.clock}<p class="player-empty-title">Highlights koma eftir leikina</p>
      <p class="muted">Myndböndin birtast hér þegar leikjunum er lokið og NFL hefur sett þau á YouTube.</p></div>`;
  }
  const { g, vid } = featured;
  const title = `${TEAMS[g.away.ab].name} @ ${TEAMS[g.home.ab].name}`;
  // A thumbnail that becomes the real player on click: no YouTube
  // iframe (or its cookies) until someone actually wants the video.
  // Without JavaScript it's a plain link to YouTube.
  return `<div class="player" data-player>
    <a class="player-facade" href="https://www.youtube.com/watch?v=${esc(vid)}" target="_blank" rel="noopener" data-video="${esc(vid)}" data-title="${esc(title)}">
      <img src="https://i.ytimg.com/vi/${esc(vid)}/hqdefault.jpg" alt="" loading="lazy">
      <span class="tag tag-gold player-tag">Highlights</span>
      <span class="play-circle">${ICON.bigPlay}</span>
      <span class="player-caption"><span data-player-title>${esc(title)}</span><span class="gold">${esc(g.away.score)}–${esc(g.home.score)}</span></span>
    </a>
  </div>`;
}

export function gamesSection({ games, current, type, week, heading = "Leikir og highlights", h = "h2" }) {
  const list = games.filter((g) => g.type === type && g.week === week);
  const withVideo = list.filter((g) => videoFor(g)).map((g) => ({ g, vid: videoFor(g) }));
  const featured = withVideo[withVideo.length - 1] || null;

  // Week tabs: every regular-season week, plus playoff rounds once they exist.
  const weeks = [];
  for (let w = 1; w <= 18; w++) weeks.push([2, w]);
  for (const w of [1, 2, 3, 5]) if (games.some((g) => g.type === 3 && g.week === w)) weeks.push([3, w]);
  const tabs = weeks.map(([t, w]) => {
    const on = t === type && w === week;
    const now = current && t === current.type && w === current.week;
    return `<a class="wk${on ? " on" : ""}${now ? " now" : ""}" href="${weekHref(t, w)}#leikir"${on ? ' aria-current="true"' : ""}>${esc(weekLabel(t, w))}</a>`;
  }).join("");

  const live = list.some((g) => g.state === "in");
  return `<section id="leikir" class="band band-dark">
  <div class="wrap">
    <${h} class="display">${esc(heading)}</${h}>
    <p class="lede-dark">Allir tímar eru að íslenskum tíma. Smelltu á Highlights á leik til að spila hann hér.</p>
    <div class="feature">
      ${player(featured)}
      <div class="feature-side">
        ${featured
          ? `<span class="tag tag-red">Spilar núna</span>
             <p class="feature-title" data-player-title>${esc(`${TEAMS[featured.g.away.ab].name} @ ${TEAMS[featured.g.home.ab].name}`)}</p>
             <p class="muted-dark">Veldu annan leik hér fyrir neðan til að skipta um myndband.</p>`
          : `<span class="tag tag-gold">Fram undan</span>
             <p class="muted-dark">Veldu viku sem er búin til að sjá leiki sem þegar hafa verið spilaðir.</p>`}
      </div>
    </div>
    <nav class="weeks" aria-label="Vikur">${tabs}</nav>
    ${list.length
      ? `<ul class="games" data-week="${esc(weekKey(type, week))}"${live ? " data-live" : ""}>${list.map((g) => gameRow(g, featured?.vid)).join("")}</ul>`
      : `<p class="muted-dark">Engir leikir skráðir í þessari viku enn.</p>`}
  </div>
</section>`;
}

/* ---------- divisions ---------- */
function divisionTables(meta, standings) {
  const conf = (c, cls, full) => {
    const divs = DIVISIONS.filter((d) => d.conf === c).map((d) => {
      const teams = [...d.teams].sort((a, b) => (standings?.[a]?.seed ?? 99) - (standings?.[b]?.seed ?? 99));
      const rows = teams.map((ab) => {
        const s = standings?.[ab];
        const rec = s ? `${s.wins}–${s.losses}${s.ties ? `–${s.ties}` : ""}` : "";
        return `<li><a href="${teamHref(ab)}">${logo(meta, ab, 28)}<span class="dt-name">${esc(TEAMS[ab].name)}</span><span class="dt-rec">${esc(rec)}</span>${ICON.chevron}</a></li>`;
      }).join("");
      return `<div class="div-card"><h4 class="div-head ${cls}">${esc(d.name)}</h4><ul>${rows}</ul></div>`;
    }).join("");
    return `<div class="conf">
      <div class="conf-head"><span class="tag ${cls} tag-xl">${c}</span><span class="muted">${full}</span></div>
      <div class="div-grid">${divs}</div>
    </div>`;
  };
  return conf("AFC", "tag-blue", "American Football Conference") + conf("NFC", "tag-red", "National Football Conference");
}

function teamsSection(meta, standings, h = "h2") {
  return `<section id="lid" class="band">
  <div class="wrap">
    <div class="section-head">
      <${h} class="display">32 lið. 8 riðlar.</${h}>
      <p class="muted">Veldu lið til að sjá leikmannahópinn, leikina og highlights. Tölurnar eru sigrar og töp á tímabilinu.</p>
    </div>
    ${divisionTables(meta, standings)}
  </div>
</section>`;
}

/* ---------- the explainer ---------- */
function explainer() {
  const stat = (n, unit, text, href, link) => `<div class="card stat">
    <div class="stat-n">${n}</div><div class="stat-unit">${unit}</div>
    <p>${text}</p><a href="${href}">${link}</a></div>`;
  const pos = (name, text) => `<li><strong>${name}</strong><span>${text}</span></li>`;
  const pts = (n, name, text) => `<div class="pts"><span class="pts-n">${n}</span><span class="pts-name">${name}</span><span>${text}</span></div>`;

  return `<section id="byrja" class="band">
  <div class="wrap">
    <div class="section-head">
      <h2 class="display">NFL á 30 sekúndum</h2>
      <p class="muted">Fjórar tölur sem útskýra deildina fyrir þá sem eru að byrja.</p>
    </div>
    <div class="stats">
      ${stat("32", "lið", "Tvær deildir, AFC og NFC. Í hvorri eru fjórir riðlar með fjórum liðum hver.", "#lid", "Sjá liðin")}
      ${stat("17", "leikir", "Hvert lið spilar 17 leiki á 18 vikum og fær eina hvíldarviku. Hver einasti leikur skiptir máli.", `${BASE}/leikir`, "Sjá leikina")}
      ${stat("4", "tilraunir", "Sóknin fær fjórar tilraunir (downs) til að færa boltann 10 jarda. Takist það byrjar talningin upp á nýtt.", "#laera", "Læra betur")}
      ${stat("14", "í úrslit", "Sjö lið úr hvorri deild komast í úrslitakeppnina. Eitt þeirra lyftir Vince Lombardi bikarnum í Super Bowl.", "#laera", "Læra betur")}
    </div>

    <div id="laera" class="learn">
      <div class="learn-tabs" role="tablist" aria-label="Grunnatriði">
        <button type="button" role="tab" id="t-sokn" aria-controls="p-sokn" aria-selected="true">Sókn og vörn</button>
        <button type="button" role="tab" id="t-tilraunir" aria-controls="p-tilraunir" aria-selected="false">4 tilraunir</button>
        <button type="button" role="tab" id="t-stig" aria-controls="p-stig" aria-selected="false">Stigin</button>
      </div>
      <div class="card learn-panel" role="tabpanel" id="p-sokn" aria-labelledby="t-sokn">
        <h3 class="display-sm">Hvert lið er tvö lið</h3>
        <p class="lede">Sóknin og vörnin eru aldrei inni á vellinum á sama tíma. Þegar liðið er með boltann spilar sóknin, annars spilar vörnin.</p>
        <div class="two">
          <div class="box">
            <span class="tag tag-blue tag-lg">Sókn (offense)</span>
            <p>Markmiðið er að koma boltanum í endasvæði andstæðinganna. Það kallast touchdown og gefur 6 stig.</p>
            <ul class="pos">
              ${pos("Quarterback (QB)", "Leikstjórnandinn. Kastar boltanum eða réttir hann áfram.")}
              ${pos("Running back (RB)", "Hlauparinn. Tekur við boltanum og brýst í gegnum vörnina.")}
              ${pos("Wide receiver (WR)", "Móttökumaðurinn. Hleypur út og grípur köstin.")}
              ${pos("Tight end (TE)", "Blanda af blokkara og móttökumanni. Stendur við enda sóknarlínunnar.")}
              ${pos("Offensive line (OL)", "Fimm stórir menn sem verja leikstjórnandann og opna leiðir fyrir hlauparann.")}
            </ul>
          </div>
          <div class="box">
            <span class="tag tag-red tag-lg">Vörn (defense)</span>
            <p>Markmiðið er að stöðva sóknina, tækla boltaberann og ná boltanum af andstæðingunum.</p>
            <ul class="pos">
              ${pos("Defensive line (DL)", "Reyna að komast að leikstjórnandanum og fella hann (sack).")}
              ${pos("Linebackers (LB)", "Tækla hlauparana og dekka stutt köst.")}
              ${pos("Cornerbacks og safeties (CB, S)", "Dekka móttökumennina og stöðva löng köst.")}
              ${pos("Boltataka", "Interception (vörnin grípur kast) og fumble (boltinn dettur úr höndum boltaberans).")}
            </ul>
          </div>
        </div>
        <div class="strip"><span class="tag tag-gold">Sérliðin</span><p>Þriðja liðið kemur inn í spyrnum: kickoff, punt (spyrna á 4. tilraun) og field goal (spark á markið).</p></div>
      </div>

      <div class="card learn-panel" role="tabpanel" id="p-tilraunir" aria-labelledby="t-tilraunir">
        <h3 class="display-sm">4 tilraunir. 10 jardar.</h3>
        <p class="lede">Sóknin fær fjórar tilraunir (downs) til að færa boltann að minnsta kosti 10 jarda. Takist það byrjar talningin upp á nýtt.</p>
        <div class="field" aria-hidden="true">
          <div class="field-los"></div><div class="field-first"></div>
          <div class="field-span"><span>10 jardar</span></div>
          <span class="field-chip">1st &amp; 10</span><span class="field-chip gold">First down</span>
        </div>
        <ol class="downs">
          <li><span>1</span>tilraun</li><li><span>2</span>tilraun</li><li><span>3</span>tilraun</li><li class="last"><span>4</span>tilraun, sú síðasta</li>
        </ol>
        <div class="two">
          <div class="outcome dark"><span class="tag tag-gold">Sóknin nær 10 jördum</span><p>Nýtt first down. Sóknin fær fjórar nýjar tilraunir og heldur áfram.</p></div>
          <div class="outcome red"><span class="tag tag-white">Sóknin nær því ekki</span><p>Hitt liðið fær boltann. Þess vegna er oft spyrnt (punt) eða reynt field goal á 4. tilraun.</p></div>
        </div>
        <p class="note">Að lesa „3rd &amp; 2“: þriðja tilraun og 2 jardar eftir í næsta first down. „1st &amp; 10“ táknar nýja sókn.</p>
      </div>

      <div class="card learn-panel" role="tabpanel" id="p-stig" aria-labelledby="t-stig">
        <h3 class="display-sm">Hvernig er skorað?</h3>
        <p class="lede">Fimm leiðir til að fá stig. Flest koma úr touchdown og field goal.</p>
        <div class="pts-grid">
          ${pts(6, "Touchdown", "Boltinn borinn eða gripinn í endasvæði andstæðinganna.")}
          ${pts(1, "Aukastig", "Spark í gegnum markið eftir touchdown.")}
          ${pts(2, "Tveggja stiga tilraun", "Í stað aukastigs má reyna að skora aftur úr 2 jarda fjarlægð.")}
          ${pts(3, "Field goal", "Spark í gegnum markið í miðjum leik, oft á 4. tilraun.")}
          ${pts(2, "Safety", "Vörnin fellir boltaberann í hans eigin endasvæði.")}
        </div>
        <p class="note">Flest lið skora í skrefum upp á 7 stig (touchdown og aukastig) og 3 stig (field goal). Þess vegna sjást úrslit eins og 17–10 og 24–21.</p>
      </div>
    </div>
  </div>
</section>`;
}

/* ---------- pages ---------- */
export function frontPage({ games, current, meta, standings }) {
  const now = Date.now();
  const next = games.find((g) => g.state === "pre" && new Date(g.date).getTime() > now);
  const wk = current || (next ? { type: next.type, week: next.week } : { type: 2, week: 1 });

  const body = `
<section class="hero">
  <div class="hero-stripes" aria-hidden="true"></div>
  <svg class="hero-stars" width="240" height="308" viewBox="0 0 240 308" aria-hidden="true">
    <defs><pattern id="stars" width="72" height="64" patternUnits="userSpaceOnUse">
      <polygon transform="translate(18 16)" points="0,-10 2.35,-3.24 9.51,-3.09 3.8,1.23 5.88,8.09 0,4 -5.88,8.09 -3.8,1.23 -9.51,-3.09 -2.35,-3.24" fill="#FFFFFF"/>
      <polygon transform="translate(54 48)" points="0,-10 2.35,-3.24 9.51,-3.09 3.8,1.23 5.88,8.09 0,4 -5.88,8.09 -3.8,1.23 -9.51,-3.09 -2.35,-3.24" fill="#FFFFFF"/>
    </pattern></defs>
    <rect width="240" height="308" fill="#1F3F8F"/><rect width="240" height="308" fill="url(#stars)"/>
  </svg>
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <h1 class="display-xl">NFL á<br>íslensku</h1>
      <div class="bars" aria-hidden="true"><span></span><span></span><span></span></div>
      <p class="hero-lede">Frá kickoff til Super Bowl. Reglurnar, liðin og leikirnir með highlights, allt á einum stað og á íslensku.</p>
      <div class="hero-cta">
        <a class="btn btn-red btn-lg" href="#byrja">Byrjaðu hér</a>
        <a class="btn btn-ghost btn-lg" href="#leikir">Leikir vikunnar</a>
      </div>
    </div>
    ${nextGameCard(next)}
  </div>
</section>
${explainer()}
${gamesSection({ games, current, type: wk.type, week: wk.week })}
${teamsSection(meta, standings)}`;

  return layout({
    title: "NFL á íslensku | Sportaclock",
    description: "NFL útskýrt á íslensku: reglurnar, liðin, leikirnir og highlights úr öllum leikjum.",
    ticker: ticker(games, current),
    body,
  });
}

export function gamesPage({ games, current, type, week }) {
  return layout({
    title: `${weekLabel(type, week)} | NFL á íslensku`,
    description: `Allir leikir í ${weekLabel(type, week).toLowerCase()} í NFL, úrslit og highlights, að íslenskum tíma.`,
    active: "leikir",
    ticker: ticker(games, current),
    body: gamesSection({ games, current, type, week, heading: weekLabel(type, week), h: "h1" }),
  });
}

export function teamsPage({ games, current, meta, standings }) {
  return layout({
    title: "Liðin 32 | NFL á íslensku",
    description: "Öll 32 lið NFL eftir riðlum, með stöðu á tímabilinu.",
    active: "lid",
    ticker: ticker(games, current),
    body: teamsSection(meta, standings, "h1"),
  });
}

export function glossaryPage({ games, current }) {
  const items = GLOSSARY.map(([term, text]) =>
    `<div class="gl-item"><dt>${esc(term)}</dt><dd>${esc(text)}</dd></div>`).join("");
  return layout({
    title: "Orðabók | NFL á íslensku",
    description: "Orðin sem heyrast í NFL útsendingum, útskýrð á íslensku.",
    active: "ordabok",
    ticker: ticker(games, current),
    body: `<section class="band"><div class="wrap">
      <div class="section-head"><h1 class="display">Orðabók</h1>
      <p class="muted">Orðin sem heyrast í útsendingum, útskýrð á íslensku. Við höldum ensku heitunum því það eru þau sem lýsendurnir nota.</p></div>
      <dl class="glossary">${items}</dl>
    </div></section>`,
  });
}

export function teamPage({ ab, games, current, meta, standings, detail, roster }) {
  const t = TEAMS[ab], m = meta?.[ab] || {}, div = divisionOf(ab);
  const color = m.color || "#0B1B3F";
  const accent = m.alt && m.alt.toLowerCase() !== color.toLowerCase() ? m.alt : "#FFC629";
  const s = standings?.[ab];
  const rank = s ? [...div.teams].sort((a, b) => (standings[a]?.seed ?? 99) - (standings[b]?.seed ?? 99)).indexOf(ab) + 1 : null;

  const mine = games.filter((g) => g.home.ab === ab || g.away.ab === ab);
  const now = Date.now();
  const next = mine.find((g) => g.state === "pre" && new Date(g.date).getTime() > now);
  const playedWeeks = new Set(mine.filter((g) => g.type === 2).map((g) => g.week));
  const lastRegWeek = Math.max(0, ...mine.filter((g) => g.type === 2).map((g) => g.week));
  let bye = null;
  for (let w = 1; w <= Math.min(18, lastRegWeek); w++) if (!playedWeeks.has(w)) { bye = w; break; }

  // About: built from facts, so it can't drift from the data.
  const about = [];
  about.push(`${t.name} spila í ${div.name}.`);
  if (detail?.venue) about.push(`Heimavöllurinn er ${detail.venue}${detail.city ? ` í ${detail.city}` : ""}.`);
  if (s) {
    // Accusative after "með": 1 sigur / 2 sigra, 1 tap / 2 töp.
    const rec = [count(s.wins, "sigur", "sigra"), count(s.losses, "tap", "töp")];
    if (s.ties) rec.push(count(s.ties, "jafntefli", "jafntefli"));
    about.push(`Á tímabilinu er liðið með ${rec.join(", ").replace(/, ([^,]*)$/, " og $1")} og situr í ${rank}. sæti riðilsins.`);
  }
  if (bye) about.push(`Hvíldarvikan er vika ${bye}.`);
  if (roster?.coach) about.push(`Aðalþjálfari er ${roster.coach}.`);

  // Key players present on today's roster only.
  const everyone = Object.values(roster?.groups || {}).flat();
  const keys = (KEY_PLAYERS[ab] || []).map((k) => ({ ...k, p: everyone.find((p) => p.name === k.name) })).filter((k) => k.p);

  const teamGame = (g) => {
    const home = g.home.ab === ab;
    const me = home ? g.home : g.away, them = home ? g.away : g.home;
    const opp = `${g.neutral ? "gegn" : home ? "gegn" : "@"} ${them.ab}`;
    let right;
    if (g.state === "post") {
      const res = me.score > them.score ? ["S", "win"] : me.score < them.score ? ["T", "loss"] : ["J", "tie"];
      const vid = videoFor(g);
      const hl = vid
        ? `<a class="btn btn-red btn-sm" href="https://www.youtube.com/watch?v=${esc(vid)}" target="_blank" rel="noopener">${ICON.play}Highlights</a>`
        : `<a class="btn btn-red btn-sm" href="${esc(searchUrl(g))}" target="_blank" rel="noopener">${ICON.play}Highlights</a>`;
      right = `<span class="res ${res[1]}" title="${res[0] === "S" ? "Sigur" : res[0] === "T" ? "Tap" : "Jafntefli"}">${res[0]}</span><span class="tg-score">${esc(me.score)}–${esc(them.score)}</span>${hl}`;
    } else if (g.state === "in") {
      right = `<span class="tag tag-gold live-tag"><span class="dot"></span>Í beinni</span><span class="tg-score">${esc(me.score)}–${esc(them.score)}</span>`;
    } else {
      right = `<span class="tg-when">${esc(shortWhen(g.date))}</span>`;
    }
    return `<li class="tg"><div><span class="muted">${esc(weekLabel(g.type, g.week))}</span>
      <a class="tg-opp" href="${teamHref(them.ab)}">${esc(opp)}</a></div><div class="tg-right">${right}</div></li>`;
  };

  const rosterTables = ROSTER_GROUPS.map(([key, label]) => {
    const list = roster?.groups?.[key];
    if (!list?.length) return "";
    const rows = list
      .slice().sort((a, b) => (Number(a.jersey) || 999) - (Number(b.jersey) || 999))
      .map((p) => `<tr><td class="num">${esc(p.jersey)}</td><td>${esc(p.name)}</td><td><abbr title="${esc(POSITIONS[p.pos] || p.pos)}">${esc(p.pos)}</abbr> <span class="muted">${esc(POSITIONS[p.pos] || "")}</span></td><td class="hide-sm">${esc(p.age ?? "")}</td><td class="hide-sm muted">${esc(p.college)}</td></tr>`)
      .join("");
    return `<details class="roster"${key === "offense" ? " open" : ""}>
      <summary>${esc(label)} <span class="muted">(${list.length})</span></summary>
      <div class="table-scroll"><table>
        <thead><tr><th scope="col">Nr.</th><th scope="col">Leikmaður</th><th scope="col">Staða</th><th scope="col" class="hide-sm">Aldur</th><th scope="col" class="hide-sm">Háskóli</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </details>`;
  }).join("");

  const body = `
<section class="team-hero" style="--team:${esc(color)}; --team-accent:${esc(accent)}">
  <span class="team-ghost" aria-hidden="true">${esc(ab)}</span>
  <div class="wrap team-hero-inner">
    <nav class="crumbs" aria-label="Brauðmolar"><a href="${BASE}/lid">Lið</a>${ICON.chevron}<span>${esc(div.name)}</span></nav>
    <div class="team-title">
      ${m.logo ? `<img class="team-logo" src="${esc(m.logo)}" alt="" width="112" height="112">` : ""}
      <h1 class="display-xl">${esc(m.location || "")}<br>${esc(m.nickname || t.name)}</h1>
    </div>
    <dl class="facts">
      ${detail?.venue ? `<div><dt>Heimavöllur</dt><dd>${esc(detail.venue)}</dd></div>` : ""}
      ${detail?.city ? `<div><dt>Borg</dt><dd>${esc(detail.city)}${detail.state ? `, ${esc(detail.state)}` : ""}</dd></div>` : ""}
      ${s ? `<div><dt>Staðan</dt><dd>${s.wins}–${s.losses}${s.ties ? `–${s.ties}` : ""} · ${rank}. sæti</dd></div>` : ""}
    </dl>
  </div>
</section>
<div class="wrap team-body">
  <div class="team-main">
    <section>
      <h2 class="display">Um liðið</h2>
      <p class="lede">${esc(about.join(" "))}</p>
    </section>
    ${keys.length ? `<section>
      <h2 class="display">Helstu leikmenn</h2>
      <div class="players">${keys.map((k) => `<div class="card player-card">
        <div class="pc-num" style="color:${esc(color)}">${esc(k.p.jersey)}</div>
        <div class="pc-name">${esc(k.p.name)}</div>
        <div class="muted pc-pos">${esc(POSITIONS[k.p.pos] || k.p.pos)} (${esc(k.p.pos)})</div>
        <p>${esc(k.text)}</p></div>`).join("")}</div>
    </section>` : ""}
    <section>
      <h2 class="display">Leikmannahópur</h2>
      ${rosterTables || '<p class="muted">Leikmannahópurinn náðist ekki frá ESPN í augnablikinu. Reyndu aftur eftir smá stund.</p>'}
    </section>
  </div>
  <aside class="team-side">
    ${next ? nextGameCard(next, { dark: true }) : ""}
    <section>
      <h2 class="display">Leikir</h2>
      <ul class="team-games">${mine.map(teamGame).join("") || '<li class="muted">Engir leikir fundust.</li>'}</ul>
    </section>
  </aside>
</div>`;

  return layout({
    title: `${t.name} | NFL á íslensku`,
    description: `${t.name}: leikmannahópur, leikir, úrslit og highlights, á íslensku.`,
    active: "lid",
    ticker: ticker(games, current),
    body,
  });
}

export function errorPage(message) {
  return layout({
    title: "NFL á íslensku",
    description: "",
    body: `<section class="band"><div class="wrap"><h1 class="display">Úps</h1><p class="lede">${esc(message)}</p><p><a class="btn btn-red" href="${BASE}">Á forsíðu</a></p></div></section>`,
  });
}
