/* ============================================================
   Where to watch in the UK.

   No free feed carries UK channels per match. ESPN has none for
   football, TheSportsDB's free tier lists a couple of countries at
   random, and the Premier League's own API answers for whichever
   country is asking (our server isn't in the UK). So this follows
   the rights deals, which run for years:

     Premier League 2025–29  Sky Sports has most live games, TNT Sports
                             the Saturday 12:30s, and Saturday 15:00
                             kickoffs aren't shown in the UK at all.
     Champions League        TNT Sports, one Tuesday game a week on
                             Prime Video.
     F1                      Sky Sports F1, every session.
     Golf                    Sky Sports Golf (PGA Tour, team events).
     NFL                     DAZN has every game; Sky Sports a selection.

   A rule, not a listing: a specially picked or moved game can differ,
   and some midweek Premier League rounds go to TNT.
   ============================================================ */

const LONDON = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", weekday: "short",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// "Sat 15:00" in UK time, whatever the viewer's own timezone.
export function ukSlot(ts) {
  const p = Object.fromEntries(LONDON.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.hour}:${p.minute}`;
}

export function ukTv(ev) {
  const key = ev.sport === "football" ? ev.league : ev.sport;
  switch (key) {
    case "pl": {
      const slot = ukSlot(ev.kickoff);
      if (slot === "Sat 15:00") return "Not on UK TV (3pm blackout)";
      if (slot === "Sat 12:30") return "TNT Sports";
      return "Sky Sports";
    }
    case "cl": return "TNT Sports · Prime Video";
    case "f1": return "Sky Sports F1";
    case "golf": return "Sky Sports Golf";
    case "nfl": return "DAZN · Sky Sports (selected)";
    default: return null; // Besta deildin isn't shown in the UK
  }
}
