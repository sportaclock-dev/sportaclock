/* ============================================================
   NFL á íslensku — fixed content.

   Everything here is either a stable fact about the league (who
   plays in which division) or Icelandic text written by hand. The
   live parts (scores, rosters, standings) come from data.js.

   Team keys are ESPN's abbreviations, which differ from the ones
   people usually write in two places: Washington is WSH (not WAS)
   and the Rams are LAR (not LA).
   ============================================================ */

export const TEAMS = {
  BUF: { id: "2", name: "Buffalo Bills", div: "afc-austur" },
  MIA: { id: "15", name: "Miami Dolphins", div: "afc-austur" },
  NE: { id: "17", name: "New England Patriots", div: "afc-austur" },
  NYJ: { id: "20", name: "New York Jets", div: "afc-austur" },
  BAL: { id: "33", name: "Baltimore Ravens", div: "afc-nordur" },
  CIN: { id: "4", name: "Cincinnati Bengals", div: "afc-nordur" },
  CLE: { id: "5", name: "Cleveland Browns", div: "afc-nordur" },
  PIT: { id: "23", name: "Pittsburgh Steelers", div: "afc-nordur" },
  HOU: { id: "34", name: "Houston Texans", div: "afc-sudur" },
  IND: { id: "11", name: "Indianapolis Colts", div: "afc-sudur" },
  JAX: { id: "30", name: "Jacksonville Jaguars", div: "afc-sudur" },
  TEN: { id: "10", name: "Tennessee Titans", div: "afc-sudur" },
  DEN: { id: "7", name: "Denver Broncos", div: "afc-vestur" },
  KC: { id: "12", name: "Kansas City Chiefs", div: "afc-vestur" },
  LV: { id: "13", name: "Las Vegas Raiders", div: "afc-vestur" },
  LAC: { id: "24", name: "Los Angeles Chargers", div: "afc-vestur" },
  DAL: { id: "6", name: "Dallas Cowboys", div: "nfc-austur" },
  NYG: { id: "19", name: "New York Giants", div: "nfc-austur" },
  PHI: { id: "21", name: "Philadelphia Eagles", div: "nfc-austur" },
  WSH: { id: "28", name: "Washington Commanders", div: "nfc-austur" },
  CHI: { id: "3", name: "Chicago Bears", div: "nfc-nordur" },
  DET: { id: "8", name: "Detroit Lions", div: "nfc-nordur" },
  GB: { id: "9", name: "Green Bay Packers", div: "nfc-nordur" },
  MIN: { id: "16", name: "Minnesota Vikings", div: "nfc-nordur" },
  ATL: { id: "1", name: "Atlanta Falcons", div: "nfc-sudur" },
  CAR: { id: "29", name: "Carolina Panthers", div: "nfc-sudur" },
  NO: { id: "18", name: "New Orleans Saints", div: "nfc-sudur" },
  TB: { id: "27", name: "Tampa Bay Buccaneers", div: "nfc-sudur" },
  ARI: { id: "22", name: "Arizona Cardinals", div: "nfc-vestur" },
  LAR: { id: "14", name: "Los Angeles Rams", div: "nfc-vestur" },
  SF: { id: "25", name: "San Francisco 49ers", div: "nfc-vestur" },
  SEA: { id: "26", name: "Seattle Seahawks", div: "nfc-vestur" },
};

export const DIVISIONS = [
  ["afc-austur", "AFC", "AFC Austur"],
  ["afc-nordur", "AFC", "AFC Norður"],
  ["afc-sudur", "AFC", "AFC Suður"],
  ["afc-vestur", "AFC", "AFC Vestur"],
  ["nfc-austur", "NFC", "NFC Austur"],
  ["nfc-nordur", "NFC", "NFC Norður"],
  ["nfc-sudur", "NFC", "NFC Suður"],
  ["nfc-vestur", "NFC", "NFC Vestur"],
].map(([id, conf, name]) => ({
  id, conf, name,
  teams: Object.keys(TEAMS).filter((ab) => TEAMS[ab].div === id),
}));

export const divisionOf = (ab) => DIVISIONS.find((d) => d.id === TEAMS[ab]?.div);

// Case-insensitive lookup that also accepts the common spellings.
const ALIASES = { WAS: "WSH", LA: "LAR", JAC: "JAX" };
export function teamKey(raw) {
  const up = String(raw || "").toUpperCase();
  const k = ALIASES[up] || up;
  return Object.hasOwn(TEAMS, k) ? k : null;
}

/* ---------- Icelandic time ----------
   Iceland is UTC all year, so "að íslenskum tíma" is just UTC. The
   server renders in that zone explicitly rather than trusting the
   host's clock settings. */
const TZ = "Atlantic/Reykjavik";
const DAYS_SHORT = ["Sun", "Mán", "Þri", "Mið", "Fim", "Fös", "Lau"];
const DAYS_LONG = ["sunnudag", "mánudag", "þriðjudag", "miðvikudag", "fimmtudag", "föstudag", "laugardag"];
const MONTHS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí",
  "ágúst", "september", "október", "nóvember", "desember"];

function partsIs(iso) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, day: "numeric", month: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t) => f.find((p) => p.type === t)?.value;
  return { dow: d.getUTCDay(), day: Number(get("day")), month: Number(get("month")) - 1, hm: `${get("hour")}:${get("minute")}` };
}

// "Mán 00:20"
export function shortWhen(iso) {
  const p = partsIs(iso);
  return `${DAYS_SHORT[p.dow]} ${p.hm}`;
}

// "21. september 2026" from "2026-09-21"
export function dateIs(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return "";
  return `${Number(m[3])}. ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// "mánudaginn 21. september kl. 00:20"
export function longWhen(iso) {
  const p = partsIs(iso);
  return `${DAYS_LONG[p.dow]}inn ${p.day}. ${MONTHS[p.month]} kl. ${p.hm}`;
}

/* ---------- Weeks ----------
   ESPN numbers playoff rounds 1–5 inside season type 3, with week 4
   being the Pro Bowl, which we skip. URL keys: "1".."18" for the
   regular season, "u1".."u5" for the playoffs. */
export const PLAYOFF_ROUNDS = { 1: "Wild Card", 2: "Divisional", 3: "Úrslit deildanna", 5: "Super Bowl" };

export function weekLabel(type, week) {
  if (type === 3) return PLAYOFF_ROUNDS[week] || "Úrslitakeppni";
  return `Vika ${week}`;
}
export const weekKey = (type, week) => (type === 3 ? `u${week}` : String(week));
export function parseWeekKey(s) {
  const m = /^(u?)(\d{1,2})$/.exec(String(s || ""));
  if (!m) return null;
  const type = m[1] ? 3 : 2, week = Number(m[2]);
  if (type === 2 && (week < 1 || week > 18)) return null;
  if (type === 3 && !PLAYOFF_ROUNDS[week]) return null;
  return { type, week };
}

/* ---------- Positions, for the roster table ---------- */
export const POSITIONS = {
  QB: "Leikstjórnandi", RB: "Hlaupari", FB: "Fullback", WR: "Móttökumaður", TE: "Tight end",
  OT: "Sóknarlína", T: "Sóknarlína", G: "Sóknarlína", OG: "Sóknarlína", C: "Sóknarlína", OL: "Sóknarlína",
  DE: "Varnarlína", DT: "Varnarlína", NT: "Varnarlína", DL: "Varnarlína", EDGE: "Varnarlína",
  LB: "Linebacker", OLB: "Linebacker", ILB: "Linebacker", MLB: "Linebacker",
  CB: "Cornerback", S: "Safety", FS: "Safety", SS: "Safety", DB: "Varnarbakvörður",
  PK: "Sparkari", K: "Sparkari", P: "Punter", LS: "Long snapper",
};

export const ROSTER_GROUPS = [
  ["offense", "Sókn"],
  ["defense", "Vörn"],
  ["specialTeam", "Sérlið"],
  ["injuredReserveOrOut", "Á meiðslalista eða frá"],
];

/* ---------- Key players ----------
   Hand-written, keyed by team, matched against the live roster by
   name. A player who has left the team simply stops showing, so a
   trade can never leave a blurb on the wrong team's page. */
export const KEY_PLAYERS = {
  KC: [
    { name: "Patrick Mahomes", text: "Kastar boltanum og stýrir sókninni. Þrisvar valinn verðmætasti leikmaður Super Bowl." },
  ],
};

/* ---------- Orðabók ---------- */
export const GLOSSARY = [
  ["Touchdown", "Boltinn borinn inn í endasvæði andstæðinganna eða gripinn þar. Gefur 6 stig."],
  ["Extra point", "Spark í gegnum markið strax eftir touchdown. Gefur 1 stig."],
  ["Two-point conversion", "Í stað aukaspyrnu reynir sóknin að skora aftur frá 2 jarda línunni. Gefur 2 stig."],
  ["Field goal", "Spark í gegnum markstangirnar í miðjum leik. Gefur 3 stig."],
  ["Safety", "Vörnin fellir boltaberann í hans eigin endasvæði. Vörnin fær 2 stig og boltann líka."],
  ["Down", "Tilraun. Sóknin fær fjórar tilraunir til að komast 10 jarda."],
  ["First down", "Sóknin hefur náð 10 jördum og fær fjórar nýjar tilraunir."],
  ["Line of scrimmage", "Línan þar sem hvert kerfi byrjar. Hvorugt liðið má fara yfir hana fyrr en boltinn er kominn í leik."],
  ["Snap", "Þegar center réttir boltann aftur á milli fótanna til leikstjórnandans og kerfið hefst."],
  ["Pocket", "Varnarveggurinn sem sóknarlínan myndar í kringum leikstjórnandann á meðan hann leitar að móttakanda."],
  ["Sack", "Leikstjórnandinn felldur með boltann fyrir aftan línuna áður en hann nær að kasta."],
  ["Blitz", "Vörnin sendir fleiri menn en venjulega á leikstjórnandann til að reyna að ná sack."],
  ["Interception", "Varnarmaður grípur kast sem var ætlað sókninni. Boltinn skiptir um lið."],
  ["Fumble", "Boltaberinn missir boltann. Hvort liðið sem er getur náð honum."],
  ["Turnover", "Boltinn skiptir um lið vegna interception eða fumble."],
  ["Punt", "Spyrna frá sókninni, oftast á 4. tilraun, til að koma andstæðingunum sem lengst frá endasvæðinu."],
  ["Kickoff", "Upphafsspyrna í byrjun hvors hálfleiks og eftir hvert skor."],
  ["Red zone", "Síðustu 20 jardarnir að endasvæði andstæðinganna."],
  ["Play action", "Leikstjórnandinn þykist rétta hlauparanum boltann en kastar honum svo."],
  ["Scramble", "Leikstjórnandinn hleypur sjálfur með boltann þegar enginn er laus til að taka við."],
  ["Audible", "Leikstjórnandinn breytir kerfinu við línuna eftir að hafa séð hvernig vörnin stillir upp."],
  ["Huddle", "Hópurinn sem liðið myndar á milli kerfa til að ákveða næsta kerfi."],
  ["Hail Mary", "Langt örvæntingarkast inn í endasvæðið þegar tíminn er að renna út."],
  ["Flag", "Gula flaggið sem dómari kastar þegar brot er framið. Refsingin er oftast mæld í jördum."],
  ["Holding", "Leikmaður heldur andstæðingi ólöglega. Eitt algengasta brotið í leiknum."],
  ["False start", "Sóknarmaður hreyfir sig áður en boltinn er kominn í leik. Kostar 5 jarda."],
  ["Pass interference", "Leikmaður hindrar andstæðing ólöglega í að grípa kast."],
  ["Challenge", "Þjálfari kastar rauðu flaggi til að láta skoða dóm á myndbandi."],
  ["Two-minute warning", "Sjálfkrafa hlé þegar tvær mínútur eru eftir af hvorum hálfleik."],
  ["Quarter", "Leikhluti. Leikurinn er fjórum sinnum 15 mínútur af leiktíma, en klukkan stöðvast oft."],
  ["Overtime", "Framlenging ef jafnt er eftir venjulegan leiktíma. Í deildarkeppninni getur leikur samt endað með jafntefli."],
  ["Bye week", "Hvíldarvika. Hvert lið fær eina slíka á tímabilinu."],
  ["Wild card", "Lið sem kemst í úrslitakeppnina án þess að vinna riðilinn sinn. Þrjú úr hvorri deild."],
  ["Seed", "Röðun liða í úrslitakeppninni. Efsta liðið í hvorri deild situr hjá í fyrstu umferð."],
  ["Super Bowl", "Úrslitaleikurinn á milli sigurvegara AFC og NFC. Sigurliðið fær Vince Lombardi bikarinn."],
  ["Rookie", "Nýliði, leikmaður á sínu fyrsta tímabili í deildinni."],
  ["Draft", "Nýliðavalið á vorin. Lakasta lið síðasta tímabils velur fyrst."],
];
