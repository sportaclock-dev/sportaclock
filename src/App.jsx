import React, { useState, useEffect, useMemo } from "react";

/* ============================================================
   SPORTACLOCK — World Cup 2026
   Ready. Tick. Kick.
   1) Every match with a live countdown in YOUR timezone
   2) A spoiler-free catch-up zone for finished matches
   All kickoff times stored in UTC (official times are ET, UTC-4)
   ============================================================ */

// ---------- DATA: all 104 matches ----------
const M = (t, g, home, away, venue, city, stage = "Groups") => ({
  t, g, home, away, venue, city, stage,
});

const MATCHES = [
  // ----- Group stage: June 11–27 -----
  M("2026-06-11T19:00:00Z","A","Mexico","South Africa","Estadio Azteca","Mexico City"),
  M("2026-06-12T02:00:00Z","A","South Korea","Czechia","Estadio Akron","Zapopan"),
  M("2026-06-12T19:00:00Z","B","Canada","Bosnia & Herzegovina","BMO Field","Toronto"),
  M("2026-06-13T01:00:00Z","D","USA","Paraguay","SoFi Stadium","Inglewood"),
  M("2026-06-13T19:00:00Z","B","Qatar","Switzerland","Levi's Stadium","Santa Clara"),
  M("2026-06-13T22:00:00Z","C","Brazil","Morocco","MetLife Stadium","East Rutherford"),
  M("2026-06-14T01:00:00Z","C","Haiti","Scotland","Gillette Stadium","Foxborough"),
  M("2026-06-14T04:00:00Z","D","Australia","Türkiye","BC Place","Vancouver"),
  M("2026-06-14T17:00:00Z","E","Germany","Curaçao","NRG Stadium","Houston"),
  M("2026-06-14T20:00:00Z","F","Netherlands","Japan","AT&T Stadium","Arlington"),
  M("2026-06-14T23:00:00Z","E","Ivory Coast","Ecuador","Lincoln Financial Field","Philadelphia"),
  M("2026-06-15T02:00:00Z","F","Sweden","Tunisia","Estadio BBVA","Monterrey"),
  M("2026-06-15T16:00:00Z","H","Spain","Cape Verde","Mercedes-Benz Stadium","Atlanta"),
  M("2026-06-15T19:00:00Z","G","Belgium","Egypt","Lumen Field","Seattle"),
  M("2026-06-15T22:00:00Z","H","Saudi Arabia","Uruguay","Hard Rock Stadium","Miami Gardens"),
  M("2026-06-16T01:00:00Z","G","Iran","New Zealand","SoFi Stadium","Inglewood"),
  M("2026-06-16T19:00:00Z","I","France","Senegal","MetLife Stadium","East Rutherford"),
  M("2026-06-16T22:00:00Z","I","Iraq","Norway","Gillette Stadium","Foxborough"),
  M("2026-06-17T01:00:00Z","J","Argentina","Algeria","Arrowhead Stadium","Kansas City"),
  M("2026-06-17T04:00:00Z","J","Austria","Jordan","Levi's Stadium","Santa Clara"),
  M("2026-06-17T17:00:00Z","K","Portugal","DR Congo","NRG Stadium","Houston"),
  M("2026-06-17T20:00:00Z","L","England","Croatia","AT&T Stadium","Arlington"),
  M("2026-06-17T23:00:00Z","L","Ghana","Panama","BMO Field","Toronto"),
  M("2026-06-18T02:00:00Z","K","Uzbekistan","Colombia","Estadio Azteca","Mexico City"),
  M("2026-06-18T16:00:00Z","A","Czechia","South Africa","Mercedes-Benz Stadium","Atlanta"),
  M("2026-06-18T19:00:00Z","B","Switzerland","Bosnia & Herzegovina","SoFi Stadium","Inglewood"),
  M("2026-06-18T22:00:00Z","B","Canada","Qatar","BC Place","Vancouver"),
  M("2026-06-19T01:00:00Z","A","Mexico","South Korea","Estadio Akron","Zapopan"),
  M("2026-06-19T19:00:00Z","D","USA","Australia","Lumen Field","Seattle"),
  M("2026-06-19T22:00:00Z","C","Scotland","Morocco","Gillette Stadium","Foxborough"),
  M("2026-06-20T00:30:00Z","C","Brazil","Haiti","Lincoln Financial Field","Philadelphia"),
  M("2026-06-20T03:00:00Z","D","Türkiye","Paraguay","Levi's Stadium","Santa Clara"),
  M("2026-06-20T17:00:00Z","F","Netherlands","Sweden","NRG Stadium","Houston"),
  M("2026-06-20T20:00:00Z","E","Germany","Ivory Coast","BMO Field","Toronto"),
  M("2026-06-21T00:00:00Z","E","Ecuador","Curaçao","Arrowhead Stadium","Kansas City"),
  M("2026-06-21T04:00:00Z","F","Tunisia","Japan","Estadio BBVA","Monterrey"),
  M("2026-06-21T16:00:00Z","H","Spain","Saudi Arabia","Mercedes-Benz Stadium","Atlanta"),
  M("2026-06-21T19:00:00Z","G","Belgium","Iran","SoFi Stadium","Inglewood"),
  M("2026-06-21T22:00:00Z","H","Uruguay","Cape Verde","Hard Rock Stadium","Miami Gardens"),
  M("2026-06-22T01:00:00Z","G","New Zealand","Egypt","BC Place","Vancouver"),
  M("2026-06-22T17:00:00Z","J","Argentina","Austria","AT&T Stadium","Arlington"),
  M("2026-06-22T21:00:00Z","I","France","Iraq","Lincoln Financial Field","Philadelphia"),
  M("2026-06-23T00:00:00Z","I","Norway","Senegal","MetLife Stadium","East Rutherford"),
  M("2026-06-23T03:00:00Z","J","Jordan","Algeria","Levi's Stadium","Santa Clara"),
  M("2026-06-23T17:00:00Z","K","Portugal","Uzbekistan","NRG Stadium","Houston"),
  M("2026-06-23T20:00:00Z","L","England","Ghana","Gillette Stadium","Foxborough"),
  M("2026-06-23T23:00:00Z","L","Panama","Croatia","BMO Field","Toronto"),
  M("2026-06-24T02:00:00Z","K","Colombia","DR Congo","Estadio Akron","Zapopan"),
  M("2026-06-24T19:00:00Z","B","Switzerland","Canada","BC Place","Vancouver"),
  M("2026-06-24T19:00:00Z","B","Bosnia & Herzegovina","Qatar","Lumen Field","Seattle"),
  M("2026-06-24T22:00:00Z","C","Scotland","Brazil","Hard Rock Stadium","Miami Gardens"),
  M("2026-06-24T22:00:00Z","C","Morocco","Haiti","Mercedes-Benz Stadium","Atlanta"),
  M("2026-06-25T01:00:00Z","A","Czechia","Mexico","Estadio Azteca","Mexico City"),
  M("2026-06-25T01:00:00Z","A","South Africa","South Korea","Estadio BBVA","Monterrey"),
  M("2026-06-25T20:00:00Z","E","Curaçao","Ivory Coast","Lincoln Financial Field","Philadelphia"),
  M("2026-06-25T20:00:00Z","E","Ecuador","Germany","MetLife Stadium","East Rutherford"),
  M("2026-06-25T23:00:00Z","F","Japan","Sweden","AT&T Stadium","Arlington"),
  M("2026-06-25T23:00:00Z","F","Tunisia","Netherlands","Arrowhead Stadium","Kansas City"),
  M("2026-06-26T02:00:00Z","D","Türkiye","USA","SoFi Stadium","Inglewood"),
  M("2026-06-26T02:00:00Z","D","Paraguay","Australia","Levi's Stadium","Santa Clara"),
  M("2026-06-26T19:00:00Z","I","Norway","France","Gillette Stadium","Foxborough"),
  M("2026-06-26T19:00:00Z","I","Senegal","Iraq","BMO Field","Toronto"),
  M("2026-06-27T00:00:00Z","H","Cape Verde","Saudi Arabia","NRG Stadium","Houston"),
  M("2026-06-27T00:00:00Z","H","Uruguay","Spain","Estadio Akron","Zapopan"),
  M("2026-06-27T03:00:00Z","G","Egypt","Iran","Lumen Field","Seattle"),
  M("2026-06-27T03:00:00Z","G","New Zealand","Belgium","BC Place","Vancouver"),
  M("2026-06-27T21:00:00Z","L","Panama","England","MetLife Stadium","East Rutherford"),
  M("2026-06-27T21:00:00Z","L","Croatia","Ghana","Lincoln Financial Field","Philadelphia"),
  M("2026-06-27T23:30:00Z","K","Colombia","Portugal","Hard Rock Stadium","Miami Gardens"),
  M("2026-06-27T23:30:00Z","K","DR Congo","Uzbekistan","Mercedes-Benz Stadium","Atlanta"),
  M("2026-06-28T02:00:00Z","J","Algeria","Austria","Arrowhead Stadium","Kansas City"),
  M("2026-06-28T02:00:00Z","J","Jordan","Argentina","AT&T Stadium","Arlington"),
  // ----- Round of 32: June 28 – July 3 -----
  M("2026-06-28T19:00:00Z","73","Runner-up A","Runner-up B","SoFi Stadium","Inglewood","R32"),
  M("2026-06-29T17:00:00Z","76","Winner C","Runner-up F","NRG Stadium","Houston","R32"),
  M("2026-06-29T20:30:00Z","74","Winner E","3rd A/B/C/D/F","Gillette Stadium","Foxborough","R32"),
  M("2026-06-30T01:00:00Z","75","Winner F","Runner-up C","Estadio BBVA","Monterrey","R32"),
  M("2026-06-30T17:00:00Z","78","Runner-up E","Runner-up I","AT&T Stadium","Arlington","R32"),
  M("2026-06-30T21:00:00Z","77","Winner I","3rd C/D/F/G/H","MetLife Stadium","East Rutherford","R32"),
  M("2026-07-01T01:00:00Z","79","Winner A","3rd C/E/F/H/I","Estadio Azteca","Mexico City","R32"),
  M("2026-07-01T16:00:00Z","80","Winner L","3rd E/H/I/J/K","Mercedes-Benz Stadium","Atlanta","R32"),
  M("2026-07-01T20:00:00Z","82","Winner G","3rd A/E/H/I/J","Lumen Field","Seattle","R32"),
  M("2026-07-02T00:00:00Z","81","Winner D","3rd B/E/F/I/J","Levi's Stadium","Santa Clara","R32"),
  M("2026-07-02T19:00:00Z","84","Winner H","Runner-up J","SoFi Stadium","Inglewood","R32"),
  M("2026-07-02T23:00:00Z","83","Runner-up K","Runner-up L","BMO Field","Toronto","R32"),
  M("2026-07-03T03:00:00Z","85","Winner B","3rd E/F/G/I/J","BC Place","Vancouver","R32"),
  M("2026-07-03T18:00:00Z","88","Runner-up D","Runner-up G","AT&T Stadium","Arlington","R32"),
  M("2026-07-03T22:00:00Z","86","Winner J","Runner-up H","Hard Rock Stadium","Miami Gardens","R32"),
  M("2026-07-04T01:30:00Z","87","Winner K","3rd D/E/I/J/L","Arrowhead Stadium","Kansas City","R32"),
  // ----- Round of 16: July 4–7 -----
  M("2026-07-04T17:00:00Z","90","Winner M73","Winner M75","NRG Stadium","Houston","R16"),
  M("2026-07-04T21:00:00Z","89","Winner M74","Winner M77","Lincoln Financial Field","Philadelphia","R16"),
  M("2026-07-05T20:00:00Z","91","Winner M76","Winner M78","MetLife Stadium","East Rutherford","R16"),
  M("2026-07-06T00:00:00Z","92","Winner M79","Winner M80","Estadio Azteca","Mexico City","R16"),
  M("2026-07-06T19:00:00Z","93","Winner M83","Winner M84","AT&T Stadium","Arlington","R16"),
  M("2026-07-07T00:00:00Z","94","Winner M81","Winner M82","Lumen Field","Seattle","R16"),
  M("2026-07-07T16:00:00Z","95","Winner M86","Winner M88","Mercedes-Benz Stadium","Atlanta","R16"),
  M("2026-07-07T20:00:00Z","96","Winner M85","Winner M87","BC Place","Vancouver","R16"),
  // ----- Quarterfinals: July 9–11 -----
  M("2026-07-09T20:00:00Z","97","Winner M89","Winner M90","Gillette Stadium","Foxborough","QF"),
  M("2026-07-10T19:00:00Z","98","Winner M93","Winner M94","SoFi Stadium","Inglewood","QF"),
  M("2026-07-11T21:00:00Z","99","Winner M91","Winner M92","Hard Rock Stadium","Miami Gardens","QF"),
  M("2026-07-12T01:00:00Z","100","Winner M95","Winner M96","Arrowhead Stadium","Kansas City","QF"),
  // ----- Semifinals -----
  M("2026-07-14T19:00:00Z","101","Winner M97","Winner M98","AT&T Stadium","Arlington","SF"),
  M("2026-07-15T19:00:00Z","102","Winner M99","Winner M100","Mercedes-Benz Stadium","Atlanta","SF"),
  // ----- Third place + Final -----
  M("2026-07-18T21:00:00Z","103","Loser M101","Loser M102","Hard Rock Stadium","Miami Gardens","3rd Place"),
  M("2026-07-19T19:00:00Z","104","Winner M101","Winner M102","MetLife Stadium","East Rutherford","Final"),
].map((m, i) => ({ ...m, id: i, kickoff: new Date(m.t).getTime() }));

const MATCH_MINUTES = 135; // 90' + HT + stoppage buffer; knockouts may run longer

// ---------- Broadcaster presets (replay hubs, not score pages) ----------
const COUNTRIES = [
  { id: "is", label: "Iceland — RÚV", links: [
    { name: "RÚV Sjónvarp", url: "https://www.ruv.is/sjonvarp" },
    { name: "RÚV Íþróttir", url: "https://www.ruv.is/ithrottir" },
  ]},
  { id: "uk", label: "United Kingdom — BBC / ITV (UK only)", links: [
    { name: "BBC iPlayer", url: "https://www.bbc.co.uk/iplayer" },
    { name: "ITVX", url: "https://www.itvx.com" },
  ]},
  { id: "intl", label: "Anywhere — FIFA+", links: [
    { name: "FIFA+", url: "https://www.plus.fifa.com" },
  ]},
  { id: "de", label: "Germany — ARD / ZDF", links: [
    { name: "ZDF Mediathek", url: "https://www.zdf.de/sport" },
    { name: "ARD Sportschau", url: "https://www.sportschau.de" },
  ]},
  { id: "fr", label: "France — TF1 / M6", links: [
    { name: "TF1+", url: "https://www.tf1.fr" },
    { name: "M6+", url: "https://www.6play.fr" },
  ]},
  { id: "es", label: "Spain — RTVE", links: [
    { name: "RTVE Play", url: "https://www.rtve.es/play/" },
  ]},
  { id: "it", label: "Italy — Rai", links: [
    { name: "RaiPlay", url: "https://www.raiplay.it" },
  ]},
  { id: "nl", label: "Netherlands — NOS", links: [
    { name: "NPO Start", url: "https://npo.nl/start" },
  ]},
  { id: "be", label: "Belgium — RTBF / VRT", links: [
    { name: "RTBF Auvio", url: "https://auvio.rtbf.be" },
    { name: "VRT MAX", url: "https://www.vrt.be/vrtmax/" },
  ]},
  { id: "ch", label: "Switzerland — SRF / RTS", links: [
    { name: "SRF Play", url: "https://www.srf.ch/play" },
    { name: "RTS Play", url: "https://www.rts.ch/play/" },
  ]},
  { id: "at", label: "Austria — ORF", links: [
    { name: "ORF ON", url: "https://on.orf.at" },
  ]},
  { id: "se", label: "Sweden — SVT", links: [
    { name: "SVT Play", url: "https://www.svtplay.se" },
  ]},
  { id: "no", label: "Norway — NRK", links: [
    { name: "NRK TV", url: "https://tv.nrk.no" },
  ]},
];

const STAGES = ["All", "Groups", "R32", "R16", "QF", "SF", "3rd Place", "Final"];

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, "0");

function countdownParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtDateHeading(ts) {
  return new Date(ts).toLocaleDateString([], {
    weekday: "long", day: "numeric", month: "long",
  });
}
function isNightOwl(ts) {
  const h = new Date(ts).getHours();
  return h >= 23 || h < 7; // kickoff in your local dead of night
}

// ---------- components ----------
function Digits({ ms, big }) {
  const { d, h, m, s } = countdownParts(ms);
  const cell = (v, label) => (
    <div style={{ textAlign: "center" }}>
      <div style={{
        fontSize: big ? "0.65rem" : "0.52rem",
        letterSpacing: "0.15em", color: "#7C8BA1",
        textTransform: "uppercase", marginBottom: big ? 6 : 2,
      }}>{label}</div>
      <div style={{
        fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace",
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
        fontSize: big ? "clamp(2.2rem, 9vw, 4.2rem)" : "1.05rem",
        lineHeight: 1,
        color: "#FFD166",
        letterSpacing: big ? "0.02em" : 0,
      }}>{pad(v)}</div>
    </div>
  );
  const sep = (
    <div className={big ? "tick" : ""} style={{
      color: "#3A4A63", fontWeight: 600,
      fontSize: big ? "clamp(1.6rem, 6vw, 3rem)" : "1rem",
      fontFamily: "'IBM Plex Mono', monospace",
      paddingBottom: big ? 8 : 1,
    }}>:</div>
  );
  return (
    <div style={{ display: "flex", gap: big ? 14 : 5, alignItems: "flex-end", justifyContent: big ? "center" : "flex-end" }}>
      {d > 0 && <>{cell(d, "days")}{sep}</>}
      {cell(h, "hrs")}{sep}{cell(m, "min")}{sep}{cell(s, "sec")}
    </div>
  );
}

function StagePill({ m }) {
  const label = m.stage === "Groups" ? `Group ${m.g}` : m.stage === "Final" ? "Final" : `${m.stage} · M${m.g}`;
  return (
    <span style={{
      fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase",
      color: "#8FB89F", border: "1px solid #24513A", borderRadius: 3,
      padding: "2px 7px", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

export default function App() {
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState("upcoming");
  const [country, setCountry] = useState("is");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("All");
  const [revealYT, setRevealYT] = useState(false);
  const [api, setApi] = useState({ enabled: false, byTime: {} });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch live matchups + statuses from our own server (scores are
  // stripped server-side, so nothing here can spoil a result).
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/matches");
        const data = await r.json();
        if (!alive || !data.enabled) return;
        const byTime = {};
        data.matches.forEach((m) => { byTime[m.utcDate] = m; });
        setApi({ enabled: true, byTime });
      } catch {
        /* API unavailable — site keeps working with the built-in schedule */
      }
    };
    load();
    const id = setInterval(load, 15 * 60 * 1000); // refresh every 15 min
    return () => { alive = false; clearInterval(id); };
  }, []);

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const end = (m) => m.kickoff + MATCH_MINUTES * 60 * 1000;

  // Merge live data: fill in knockout team names once the bracket is decided.
  const merged = useMemo(() => {
    return MATCHES.map((m) => {
      const a = api.byTime[m.t];
      if (!a) return m;
      const out = { ...m, apiStatus: a.status };
      if (m.stage !== "Groups") {
        if (a.home) out.home = a.home;
        if (a.away) out.away = a.away;
      }
      return out;
    });
  }, [api]);

  const isLive = (m) => m.apiStatus
    ? (m.apiStatus === "IN_PLAY" || m.apiStatus === "PAUSED")
    : (now >= m.kickoff && now < end(m));
  const isFinished = (m) => m.apiStatus
    ? m.apiStatus === "FINISHED"
    : now >= end(m);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged.filter((m) => {
      if (stage !== "All" && m.stage !== stage) return false;
      if (!q) return true;
      return [m.home, m.away, m.venue, m.city].join(" ").toLowerCase().includes(q);
    });
  }, [merged, query, stage]);

  const live = filtered.filter((m) => isLive(m));
  const upcoming = filtered.filter((m) => !isLive(m) && !isFinished(m) && now < end(m));
  const finished = filtered.filter((m) => isFinished(m)).sort((a, b) => b.kickoff - a.kickoff);
  const nextMatch = upcoming[0];

  const groupByDay = (list) => {
    const out = [];
    let key = null;
    list.forEach((m) => {
      const k = fmtDateKey(m.kickoff);
      if (k !== key) { key = k; out.push({ key: k, ts: m.kickoff, items: [] }); }
      out[out.length - 1].items.push(m);
    });
    return out;
  };

  const countryData = COUNTRIES.find((c) => c.id === country);

  const S = {
    page: {
      minHeight: "100vh", background: "#0B1220", color: "#E8EDF4",
      fontFamily: "'Archivo', system-ui, sans-serif",
      backgroundImage: "radial-gradient(ellipse 80% 40% at 50% -5%, rgba(255,209,102,0.10), transparent 70%)",
    },
    wrap: { maxWidth: 860, margin: "0 auto", padding: "0 16px 80px" },
    card: {
      background: "#121C2E", border: "1px solid #1E2B42", borderRadius: 10,
      padding: "14px 16px",
    },
    tabBtn: (active) => ({
      flex: 1, padding: "12px 8px", background: active ? "#121C2E" : "transparent",
      border: "1px solid " + (active ? "#2F9E68" : "#1E2B42"),
      borderRadius: 8, color: active ? "#E8EDF4" : "#7C8BA1",
      fontFamily: "inherit", fontWeight: 700, fontSize: "0.85rem",
      cursor: "pointer", letterSpacing: "0.03em",
    }),
    chip: (active) => ({
      padding: "5px 11px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 600,
      border: "1px solid " + (active ? "#FFD166" : "#1E2B42"),
      background: active ? "rgba(255,209,102,0.12)" : "transparent",
      color: active ? "#FFD166" : "#7C8BA1", cursor: "pointer", fontFamily: "inherit",
      whiteSpace: "nowrap",
    }),
    input: {
      width: "100%", boxSizing: "border-box", padding: "10px 12px",
      background: "#0E1626", border: "1px solid #1E2B42", borderRadius: 8,
      color: "#E8EDF4", fontFamily: "inherit", fontSize: "0.9rem", outline: "none",
    },
  };

  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* ---------- header ---------- */}
        <header style={{ padding: "34px 0 18px", borderBottom: "2px solid #2F9E68" }}>
          <div style={{ fontSize: "0.68rem", letterSpacing: "0.3em", color: "#2F9E68", textTransform: "uppercase", fontWeight: 700 }}>
            World Cup 2026 · USA · Canada · Mexico
          </div>
          <h1 style={{ fontWeight: 900, fontSize: "clamp(1.9rem, 7vw, 3rem)", margin: "6px 0 4px", letterSpacing: "-0.02em" }}>
            SPORTACLOCK
          </h1>
          <div style={{ fontWeight: 700, fontSize: "1rem", letterSpacing: "0.06em", marginBottom: 6 }}>
            <span style={{ color: "#E8EDF4" }}>Ready.</span>{" "}
            <span style={{ color: "#FFD166", fontFamily: "'IBM Plex Mono', monospace" }}>Tick.</span>{" "}
            <span style={{ color: "#2F9E68" }}>Kick.</span>
          </div>
          <div style={{ color: "#7C8BA1", fontSize: "0.85rem" }}>
            Every kickoff, counted down in your time · spoiler-free catch-up for the ones you slept through
          </div>
          <div style={{ color: "#3A4A63", fontSize: "0.72rem", marginTop: 6 }}>
            All times shown in your timezone: {tz}
            {api.enabled && <span style={{ color: "#2F9E68" }}> · ● live bracket updates on</span>}
          </div>
        </header>

        {/* ---------- next kickoff hero ---------- */}
        {tab === "upcoming" && nextMatch && (
          <section style={{ ...S.card, marginTop: 20, padding: "22px 16px 18px", borderColor: "#2A3A57" }}>
            <div style={{ textAlign: "center", fontSize: "0.65rem", letterSpacing: "0.25em", color: "#7C8BA1", textTransform: "uppercase", marginBottom: 10 }}>
              Next kickoff
            </div>
            <div style={{ textAlign: "center", fontWeight: 900, fontSize: "clamp(1.2rem, 5vw, 1.7rem)", marginBottom: 2 }}>
              {nextMatch.home} <span style={{ color: "#3A4A63", fontWeight: 500 }}>vs</span> {nextMatch.away}
            </div>
            <div style={{ textAlign: "center", color: "#7C8BA1", fontSize: "0.78rem", marginBottom: 16 }}>
              <StagePill m={nextMatch} /> &nbsp; {nextMatch.venue}, {nextMatch.city} · {fmtTime(nextMatch.kickoff)} your time
            </div>
            <Digits ms={nextMatch.kickoff - now} big />
          </section>
        )}

        {/* ---------- live now ---------- */}
        {live.length > 0 && (
          <section style={{ marginTop: 16 }}>
            {live.map((m) => (
              <div key={m.id} style={{ ...S.card, borderColor: "#E25C5C", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{m.home} vs {m.away}</div>
                  <div style={{ color: "#7C8BA1", fontSize: "0.74rem" }}>{m.venue}, {m.city}</div>
                </div>
                <span style={{ color: "#E25C5C", fontWeight: 900, fontSize: "0.75rem", letterSpacing: "0.18em", animation: "pulse 1.4s infinite" }}>● LIVE</span>
              </div>
            ))}
          </section>
        )}

        {/* ---------- tabs ---------- */}
        <nav style={{ display: "flex", gap: 8, margin: "18px 0 14px" }}>
          <button style={S.tabBtn(tab === "upcoming")} onClick={() => setTab("upcoming")}>
            Upcoming ({upcoming.length})
          </button>
          <button style={S.tabBtn(tab === "catchup")} onClick={() => setTab("catchup")}>
            🛡 Catch up — spoiler free ({finished.length})
          </button>
        </nav>

        {/* ---------- filters ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          <input
            style={S.input}
            placeholder="Filter by team, stadium, or city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {STAGES.map((s) => (
              <button key={s} style={S.chip(stage === s)} onClick={() => setStage(s)}>{s}</button>
            ))}
          </div>
        </div>

        {/* ---------- UPCOMING ---------- */}
        {tab === "upcoming" && (
          <section>
            {upcoming.length === 0 && (
              <div style={{ ...S.card, color: "#7C8BA1", textAlign: "center" }}>
                No upcoming matches found. Clear the filter to see the full schedule.
              </div>
            )}
            {groupByDay(upcoming).map((day) => (
              <div key={day.key} style={{ marginBottom: 22 }}>
                <div style={{
                  fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "#2F9E68", fontWeight: 700, borderBottom: "1px solid #1E2B42",
                  paddingBottom: 6, marginBottom: 8,
                }}>
                  {fmtDateHeading(day.ts)}
                </div>
                {day.items.map((m) => (
                  <div key={m.id} style={{ ...S.card, marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                          <StagePill m={m} />
                          {isNightOwl(m.kickoff) && (
                            <span style={{ fontSize: "0.62rem", color: "#FFD166", letterSpacing: "0.1em" }}>🌙 NIGHT OWL</span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                          {m.home} <span style={{ color: "#3A4A63", fontWeight: 500 }}>vs</span> {m.away}
                        </div>
                        <div style={{ color: "#7C8BA1", fontSize: "0.72rem", marginTop: 2 }}>
                          {fmtTime(m.kickoff)} · {m.venue}, {m.city}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <Digits ms={m.kickoff - now} />
                        <div style={{ fontSize: "0.6rem", color: "#3A4A63", textAlign: "right", marginTop: 3, letterSpacing: "0.1em" }}>
                          TO KICKOFF
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </section>
        )}

        {/* ---------- CATCH UP (spoiler free) ---------- */}
        {tab === "catchup" && (
          <section>
            <div style={{ ...S.card, marginBottom: 16, borderColor: "#24513A", background: "rgba(47,158,104,0.06)" }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 4 }}>🛡 Spoiler shield is on</div>
              <div style={{ color: "#9FB0C6", fontSize: "0.78rem", lineHeight: 1.5 }}>
                No scores, no results — only which matches have finished. Pick your country below and
                jump straight to your broadcaster's player to watch the full replay. Availability depends
                on broadcast rights in your country.
              </div>
              <div style={{ marginTop: 12 }}>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  style={{ ...S.input, cursor: "pointer" }}
                >
                  {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: "0.74rem", color: "#7C8BA1", cursor: "pointer" }}>
                <input type="checkbox" checked={revealYT} onChange={(e) => setRevealYT(e.target.checked)} />
                Also show YouTube highlight search links (⚠ thumbnails and titles can spoil results)
              </label>
            </div>

            {finished.length === 0 && (
              <div style={{ ...S.card, color: "#7C8BA1", textAlign: "center" }}>
                Nothing to catch up on yet — no matches have finished. Sleep easy. 🌙
              </div>
            )}

            {finished.map((m) => (
              <div key={m.id} style={{ ...S.card, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                  <StagePill m={m} />
                  <span style={{ fontSize: "0.62rem", color: "#7C8BA1", letterSpacing: "0.1em" }}>
                    FULL TIME · played {fmtDateHeading(m.kickoff)}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 8 }}>
                  {m.home} <span style={{ color: "#3A4A63", fontWeight: 500 }}>vs</span> {m.away}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {countryData.links.map((l) => (
                    <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                      fontSize: "0.74rem", fontWeight: 700, textDecoration: "none",
                      color: "#0B1220", background: "#FFD166", borderRadius: 5,
                      padding: "7px 12px",
                    }}>
                      ▶ Replay on {l.name}
                    </a>
                  ))}
                  {revealYT && (
                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(m.home + " vs " + m.away + " world cup 2026 highlights")}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        fontSize: "0.74rem", fontWeight: 700, textDecoration: "none",
                        color: "#E8EDF4", border: "1px solid #3A4A63", borderRadius: 5,
                        padding: "6px 12px",
                      }}
                    >
                      ⚠ YouTube highlights
                    </a>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        <footer style={{ marginTop: 40, color: "#3A4A63", fontSize: "0.68rem", lineHeight: 1.6 }}>
          Sportaclock · Ready. Tick. Kick. — Schedule: FIFA World Cup 2026 official kickoff times (announced in ET,
          converted automatically to your device's timezone). Knockout matchups fill in automatically from
          football-data.org as the bracket is decided; scores are stripped on the server so they can never appear here.
          If live data is off, a match is treated as finished ~2¼ hours after kickoff.
        </footer>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
        @keyframes tick { 0%,49% { opacity: 1 } 50%,100% { opacity: 0.25 } }
        .tick { animation: tick 1s steps(1) infinite }
        ::selection { background: #FFD166; color: #0B1220 }
        select option { background: #121C2E }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
      `}</style>
    </div>
  );
}
