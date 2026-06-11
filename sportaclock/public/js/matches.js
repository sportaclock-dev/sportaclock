// FIFA World Cup 2026 - All matches
// Times are stored in UTC. The site converts to the visitor's local time automatically.

const MATCHES = [
  // ── GROUP STAGE ──────────────────────────────────────────────────────────
  // GROUP A
  { id: 1,  stage: "Group A", home: "Mexico",      away: "South Africa", utc: "2026-06-11T23:00:00Z", venue: "Mexico City" },
  { id: 2,  stage: "Group A", home: "Korea Republic", away: "Czechia",   utc: "2026-06-12T02:00:00Z", venue: "Guadalajara" },
  { id: 3,  stage: "Group A", home: "Mexico",      away: "Korea Republic", utc: "2026-06-16T02:00:00Z", venue: "Guadalajara" },
  { id: 4,  stage: "Group A", home: "Czechia",     away: "South Africa", utc: "2026-06-18T16:00:00Z", venue: "Atlanta" },
  { id: 5,  stage: "Group A", home: "Mexico",      away: "Czechia",      utc: "2026-06-22T02:00:00Z", venue: "Dallas" },
  { id: 6,  stage: "Group A", home: "South Africa",away: "Korea Republic", utc: "2026-06-22T02:00:00Z", venue: "Houston" },

  // GROUP B
  { id: 7,  stage: "Group B", home: "Canada",      away: "Bosnia & Herzegovina", utc: "2026-06-12T23:00:00Z", venue: "Toronto" },
  { id: 8,  stage: "Group B", home: "Switzerland", away: "Venezuela",    utc: "2026-06-13T02:00:00Z", venue: "Seattle" },
  { id: 9,  stage: "Group B", home: "Canada",      away: "Switzerland",  utc: "2026-06-17T23:00:00Z", venue: "Vancouver" },
  { id: 10, stage: "Group B", home: "Bosnia & Herzegovina", away: "Venezuela", utc: "2026-06-18T02:00:00Z", venue: "Los Angeles" },
  { id: 11, stage: "Group B", home: "Canada",      away: "Venezuela",    utc: "2026-06-22T22:00:00Z", venue: "Toronto" },
  { id: 12, stage: "Group B", home: "Switzerland", away: "Bosnia & Herzegovina", utc: "2026-06-22T22:00:00Z", venue: "Los Angeles" },

  // GROUP C
  { id: 13, stage: "Group C", home: "Brazil",      away: "Haiti",        utc: "2026-06-13T23:00:00Z", venue: "Philadelphia" },
  { id: 14, stage: "Group C", home: "Scotland",    away: "Morocco",      utc: "2026-06-14T02:00:00Z", venue: "Boston" },
  { id: 15, stage: "Group C", home: "Brazil",      away: "Scotland",     utc: "2026-06-18T23:00:00Z", venue: "San Francisco" },
  { id: 16, stage: "Group C", home: "Morocco",     away: "Haiti",        utc: "2026-06-19T02:00:00Z", venue: "New York" },
  { id: 17, stage: "Group C", home: "Brazil",      away: "Morocco",      utc: "2026-06-23T02:00:00Z", venue: "Philadelphia" },
  { id: 18, stage: "Group C", home: "Haiti",       away: "Scotland",     utc: "2026-06-23T02:00:00Z", venue: "Boston" },

  // GROUP D
  { id: 19, stage: "Group D", home: "USA",         away: "Paraguay",     utc: "2026-06-14T23:00:00Z", venue: "Los Angeles" },
  { id: 20, stage: "Group D", home: "Türkiye",     away: "Australia",    utc: "2026-06-15T02:00:00Z", venue: "San Francisco" },
  { id: 21, stage: "Group D", home: "USA",         away: "Türkiye",      utc: "2026-06-19T23:00:00Z", venue: "New York" },
  { id: 22, stage: "Group D", home: "Australia",   away: "Paraguay",     utc: "2026-06-20T02:00:00Z", venue: "Dallas" },
  { id: 23, stage: "Group D", home: "USA",         away: "Australia",    utc: "2026-06-24T02:00:00Z", venue: "Seattle" },
  { id: 24, stage: "Group D", home: "Paraguay",    away: "Türkiye",      utc: "2026-06-24T02:00:00Z", venue: "San Francisco" },

  // GROUP E
  { id: 25, stage: "Group E", home: "Germany",     away: "Côte d'Ivoire", utc: "2026-06-14T16:00:00Z", venue: "Toronto" },
  { id: 26, stage: "Group E", home: "Japan",       away: "Senegal",      utc: "2026-06-15T16:00:00Z", venue: "Houston" },
  { id: 27, stage: "Group E", home: "Germany",     away: "Japan",        utc: "2026-06-19T16:00:00Z", venue: "Dallas" },
  { id: 28, stage: "Group E", home: "Côte d'Ivoire", away: "Senegal",    utc: "2026-06-20T16:00:00Z", venue: "Miami" },
  { id: 29, stage: "Group E", home: "Germany",     away: "Senegal",      utc: "2026-06-23T19:00:00Z", venue: "Miami" },
  { id: 30, stage: "Group E", home: "Côte d'Ivoire", away: "Japan",      utc: "2026-06-23T19:00:00Z", venue: "Houston" },

  // GROUP F
  { id: 31, stage: "Group F", home: "Argentina",   away: "Algeria",      utc: "2026-06-15T19:00:00Z", venue: "Dallas" },
  { id: 32, stage: "Group F", home: "France",      away: "New Zealand",  utc: "2026-06-15T23:00:00Z", venue: "Atlanta" },
  { id: 33, stage: "Group F", home: "Argentina",   away: "France",       utc: "2026-06-19T19:00:00Z", venue: "New York" },
  { id: 34, stage: "Group F", home: "New Zealand", away: "Algeria",      utc: "2026-06-20T19:00:00Z", venue: "Seattle" },
  { id: 35, stage: "Group F", home: "Argentina",   away: "New Zealand",  utc: "2026-06-24T19:00:00Z", venue: "Los Angeles" },
  { id: 36, stage: "Group F", home: "Algeria",     away: "France",       utc: "2026-06-24T19:00:00Z", venue: "Boston" },

  // GROUP G
  { id: 37, stage: "Group G", home: "Spain",       away: "Nigeria",      utc: "2026-06-14T19:00:00Z", venue: "Miami" },
  { id: 38, stage: "Group G", home: "Netherlands", away: "Uganda",       utc: "2026-06-15T22:00:00Z", venue: "Philadelphia" },
  { id: 39, stage: "Group G", home: "Spain",       away: "Netherlands",  utc: "2026-06-19T22:00:00Z", venue: "San Francisco" },
  { id: 40, stage: "Group G", home: "Nigeria",     away: "Uganda",       utc: "2026-06-20T22:00:00Z", venue: "New York" },
  { id: 41, stage: "Group G", home: "Spain",       away: "Uganda",       utc: "2026-06-24T22:00:00Z", venue: "Atlanta" },
  { id: 42, stage: "Group G", home: "Nigeria",     away: "Netherlands",  utc: "2026-06-24T22:00:00Z", venue: "Miami" },

  // GROUP H
  { id: 43, stage: "Group H", home: "Portugal",    away: "Congo DR",     utc: "2026-06-14T22:00:00Z", venue: "Houston" },
  { id: 44, stage: "Group H", home: "Croatia",     away: "England",      utc: "2026-06-15T01:00:00Z", venue: "Dallas" },
  { id: 45, stage: "Group H", home: "Portugal",    away: "Croatia",      utc: "2026-06-19T01:00:00Z", venue: "Miami" },
  { id: 46, stage: "Group H", home: "England",     away: "Congo DR",     utc: "2026-06-20T01:00:00Z", venue: "Atlanta" },
  { id: 47, stage: "Group H", home: "Portugal",    away: "England",      utc: "2026-06-24T01:00:00Z", venue: "Philadelphia" },
  { id: 48, stage: "Group H", home: "Congo DR",    away: "Croatia",      utc: "2026-06-24T01:00:00Z", venue: "Boston" },

  // GROUP I
  { id: 49, stage: "Group I", home: "Italy",       away: "Ecuador",      utc: "2026-06-13T16:00:00Z", venue: "New York" },
  { id: 50, stage: "Group I", home: "New Zealand", away: "Ecuador",      utc: "2026-06-16T16:00:00Z", venue: "Toronto" },  
  { id: 51, stage: "Group I", home: "Italy",       away: "Mexico",       utc: "2026-06-17T16:00:00Z", venue: "Philadelphia" },
  { id: 52, stage: "Group I", home: "Ecuador",     away: "Saudi Arabia", utc: "2026-06-21T16:00:00Z", venue: "Dallas" },
  { id: 53, stage: "Group I", home: "Italy",       away: "Saudi Arabia", utc: "2026-06-25T19:00:00Z", venue: "New York" },
  { id: 54, stage: "Group I", home: "Ecuador",     away: "Mexico",       utc: "2026-06-25T19:00:00Z", venue: "Seattle" },

  // GROUP J
  { id: 55, stage: "Group J", home: "Iran",        away: "Cameroon",     utc: "2026-06-16T19:00:00Z", venue: "Vancouver" },
  { id: 56, stage: "Group J", home: "Belgium",     away: "Ukraine",      utc: "2026-06-16T22:00:00Z", venue: "Miami" },
  { id: 57, stage: "Group J", home: "Iran",        away: "Belgium",      utc: "2026-06-20T19:00:00Z", venue: "Los Angeles" },
  { id: 58, stage: "Group J", home: "Cameroon",    away: "Ukraine",      utc: "2026-06-21T19:00:00Z", venue: "Philadelphia" },
  { id: 59, stage: "Group J", home: "Iran",        away: "Ukraine",      utc: "2026-06-25T22:00:00Z", venue: "Los Angeles" },
  { id: 60, stage: "Group J", home: "Cameroon",    away: "Belgium",      utc: "2026-06-25T22:00:00Z", venue: "Miami" },

  // GROUP K
  { id: 61, stage: "Group K", home: "Colombia",    away: "Uzbekistan",   utc: "2026-06-13T19:00:00Z", venue: "Mexico City" },
  { id: 62, stage: "Group K", home: "Portugal",    away: "Congo DR",     utc: "2026-06-16T23:00:00Z", venue: "Houston" },
  { id: 63, stage: "Group K", home: "Colombia",    away: "Portugal",     utc: "2026-06-20T23:00:00Z", venue: "Los Angeles" },
  { id: 64, stage: "Group K", home: "Congo DR",    away: "Uzbekistan",   utc: "2026-06-21T22:00:00Z", venue: "Atlanta" },
  { id: 65, stage: "Group K", home: "Colombia",    away: "Congo DR",     utc: "2026-06-25T16:00:00Z", venue: "New York" },
  { id: 66, stage: "Group K", home: "Uzbekistan",  away: "Portugal",     utc: "2026-06-25T16:00:00Z", venue: "Houston" },

  // GROUP L
  { id: 67, stage: "Group L", home: "England",     away: "Croatia",      utc: "2026-06-14T01:00:00Z", venue: "Dallas" },
  { id: 68, stage: "Group L", home: "Ghana",       away: "Panama",       utc: "2026-06-17T19:00:00Z", venue: "Toronto" },
  { id: 69, stage: "Group L", home: "England",     away: "Ghana",        utc: "2026-06-18T19:00:00Z", venue: "Atlanta" },
  { id: 70, stage: "Group L", home: "Panama",      away: "Croatia",      utc: "2026-06-21T23:00:00Z", venue: "Houston" },
  { id: 71, stage: "Group L", home: "England",     away: "Panama",       utc: "2026-06-26T22:00:00Z", venue: "Miami" },
  { id: 72, stage: "Group L", home: "Ghana",       away: "Croatia",      utc: "2026-06-26T22:00:00Z", venue: "Philadelphia" },
];

// Knockout stage matches – teams filled in once group stage ends (June 28)
const KNOCKOUT_MATCHES = [
  // Round of 32 (June 28 – July 3)
  { id: 101, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-06-28T18:00:00Z", venue: "TBD" },
  { id: 102, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-06-28T22:00:00Z", venue: "TBD" },
  { id: 103, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-06-29T18:00:00Z", venue: "TBD" },
  { id: 104, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-06-29T22:00:00Z", venue: "TBD" },
  { id: 105, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-06-30T18:00:00Z", venue: "TBD" },
  { id: 106, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-06-30T22:00:00Z", venue: "TBD" },
  { id: 107, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-07-01T18:00:00Z", venue: "TBD" },
  { id: 108, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-07-01T22:00:00Z", venue: "TBD" },
  { id: 109, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-07-02T18:00:00Z", venue: "TBD" },
  { id: 110, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-07-02T22:00:00Z", venue: "TBD" },
  { id: 111, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-07-03T18:00:00Z", venue: "TBD" },
  { id: 112, stage: "Round of 32", home: "TBD", away: "TBD", utc: "2026-07-03T22:00:00Z", venue: "TBD" },
  // Round of 16 (July 4–7)
  { id: 113, stage: "Round of 16", home: "TBD", away: "TBD", utc: "2026-07-04T22:00:00Z", venue: "TBD" },
  { id: 114, stage: "Round of 16", home: "TBD", away: "TBD", utc: "2026-07-05T18:00:00Z", venue: "TBD" },
  { id: 115, stage: "Round of 16", home: "TBD", away: "TBD", utc: "2026-07-05T22:00:00Z", venue: "TBD" },
  { id: 116, stage: "Round of 16", home: "TBD", away: "TBD", utc: "2026-07-06T18:00:00Z", venue: "TBD" },
  { id: 117, stage: "Round of 16", home: "TBD", away: "TBD", utc: "2026-07-06T22:00:00Z", venue: "TBD" },
  { id: 118, stage: "Round of 16", home: "TBD", away: "TBD", utc: "2026-07-07T18:00:00Z", venue: "TBD" },
  { id: 119, stage: "Round of 16", home: "TBD", away: "TBD", utc: "2026-07-07T22:00:00Z", venue: "TBD" },
  { id: 120, stage: "Round of 16", home: "TBD", away: "TBD", utc: "2026-07-08T18:00:00Z", venue: "TBD" },
  // Quarterfinals (July 9–11)
  { id: 121, stage: "Quarterfinal", home: "TBD", away: "TBD", utc: "2026-07-09T22:00:00Z", venue: "TBD" },
  { id: 122, stage: "Quarterfinal", home: "TBD", away: "TBD", utc: "2026-07-10T18:00:00Z", venue: "TBD" },
  { id: 123, stage: "Quarterfinal", home: "TBD", away: "TBD", utc: "2026-07-10T22:00:00Z", venue: "TBD" },
  { id: 124, stage: "Quarterfinal", home: "TBD", away: "TBD", utc: "2026-07-11T18:00:00Z", venue: "TBD" },
  // Semifinals (July 14–15)
  { id: 125, stage: "Semifinal", home: "TBD", away: "TBD", utc: "2026-07-14T22:00:00Z", venue: "TBD" },
  { id: 126, stage: "Semifinal", home: "TBD", away: "TBD", utc: "2026-07-15T22:00:00Z", venue: "TBD" },
  // Bronze & Final
  { id: 127, stage: "3rd Place",  home: "TBD", away: "TBD", utc: "2026-07-18T19:00:00Z", venue: "Miami" },
  { id: 128, stage: "Final",      home: "TBD", away: "TBD", utc: "2026-07-19T20:00:00Z", venue: "New York" },
];

// Replay links – add here as games finish (YouTube, FIFA+, etc.)
// Format: { id: <match id>, url: "https://...", label: "Watch replay" }
const REPLAYS = [
  // Example (remove this line once real replays are added):
  // { id: 1, url: "https://www.youtube.com/watch?v=EXAMPLE", label: "Full match – FIFA+" },
];
