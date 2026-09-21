import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { teamKey, parseWeekKey, weekKey } from "./content.js";
import {
  getGames, getTeamsMeta, getStandings, getTeamDetail, getRoster,
  pollHighlights, cacheStatus,
} from "./data.js";
import {
  BASE, frontPage, gamesPage, teamsPage, teamPage, glossaryPage, errorPage,
  articlesPage, articlePage,
} from "./render.js";
import { getArticles, getArticle } from "./articles.js";
/* ============================================================
   NFL á íslensku — a self-contained experiment at /nfl.

   Everything lives in this folder so it can move to its own domain
   by copying the folder and changing BASE in render.js. It shares
   only espn.js with the rest of sportaclock, on purpose: that's the
   circuit breaker which keeps every feature polite to ESPN together.

   Unlike the rest of sportaclock this SHOWS SCORES. The spoiler
   shield is Sportaclock's promise, and none of this module's data
   reaches the main site's /api routes.

   Wiring in server.js — BEFORE the app.get("*") catch-all:
     import { mountNflIs } from "./nfl-is/index.js";
     mountNflIs(app);
   ============================================================ */

const here = path.dirname(fileURLToPath(import.meta.url));

// Highlights are polled on the back of page views, never on a timer:
// no visitors, no requests. The first view after a quiet spell waits
// for the poll so it can show videos; later ones don't.
async function freshHighlights() {
  const p = pollHighlights().catch(() => null);
  await Promise.race([p, new Promise((r) => setTimeout(r, 1500))]);
}

async function common() {
  const [{ games, current }, meta, standings] = await Promise.all([
    getGames(), getTeamsMeta(), getStandings(), freshHighlights(),
  ]);
  return { games: games || [], current, meta, standings };
}

function send(res, html, maxAge = 30) {
  res.set("Cache-Control", `public, max-age=${maxAge}`);
  res.type("html").send(html);
}

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error("[nfl-is]", req.path, err);
    res.status(500).type("html").send(errorPage("Eitthvað fór úrskeiðis hjá okkur. Reyndu aftur eftir smá stund."));
  }
};

export function mountNflIs(app) {
  app.use(`${BASE}/static`, express.static(path.join(here, "public"), { maxAge: "1h" }));

  app.get(BASE, wrap(async (req, res) => {
    // Articles are a bonus on the front page: if GitHub is slow, render
    // without them rather than make the whole page wait.
    const [d, articles] = await Promise.all([
      common(),
      Promise.race([getArticles(), new Promise((r) => setTimeout(() => r([]), 1500))]),
    ]);
    if (!d.games.length) return send(res, errorPage("Leikjadagskráin náðist ekki frá ESPN í augnablikinu. Reyndu aftur eftir smá stund."), 10);
    send(res, frontPage({ ...d, articles }));
  }));

  app.get(`${BASE}/greinar`, wrap(async (req, res) => {
    const [{ games }, articles] = await Promise.all([getGames(), getArticles()]);
    send(res, articlesPage({ games: games || [], current: null, articles }), 60);
  }));

  app.get(`${BASE}/greinar/:slug`, wrap(async (req, res) => {
    const [{ games }, articles, article] = await Promise.all([getGames(), getArticles(), getArticle(req.params.slug)]);
    if (!article) {
      return res.status(404).type("html").send(errorPage("Þessi grein fannst ekki. Hún gæti hafa verið fjarlægð eða slóðin er röng."));
    }
    send(res, articlePage({ games: games || [], current: null, article, articles }), 60);
  }));

  // JSON for anything else that wants the articles.
  app.get(`${BASE}/api/greinar`, wrap(async (req, res) => {
    const articles = await getArticles();
    res.set("Cache-Control", "public, max-age=60");
    res.json(articles.map(({ title, slug, date }) => ({ title, slug, date })));
  }));

  app.get(`${BASE}/api/greinar/:slug`, wrap(async (req, res) => {
    const a = await getArticle(req.params.slug);
    if (!a) return res.status(404).json({ error: "not found" });
    res.set("Cache-Control", "public, max-age=60");
    res.json(a);
  }));

  app.get(`${BASE}/leikir`, wrap(async (req, res) => {
    const d = await common();
    const wk = parseWeekKey(req.query.vika) || d.current || { type: 2, week: 1 };
    send(res, gamesPage({ ...d, ...wk }));
  }));

  app.get(`${BASE}/lid`, wrap(async (req, res) => {
    send(res, teamsPage(await common()));
  }));

  app.get(`${BASE}/lid/:team`, wrap(async (req, res) => {
    const ab = teamKey(req.params.team);
    if (!ab) return res.status(404).type("html").send(errorPage("Þetta lið fannst ekki."));
    // Canonical lower-case URL, and WAS → wsh style aliases land on the real page.
    if (req.params.team !== ab.toLowerCase()) return res.redirect(301, `${BASE}/lid/${ab.toLowerCase()}`);
    const [d, detail, roster] = await Promise.all([common(), getTeamDetail(ab), getRoster(ab)]);
    send(res, teamPage({ ...d, ab, detail, roster }), 120);
  }));

  app.get(`${BASE}/ordabok`, wrap(async (req, res) => {
    const { games } = await getGames();
    send(res, glossaryPage({ games: games || [], current: null }), 3600);
  }));

  // Live score refresh for one week's list. Small on purpose: the page
  // already has everything else, this only carries what changes.
  app.get(`${BASE}/api/vika`, wrap(async (req, res) => {
    const wk = parseWeekKey(req.query.vika);
    if (!wk) return res.status(400).json({ error: "vika" });
    const { games } = await getGames();
    const list = (games || []).filter((g) => g.type === wk.type && g.week === wk.week);
    res.set("Cache-Control", "public, max-age=15");
    res.json({
      vika: weekKey(wk.type, wk.week),
      games: list.map((g) => ({ id: g.id, state: g.state, detail: g.detail, h: g.home.score, a: g.away.score })),
    });
  }));

  app.get(`${BASE}/api/status`, (req, res) => res.json({ caches: cacheStatus() }));
}
