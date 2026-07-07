import React, { useState, useEffect, useMemo } from "react";

/* ============================================================
   SPORTACLOCK — Ready. Tick. Kick.
   Now multi-sport: ⚽ World Cup · 🏎 F1 · 🏈 NFL · ⛳ Golf
   Same clock, same look — pick your sport up top.
   All start times stored in UTC.
   ============================================================ */

// ---------- WORLD CUP DATA (unchanged) ----------
const M = (t, g, home, away, venue, city, stage = "Groups") => ({
  t, g, home, away, venue, city, stage,
});

const WC_MATCHES = [
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
];

// ---------- F1 2026 — every session of the remaining rounds ----------
// Practice, sprint qualifying, sprint, qualifying (sets the grid), race.
// All session start times in UTC.
const F1_STAGE = {
  "Practice 1": "Practice", "Practice 2": "Practice", "Practice 3": "Practice",
  "Sprint Qualifying": "Sprint", "Sprint": "Sprint",
  "Qualifying": "Qualifying", "Race": "Race",
};
const F1_DUR = { // minutes, incl. a small buffer
  "Practice 1": 75, "Practice 2": 75, "Practice 3": 75,
  "Sprint Qualifying": 60, "Sprint": 60, "Qualifying": 75, "Race": 165,
};
const W = (round, name, venue, city, sessions, note = "") =>
  sessions.map(([t, kind]) => ({
    t,
    title: `${name} — ${kind}`,
    venue, city,
    tag: kind,
    stage: F1_STAGE[kind],
    dur: F1_DUR[kind],
    sub: [`Round ${round}`, note].filter(Boolean).join(" · "),
  }));

const F1_RACES = [
  ...W(9, "British GP", "Silverstone Circuit", "United Kingdom", [
    ["2026-07-03T10:30:00Z","Practice 1"], ["2026-07-03T14:30:00Z","Sprint Qualifying"],
    ["2026-07-04T10:00:00Z","Sprint"], ["2026-07-04T14:00:00Z","Qualifying"],
    ["2026-07-05T14:00:00Z","Race"],
  ], "Sprint weekend"),
  ...W(10, "Belgian GP", "Spa-Francorchamps", "Belgium", [
    ["2026-07-17T11:30:00Z","Practice 1"], ["2026-07-17T15:00:00Z","Practice 2"],
    ["2026-07-18T10:30:00Z","Practice 3"], ["2026-07-18T14:00:00Z","Qualifying"],
    ["2026-07-19T13:00:00Z","Race"],
  ]),
  ...W(11, "Hungarian GP", "Hungaroring", "Budapest", [
    ["2026-07-24T11:30:00Z","Practice 1"], ["2026-07-24T15:00:00Z","Practice 2"],
    ["2026-07-25T10:30:00Z","Practice 3"], ["2026-07-25T14:00:00Z","Qualifying"],
    ["2026-07-26T13:00:00Z","Race"],
  ], "Last round before the summer break"),
  ...W(12, "Dutch GP", "Circuit Zandvoort", "Netherlands", [
    ["2026-08-21T10:30:00Z","Practice 1"], ["2026-08-21T14:30:00Z","Sprint Qualifying"],
    ["2026-08-22T10:00:00Z","Sprint"], ["2026-08-22T14:00:00Z","Qualifying"],
    ["2026-08-23T13:00:00Z","Race"],
  ], "Sprint weekend · Zandvoort's final year"),
  ...W(13, "Italian GP", "Autodromo Nazionale Monza", "Monza", [
    ["2026-09-04T10:30:00Z","Practice 1"], ["2026-09-04T14:00:00Z","Practice 2"],
    ["2026-09-05T10:30:00Z","Practice 3"], ["2026-09-05T14:00:00Z","Qualifying"],
    ["2026-09-06T13:00:00Z","Race"],
  ]),
  ...W(14, "Spanish GP", "Madring", "Madrid", [
    ["2026-09-11T11:30:00Z","Practice 1"], ["2026-09-11T15:00:00Z","Practice 2"],
    ["2026-09-12T10:30:00Z","Practice 3"], ["2026-09-12T14:00:00Z","Qualifying"],
    ["2026-09-13T13:00:00Z","Race"],
  ], "Madrid's debut race"),
  ...W(15, "Azerbaijan GP", "Baku City Circuit", "Baku", [
    ["2026-09-24T08:30:00Z","Practice 1"], ["2026-09-24T12:00:00Z","Practice 2"],
    ["2026-09-25T08:30:00Z","Practice 3"], ["2026-09-25T12:00:00Z","Qualifying"],
    ["2026-09-26T11:00:00Z","Race"],
  ], "Thu–Sat schedule, Saturday race"),
  ...W(16, "Singapore GP", "Marina Bay Street Circuit", "Singapore", [
    ["2026-10-09T09:30:00Z","Practice 1"], ["2026-10-09T13:30:00Z","Sprint Qualifying"],
    ["2026-10-10T09:30:00Z","Sprint"], ["2026-10-10T13:00:00Z","Qualifying"],
    ["2026-10-11T12:00:00Z","Race"],
  ], "Sprint weekend · night race"),
  ...W(17, "United States GP", "Circuit of the Americas", "Austin", [
    ["2026-10-23T17:30:00Z","Practice 1"], ["2026-10-23T21:00:00Z","Practice 2"],
    ["2026-10-24T17:30:00Z","Practice 3"], ["2026-10-24T21:00:00Z","Qualifying"],
    ["2026-10-25T19:00:00Z","Race"],
  ]),
  ...W(18, "Mexico City GP", "Autódromo Hermanos Rodríguez", "Mexico City", [
    ["2026-10-30T18:30:00Z","Practice 1"], ["2026-10-30T22:00:00Z","Practice 2"],
    ["2026-10-31T17:30:00Z","Practice 3"], ["2026-10-31T21:00:00Z","Qualifying"],
    ["2026-11-01T20:00:00Z","Race"],
  ]),
  ...W(19, "São Paulo GP", "Interlagos", "São Paulo", [
    ["2026-11-06T14:30:00Z","Practice 1"], ["2026-11-06T18:00:00Z","Practice 2"],
    ["2026-11-07T14:30:00Z","Practice 3"], ["2026-11-07T18:00:00Z","Qualifying"],
    ["2026-11-08T17:00:00Z","Race"],
  ]),
  ...W(20, "Las Vegas GP", "Las Vegas Strip Circuit", "Las Vegas", [
    ["2026-11-20T00:30:00Z","Practice 1"], ["2026-11-20T04:00:00Z","Practice 2"],
    ["2026-11-21T00:30:00Z","Practice 3"], ["2026-11-21T04:00:00Z","Qualifying"],
    ["2026-11-22T04:00:00Z","Race"],
  ], "Saturday night race, local time"),
  ...W(21, "Qatar GP", "Lusail International Circuit", "Lusail", [
    ["2026-11-27T13:30:00Z","Practice 1"], ["2026-11-27T17:00:00Z","Practice 2"],
    ["2026-11-28T13:30:00Z","Practice 3"], ["2026-11-28T17:00:00Z","Qualifying"],
    ["2026-11-29T16:00:00Z","Race"],
  ]),
  ...W(22, "Abu Dhabi GP", "Yas Marina Circuit", "Abu Dhabi", [
    ["2026-12-04T09:30:00Z","Practice 1"], ["2026-12-04T13:00:00Z","Practice 2"],
    ["2026-12-05T10:30:00Z","Practice 3"], ["2026-12-05T14:00:00Z","Qualifying"],
    ["2026-12-06T13:00:00Z","Race"],
  ], "Season finale"),
];

// ---------- NFL 2026 — marquee games & season milestones ----------
const NF = (t, title, venue, city, tag = "Regular season", sub = "") =>
  ({ t, title, venue, city, tag, sub, stage: tag });

const NFL_EVENTS = [
  NF("2026-08-07T00:00:00Z","Panthers vs Cardinals","Tom Benson HOF Stadium","Canton","Preseason","Hall of Fame Game — preseason begins"),
  NF("2026-09-10T00:20:00Z","Seahawks vs Patriots","Lumen Field","Seattle","Regular season","NFL Kickoff Game — Super Bowl LX rematch"),
  NF("2026-09-13T02:30:00Z","Rams vs 49ers","Melbourne","Australia","Regular season","First-ever NFL game in Australia (kickoff time provisional)"),
  NF("2026-09-14T00:20:00Z","Giants vs Cowboys","MetLife Stadium","East Rutherford","Regular season","Sunday Night Football — Week 1"),
  NF("2026-09-15T00:15:00Z","Chiefs vs Broncos","Arrowhead Stadium","Kansas City","Regular season","Monday Night Football — Week 1"),
  NF("2026-10-26T00:20:00Z","Seahawks vs Chiefs","Lumen Field","Seattle","Regular season","Kenneth Walker III returns to Seattle — SNF"),
  NF("2026-11-26T18:00:00Z","Lions vs Bears","Ford Field","Detroit","Regular season","Thanksgiving Day — early game"),
  NF("2026-11-26T21:30:00Z","Cowboys vs Eagles","AT&T Stadium","Arlington","Regular season","Thanksgiving Day — afternoon game"),
  NF("2026-11-27T01:20:00Z","Bills vs Chiefs","Highmark Stadium","Orchard Park","Regular season","Thanksgiving night — Allen vs Mahomes"),
  NF("2026-12-25T18:00:00Z","Packers vs Bears","Christmas tripleheader","kickoff time TBC","Regular season","Christmas Day game 1"),
  NF("2026-12-25T21:30:00Z","Bills vs Broncos","Christmas tripleheader","kickoff time TBC","Regular season","Christmas Day game 2"),
  NF("2026-12-26T01:15:00Z","Rams vs Seahawks","Christmas tripleheader","kickoff time TBC","Regular season","Christmas Day game 3"),
  NF("2027-01-10T18:00:00Z","Week 18 — final Sunday","League-wide","all division games","Regular season","Regular season ends today"),
  NF("2027-01-16T18:00:00Z","Wild Card weekend begins","League-wide","","Playoffs","The road to the Super Bowl starts here"),
  NF("2027-02-14T23:30:00Z","Super Bowl LXI","SoFi Stadium","Inglewood","Super Bowl","Valentine's Day Super Bowl"),
];

// ---------- GOLF 2026 — remaining men's events Rory McIlroy is eligible for ----------
// PGA Tour + DP World Tour + majors. Countdown is to Round 1's first tee.
// (No Ryder Cup in 2026 — next is 2027 at Adare Manor. Presidents Cup excludes Europeans.)
const G = (t, title, venue, city, tag = "PGA Tour", sub = "") =>
  ({ t, title, venue, city, tag, sub, stage: tag });

const GOLF_EVENTS = [
  G("2026-07-09T06:00:00Z","Genesis Scottish Open","The Renaissance Club","North Berwick","PGA + DPWT","Rolex Series · Jul 9–12"),
  G("2026-07-09T11:30:00Z","ISCO Championship","Hurstbourne Country Club","Louisville","PGA + DPWT","Co-sanctioned · Jul 9–12"),
  G("2026-07-16T05:35:00Z","The Open Championship","Royal Birkdale","Southport","Major","The 154th Open · Jul 16–19"),
  G("2026-07-16T11:00:00Z","Corales Puntacana Championship","Puntacana Resort & Club","Dominican Republic","PGA + DPWT","Co-sanctioned · Jul 16–19"),
  G("2026-07-30T11:00:00Z","Rocket Classic","Detroit Golf Club","Detroit","PGA Tour","Jul 30 – Aug 2"),
  G("2026-08-06T11:00:00Z","Wyndham Championship","Sedgefield Country Club","Greensboro","PGA Tour","Last event of the regular season · Aug 6–9"),
  G("2026-08-13T13:00:00Z","FedEx St. Jude Championship","TPC Southwind","Memphis","Playoffs","FedExCup Playoffs 1 of 3 · Aug 13–16"),
  G("2026-08-20T13:00:00Z","BMW Championship","Bellerive Country Club","St. Louis","Playoffs","FedExCup Playoffs 2 of 3 · Aug 20–23"),
  G("2026-08-27T06:00:00Z","Betfred British Masters","The Belfry","Sutton Coldfield","DP World Tour","Aug 27–30"),
  G("2026-08-27T15:00:00Z","Tour Championship","East Lake Golf Club","Atlanta","Playoffs","FedExCup finale · Aug 27–30"),
  G("2026-09-10T06:00:00Z","Amgen Irish Open","Trump International Golf Links","Doonbeg","DP World Tour","Rory defends his title at home · Sep 10–13"),
  G("2026-09-17T06:00:00Z","BMW PGA Championship","Wentworth Club","Virginia Water","DP World Tour","Rolex Series flagship · Sep 17–20"),
  G("2026-11-05T03:30:00Z","Abu Dhabi Championship","Yas Links","Abu Dhabi","DP World Tour","Play-Offs · Nov 5–8"),
  G("2026-11-12T03:30:00Z","DP World Tour Championship","Jumeirah Golf Estates","Dubai","DP World Tour","Race to Dubai finale · Nov 12–15"),
];

// ---------- SPORT CONFIG ----------
const SPORTS = {
  football: {
    icon: "⚽", label: "Football",
    eyebrow: "Football · pick your competition",
    nextLabel: "Next kickoff", clockLabel: "TO KICKOFF",
    durationMin: 135,
    stages: ["All"],
    replays: null, // per-league below
  },
  f1: {
    icon: "🏎", label: "F1",
    eyebrow: "Formula 1 2026 · 22 rounds · every session",
    nextLabel: "Next on track", clockLabel: "TO SESSION START",
    durationMin: 165,
    stages: ["All","Race","Qualifying","Sprint","Practice"],
    replays: [
      { name: "F1 TV", url: "https://f1tv.formula1.com" },
      { name: "Sky Sports F1 (UK)", url: "https://www.skysports.com/watch/sky-sports-f1" },
    ],
  },
  nfl: {
    icon: "🏈", label: "NFL",
    eyebrow: "NFL 2026 · 107th season · every game",
    nextLabel: "Next kickoff", clockLabel: "TO KICKOFF",
    durationMin: 210,
    stages: ["All","Preseason","Regular season","Playoffs","Super Bowl"],
    replays: [
      { name: "NFL Game Pass (DAZN)", url: "https://www.dazn.com/en-IS/l/nfl-game-pass" },
      { name: "NFL+", url: "https://www.nfl.com/plus/" },
    ],
  },
  golf: {
    icon: "⛳", label: "Golf",
    eyebrow: "Men's golf 2026 · every event Rory McIlroy can tee up in",
    nextLabel: "Next tee-off", clockLabel: "TO ROUND 1",
    durationMin: 5100, // ~3.5 days: Thursday R1 → Sunday finish
    stages: ["All","Major","Playoffs","PGA Tour","PGA + DPWT","DP World Tour"],
    replays: [
      { name: "Sky Sports Golf (UK)", url: "https://www.skysports.com/golf" },
      { name: "PGA Tour Live (ESPN+)", url: "https://www.espn.com/watch/collections/25502/pga-tour-live" },
    ],
  },
};

const SPORT_EVENTS = {
  football: WC_MATCHES, // used by the World Cup league (merged with live API data)
  f1: F1_RACES,
  nfl: NFL_EVENTS,
  golf: GOLF_EVENTS,
};

// ---------- FOOTBALL LEAGUES (inside the ⚽ Football tab) ----------
const LEAGUES = {
  wc: {
    label: "World Cup", comp: "WC",
    eyebrow: "World Cup 2026 · USA · Canada · Mexico",
    stages: ["All","Groups","R32","R16","QF","SF","3rd Place","Final"],
  },
  pl: {
    label: "Premier League", comp: "PL",
    eyebrow: "Premier League 2026–27 · every match, live schedule",
    stages: ["All"],
  },
  cl: {
    label: "Champions League", comp: "CL",
    eyebrow: "UEFA Champions League 2026–27 · live schedule",
    stages: ["All","League Phase","Playoffs","R16","QF","SF","Final"],
  },
  is: {
    label: "Iceland", comp: "IS",
    eyebrow: "Úrvalsdeild karla 2026 · Iceland's top flight · live schedule",
    stages: ["All"],
  },
};

// football-data.org stage codes → friendly Champions League labels
const CL_STAGE = {
  LEAGUE_STAGE: "League Phase",
  PLAYOFFS: "Playoffs",
  LAST_16: "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS: "SF",
  FINAL: "Final",
};

// Replay links for the non-World-Cup leagues (WC keeps its country picker)
const LEAGUE_REPLAYS = {
  pl: [
    { name: "Sky Sports (UK)", url: "https://www.skysports.com/premier-league" },
    { name: "Peacock (US)", url: "https://www.peacocktv.com/sports/premier-league" },
  ],
  cl: [
    { name: "TNT Sports (UK)", url: "https://www.tntsports.co.uk/football/champions-league" },
    { name: "Paramount+ (US)", url: "https://www.paramountplus.com" },
  ],
  is: [
    { name: "Vodafone Sport (IS)", url: "https://www.vodafone.is/sjonvarp/sport/" },
    { name: "RÚV dagskrá (IS)", url: "https://www.ruv.is/sjonvarp/dagskra/ruv" },
  ],
};

// ---------- Broadcaster presets for World Cup replays ----------
const COUNTRIES = [
  { id: "is", label: "Iceland — RÚV", links: [
    { name: "RÚV dagskrá (this match's day)", url: (m) => `https://www.ruv.is/sjonvarp/dagskra/ruv/${ruvDate(m.t)}` },
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
  return h >= 23 || h < 7;
}
function ruvDate(t) {
  const d = new Date(new Date(t).getTime() - 4 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Event display name: WC uses home/away, other sports a title.
// If a title contains " vs ", it gets the same styled separator.
function EventName({ ev, size = "0.95rem" }) {
  const sep = <span style={{ color: "#3A4A63", fontWeight: 500 }}> vs </span>;
  if (ev.home) return (
    <span style={{ fontWeight: 700, fontSize: size }}>{ev.home}{sep}{ev.away}</span>
  );
  const parts = ev.title.split(" vs ");
  return (
    <span style={{ fontWeight: 700, fontSize: size }}>
      {parts[0]}{parts.length > 1 && <>{sep}{parts[1]}</>}
    </span>
  );
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
  const label = m.g != null
    ? (m.stage === "Groups" ? `Group ${m.g}` : m.stage === "Final" ? "Final" : `${m.stage} · M${m.g}`)
    : m.tag;
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
  const [sport, setSport] = useState("football");
  const [league, setLeague] = useState("wc");
  const [tab, setTab] = useState("upcoming");
  const [country, setCountry] = useState("is");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("All");
  const [teamFilter, setTeamFilter] = useState(null);
  const [revealYT, setRevealYT] = useState(false);
  const [football, setFootball] = useState({
    wc: { enabled: false, matches: [] },
    pl: { enabled: false, matches: [] },
    cl: { enabled: false, matches: [] },
    is: { enabled: false, matches: [] },
  });
  const [nflApi, setNflApi] = useState({ enabled: false, events: [] });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Live football data for all three leagues (scores stripped server-side).
  // WC merges into the built-in bracket; PL & CL are fully API-driven.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      for (const [key, cfg] of Object.entries(LEAGUES)) {
        try {
          const r = await fetch(`/api/football/${cfg.comp}`);
          const data = await r.json();
          if (!alive || !data.enabled) continue;
          setFootball((prev) => ({ ...prev, [key]: { enabled: true, matches: data.matches } }));
        } catch { /* site keeps working with whatever it has */ }
      }
    };
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Full NFL schedule from our own server (ESPN data, scores stripped
  // server-side). Falls back to the built-in marquee list if unavailable.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/nfl");
        const data = await r.json();
        if (!alive || !data.enabled || !data.events?.length) return;
        setNflApi({ enabled: true, events: data.events });
      } catch { /* fallback schedule keeps working */ }
    };
    load();
    const id = setInterval(load, 60 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const cfg = SPORTS[sport];
  const leagueCfg = sport === "football" ? LEAGUES[league] : null;
  const stages = leagueCfg ? leagueCfg.stages : cfg.stages;
  const eyebrow = leagueCfg ? leagueCfg.eyebrow : cfg.eyebrow;
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const events = useMemo(() => {
    // NFL: prefer the full live schedule from /api/nfl (272 games)
    if (sport === "nfl" && nflApi.enabled) {
      return nflApi.events.map((e) => ({
        t: e.date,
        home: e.home, away: e.away,
        homeCrest: e.homeLogo, awayCrest: e.awayLogo,
        venue: e.venue, city: e.city,
        tag: e.tag, stage: e.tag,
        sub: e.label,
        apiStatus: e.state === "in" ? "IN_PLAY" : e.state === "post" ? "FINISHED" : undefined,
        id: `nfl-${e.id}`,
        kickoff: new Date(e.date).getTime(),
      }));
    }
    // Football — Premier League & Champions League: fully API-driven
    if (sport === "football" && league !== "wc") {
      return (football[league].matches || [])
        .map((m, i) => {
          const stageLbl = league === "cl"
            ? (CL_STAGE[m.stage] || "League Phase")
            : "Regular season";
          const tag = (league === "pl" || league === "is")
            ? (m.matchday ? `Matchday ${m.matchday}` : leagueCfg.label)
            : (stageLbl === "League Phase" && m.matchday ? `League Phase · MD${m.matchday}` : stageLbl);
          return {
            t: m.utcDate,
            home: m.home || "TBD", away: m.away || "TBD",
            homeCrest: m.homeCrest, awayCrest: m.awayCrest,
            venue: "", city: "",
            tag, stage: stageLbl, sub: "",
            apiStatus: m.status,
            id: `${league}-${i}`,
            kickoff: new Date(m.utcDate).getTime(),
          };
        })
        .sort((a, b) => a.kickoff - b.kickoff);
    }
    // World Cup (and everything else): built-in schedule, WC merged with API
    const base = SPORT_EVENTS[sport].map((m, i) => ({
      ...m, id: `${sport}-${i}`, kickoff: new Date(m.t).getTime(),
    }));
    if (!(sport === "football" && league === "wc")) return base;
    const byTime = {};
    (football.wc.matches || []).forEach((m) => { byTime[m.utcDate] = m; });
    return base.map((m) => {
      const a = byTime[m.t];
      if (!a) return m;
      const out = { ...m, apiStatus: a.status };
      if (m.stage !== "Groups") {
        if (a.home) out.home = a.home;
        if (a.away) out.away = a.away;
      }
      return out;
    });
  }, [sport, league, football, nflApi]);

  const end = (m) => m.kickoff + (m.dur || cfg.durationMin) * 60 * 1000;
  const isLive = (m) => m.apiStatus
    ? (m.apiStatus === "IN_PLAY" || m.apiStatus === "PAUSED")
    : (now >= m.kickoff && now < end(m));
  const isFinished = (m) => m.apiStatus
    ? m.apiStatus === "FINISHED"
    : now >= end(m);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((m) => {
      if (stage !== "All" && m.stage !== stage) return false;
      if (teamFilter && m.home !== teamFilter && m.away !== teamFilter) return false;
      if (!q) return true;
      return [m.home, m.away, m.title, m.sub, m.venue, m.city]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [events, query, stage, teamFilter]);

  // ---- clickable team logo bar (Premier League + NFL only) ----
  const teamBar = useMemo(() => {
    let source = null, first = null;
    if (sport === "football" && league === "pl" && football.pl.enabled) {
      source = events; first = "Liverpool";
    } else if (sport === "nfl" && nflApi.enabled) {
      source = events; first = "Eagles";
    }
    if (!source) return [];
    const map = new Map();
    source.forEach((m) => {
      if (m.home && m.homeCrest && !map.has(m.home)) map.set(m.home, m.homeCrest);
      if (m.away && m.awayCrest && !map.has(m.away)) map.set(m.away, m.awayCrest);
    });
    const teams = [...map.entries()]
      .map(([name, crest]) => ({ name, crest }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const idx = teams.findIndex((t) => t.name.includes(first));
    if (idx > 0) teams.unshift(...teams.splice(idx, 1));
    return teams;
  }, [sport, league, events, football, nflApi]);

  const live = filtered.filter((m) => isLive(m));
  const upcoming = filtered.filter((m) => !isLive(m) && !isFinished(m) && now < end(m));
  const finished = filtered.filter((m) => isFinished(m)).sort((a, b) => b.kickoff - a.kickoff);
  const nextEvent = upcoming[0];

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
  const switchSport = (s) => { setSport(s); setStage("All"); setQuery(""); setTeamFilter(null); };
  const switchLeague = (l) => { setLeague(l); setStage("All"); setQuery(""); setTeamFilter(null); };

  const ytQuery = (m) => {
    const matchup = m.home ? `${m.home} vs ${m.away}` : m.title;
    const context =
      sport === "football"
        ? (league === "wc" ? "world cup 2026" : league === "pl" ? "premier league" : "champions league")
        : sport === "nfl" ? "NFL 2026" : "2026";
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${matchup} ${context} highlights`)}`;
  };

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
    sportBtn: (active) => ({
      flex: 1, padding: "10px 6px", background: active ? "rgba(255,209,102,0.10)" : "transparent",
      border: "1px solid " + (active ? "#FFD166" : "#1E2B42"),
      borderRadius: 8, color: active ? "#FFD166" : "#7C8BA1",
      fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem",
      cursor: "pointer", letterSpacing: "0.03em", whiteSpace: "nowrap",
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
            {eyebrow}
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
            Every start, counted down in your time · spoiler-free catch-up for the ones you slept through
          </div>
          <div style={{ color: "#3A4A63", fontSize: "0.72rem", marginTop: 6 }}>
            All times shown in your timezone: {tz}
            {sport === "football" && football[league].enabled && <span style={{ color: "#2F9E68" }}> · ● live fixture updates on</span>}
            {sport === "nfl" && nflApi.enabled && <span style={{ color: "#2F9E68" }}> · ● full 272-game schedule loaded</span>}
          </div>
        </header>

        {/* ---------- sport switcher ---------- */}
        <nav style={{ display: "flex", gap: 8, margin: "16px 0 0" }}>
          {Object.entries(SPORTS).map(([id, s]) => (
            <button key={id} style={S.sportBtn(sport === id)} onClick={() => switchSport(id)}>
              <span style={{ fontSize: "1rem", marginRight: 5 }}>{s.icon}</span>{s.label}
            </button>
          ))}
        </nav>

        {/* ---------- football league picker ---------- */}
        {sport === "football" && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
            {Object.entries(LEAGUES).map(([id, l]) => (
              <button key={id} style={S.chip(league === id)} onClick={() => switchLeague(id)}>
                {l.label}
              </button>
            ))}
          </div>
        )}

        {/* ---------- next event hero ---------- */}
        {tab === "upcoming" && nextEvent && (
          <section style={{ ...S.card, marginTop: 16, padding: "22px 16px 18px", borderColor: "#2A3A57" }}>
            <div style={{ textAlign: "center", fontSize: "0.65rem", letterSpacing: "0.25em", color: "#7C8BA1", textTransform: "uppercase", marginBottom: 10 }}>
              {cfg.nextLabel}
            </div>
            <div style={{ textAlign: "center", marginBottom: 2 }}>
              <EventName ev={nextEvent} size="clamp(1.2rem, 5vw, 1.7rem)" />
            </div>
            <div style={{ textAlign: "center", color: "#9FB0C6", fontSize: "0.9rem", marginBottom: 16 }}>
              <StagePill m={nextEvent} /> &nbsp; {nextEvent.venue ? `${nextEvent.venue}${nextEvent.city ? `, ${nextEvent.city}` : ""} · ` : ""}{fmtTime(nextEvent.kickoff)} your time
              {nextEvent.sub && <div style={{ marginTop: 4, color: "#8FB89F" }}>{nextEvent.sub}</div>}
            </div>
            <Digits ms={nextEvent.kickoff - now} big />
          </section>
        )}

        {/* ---------- live now ---------- */}
        {live.length > 0 && (
          <section style={{ marginTop: 16 }}>
            {live.map((m) => (
              <div key={m.id} style={{ ...S.card, borderColor: "#E25C5C", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div><EventName ev={m} /></div>
                  <div style={{ color: "#9FB0C6", fontSize: "0.88rem" }}>{m.venue}{m.city ? `, ${m.city}` : ""}</div>
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
            placeholder={sport === "football" ? "Filter by team, stadium, or city…" : "Filter by event, venue, or city…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {stages.length > 1 && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
              {stages.map((s) => (
                <button key={s} style={S.chip(stage === s)} onClick={() => setStage(s)}>{s}</button>
              ))}
            </div>
          )}
          {teamBar.length > 0 && (
            <div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 4 }}>
                {teamBar.map((t) => (
                  <button
                    key={t.name}
                    title={t.name}
                    onClick={() => setTeamFilter(teamFilter === t.name ? null : t.name)}
                    style={{
                      flexShrink: 0, padding: 5, borderRadius: 8, cursor: "pointer",
                      background: teamFilter === t.name ? "rgba(255,209,102,0.12)" : "transparent",
                      border: "1px solid " + (teamFilter === t.name ? "#FFD166" : "#1E2B42"),
                      opacity: teamFilter && teamFilter !== t.name ? 0.45 : 1,
                    }}
                  >
                    <img src={t.crest} alt={t.name} loading="lazy"
                      style={{ width: 26, height: 26, objectFit: "contain", display: "block" }} />
                  </button>
                ))}
              </div>
              {teamFilter && (
                <div style={{ fontSize: "0.72rem", color: "#FFD166", marginTop: 2 }}>
                  Showing only {teamFilter} — tap the logo again to see everyone
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---------- UPCOMING ---------- */}
        {tab === "upcoming" && (
          <section>
            {upcoming.length === 0 && (
              <div style={{ ...S.card, color: "#7C8BA1", textAlign: "center" }}>
                {sport === "football" && league !== "wc" && !football[league].enabled
                  ? "Fixtures load live from football-data.org — nothing yet. New-season schedules appear here as soon as they're announced."
                  : "No upcoming events found. Clear the filter to see the full schedule."}
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
                        <div><EventName ev={m} /></div>
                        <div style={{ color: "#9FB0C6", fontSize: "0.88rem", marginTop: 3 }}>
                          {fmtTime(m.kickoff)}{m.venue ? ` · ${m.venue}${m.city ? `, ${m.city}` : ""}` : ""}
                        </div>
                        {m.sub && (
                          <div style={{ color: "#8FB89F", fontSize: "0.82rem", marginTop: 2 }}>{m.sub}</div>
                        )}
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <Digits ms={m.kickoff - now} />
                        <div style={{ fontSize: "0.6rem", color: "#3A4A63", textAlign: "right", marginTop: 3, letterSpacing: "0.1em" }}>
                          {cfg.clockLabel}
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
                No results shown — only which events have finished. Jump straight to a replay.
                Availability depends on broadcast rights in your country.
              </div>
              {sport === "football" && league === "wc" && (
                <div style={{ marginTop: 12 }}>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    style={{ ...S.input, cursor: "pointer" }}
                  >
                    {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: "0.74rem", color: "#7C8BA1", cursor: "pointer" }}>
                <input type="checkbox" checked={revealYT} onChange={(e) => setRevealYT(e.target.checked)} />
                Also show YouTube highlight search links (⚠ thumbnails and titles can spoil results)
              </label>
            </div>

            {finished.length === 0 && (
              <div style={{ ...S.card, color: "#7C8BA1", textAlign: "center" }}>
                Nothing to catch up on yet — no events have finished. Sleep easy. 🌙
              </div>
            )}

            {finished.map((m) => (
              <div key={m.id} style={{ ...S.card, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                  <StagePill m={m} />
                  <span style={{ fontSize: "0.62rem", color: "#7C8BA1", letterSpacing: "0.1em" }}>
                    FINISHED · {fmtDateHeading(m.kickoff)}
                  </span>
                </div>
                <div style={{ marginBottom: 8 }}><EventName ev={m} /></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(sport === "football"
                    ? (league === "wc" ? countryData.links : LEAGUE_REPLAYS[league])
                    : cfg.replays
                  ).map((l) => (
                    <a key={l.name} href={typeof l.url === "function" ? l.url(m) : l.url} target="_blank" rel="noopener noreferrer" style={{
                      fontSize: "0.74rem", fontWeight: 700, textDecoration: "none",
                      color: "#0B1220", background: "#FFD166", borderRadius: 5,
                      padding: "7px 12px",
                    }}>
                      ▶ Replay on {l.name}
                    </a>
                  ))}
                  {revealYT && (
                    <a
                      href={ytQuery(m)}
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
          Sportaclock · Ready. Tick. Kick. — Football: World Cup kickoff times are official FIFA, with knockout matchups
          filling in automatically; Premier League and Champions League fixtures load live from football-data.org
          (all scores stripped server-side, refreshed every 15 minutes, so rescheduled games stay current). F1: 2026 FIA calendar with every session (practice, sprint qualifying, sprint, qualifying, race); session
          times for rounds after Azerbaijan follow the typical weekend format and are provisional until confirmed.
          NFL: full 272-game schedule loads live from ESPN via our server (scores stripped server-side, refreshed
          hourly, so flexed games stay current); if the feed is unavailable, a built-in marquee schedule takes over. Golf: PGA Tour, DP World Tour and majors that Rory McIlroy is
          eligible to enter; countdowns run to Round 1 and first-tee times are approximate. All times convert
          automatically to your device's timezone.
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
