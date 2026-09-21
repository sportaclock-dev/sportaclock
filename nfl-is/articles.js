import { Marked } from "marked";
import { esc } from "./render.js";
/* ============================================================
   NFL á íslensku — articles from github.com/EgillJohanns/nfl-greinar.

   Articles are written in a separate public repo (by a Copilot agent,
   deliberately kept away from this code), one Markdown file per article
   in greinar/<slug>.md with a small front-matter header. Merging there
   is publishing: the list is re-read every few minutes, so no redeploy.

   Everything in that repo is UNTRUSTED here:
     - The header is parsed by hand, four known keys only. gray-matter
       was the obvious choice, but it evaluates `---js` headers, i.e. it
       would run JavaScript from another repo on this server.
     - Markdown goes through marked with raw HTML escaped rather than
       passed through, links limited to http(s) and site paths, and no
       images. So a bad or hijacked article can make ugly text, never
       markup or script.

   GitHub allows 60 unauthenticated API requests an hour per IP. One
   listing per cache period (5 min) is 12/hour. File bodies come from
   raw.githubusercontent.com, which doesn't count, and are re-fetched
   only when a file's sha changes. Set GITHUB_TOKEN in Railway to raise
   the limit to 5000/hour if it's ever needed.
   ============================================================ */

const REPO = "EgillJohanns/nfl-greinar";
const DIR = "greinar";
const LIST_URL = `https://api.github.com/repos/${REPO}/contents/${DIR}?ref=main`;
const RAW_PREFIX = `https://raw.githubusercontent.com/${REPO}/main/${DIR}/`;
const TTL = 5 * 60 * 1000;
const FAIL_BACKOFF = 2 * 60 * 1000;
const MAX_BYTES = 200 * 1024;

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ---------- front matter ---------- */
export function parseFrontMatter(src) {
  const text = String(src).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = /^(title|slug|date|draft):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    data[kv[1]] = v;
  }
  return { data, body: m[2] };
}

// Returns a clean article, or a reason string when it can't be published.
export function toArticle(filename, src) {
  const stem = filename.replace(/\.md$/, "");
  const fm = parseFrontMatter(src);
  if (!fm) return "no front matter";
  const { title, slug, date, draft } = fm.data;
  if (draft === "true") return "draft";
  if (!title) return "no title";
  if (slug !== stem) return `slug "${slug}" doesn't match file name`;
  if (!SLUG_RE.test(slug)) return "bad slug";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return "bad date";
  return { title, slug, date, html: renderMarkdown(fm.body) };
}

/* ---------- Markdown, locked down ---------- */
const safeHref = (href) => {
  const h = String(href || "").trim();
  if (/^https?:\/\//i.test(h)) return { href: h, external: true };
  if (h.startsWith("/") && !h.startsWith("//")) return { href: h, external: false };
  return null;
};

const md = new Marked({
  gfm: true,
  renderer: {
    // Raw HTML in an article is shown as text, never interpreted.
    html(token) { return esc(token.text); },
    // The page already has the title as its <h1>, so # becomes ##.
    heading(token) {
      const level = Math.min(4, Math.max(2, token.depth));
      return `<h${level}>${this.parser.parseInline(token.tokens)}</h${level}>\n`;
    },
    link(token) {
      const inner = this.parser.parseInline(token.tokens);
      const ok = safeHref(token.href);
      if (!ok) return inner;
      return ok.external
        ? `<a href="${esc(ok.href)}" target="_blank" rel="noopener nofollow">${inner}</a>`
        : `<a href="${esc(ok.href)}">${inner}</a>`;
    },
    // No images in this version; keep the alt text so nothing is lost.
    image(token) { return esc(token.text || ""); },
  },
});

export function renderMarkdown(body) {
  return md.parse(String(body || ""));
}

/* ---------- fetching ---------- */
function headers() {
  const h = { Accept: "application/vnd.github+json", "User-Agent": "sportaclock-nfl" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

let state = { at: 0, failedAt: 0, list: null, pending: null };
const bySha = new Map(); // sha -> parsed article, so unchanged files aren't re-read

async function load() {
  const r = await fetch(LIST_URL, { headers: headers() });
  if (!r.ok) {
    const left = r.headers.get("x-ratelimit-remaining");
    throw new Error(`GitHub ${r.status}${left === "0" ? " (rate limit)" : ""}`);
  }
  const entries = await r.json();
  if (!Array.isArray(entries)) throw new Error("GitHub: unexpected listing");

  const files = entries.filter((e) =>
    e.type === "file" && /\.md$/.test(e.name) && SLUG_RE.test(e.name.slice(0, -3)) && e.size <= MAX_BYTES);

  const out = [];
  for (const f of files) {
    let a = bySha.get(f.sha);
    if (!a) {
      // Built from our own constants, never from the API's download_url.
      const raw = await fetch(RAW_PREFIX + encodeURIComponent(f.name));
      if (!raw.ok) throw new Error(`raw ${f.name}: ${raw.status}`);
      a = toArticle(f.name, await raw.text());
      bySha.set(f.sha, a);
      if (typeof a === "string" && a !== "draft") console.warn(`[nfl-greinar] skipped ${f.name}: ${a}`);
    }
    if (typeof a === "object") out.push(a);
  }
  // Forget shas that are gone, so the map can't grow forever.
  const live = new Set(files.map((f) => f.sha));
  for (const sha of bySha.keys()) if (!live.has(sha)) bySha.delete(sha);

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title, "is")));
}

/* Newest first. Serves the last good list when GitHub fails, [] if it has
   never succeeded, and after a failure waits before asking again. */
export async function getArticles() {
  const now = Date.now();
  if (state.list && now - state.at < TTL) return state.list;
  if (state.pending) return state.pending;
  if (state.failedAt && now - state.failedAt < FAIL_BACKOFF) return state.list || [];
  state.pending = load()
    .then((list) => {
      state = { at: Date.now(), failedAt: 0, list, pending: null };
      return list;
    })
    .catch((err) => {
      console.error(`[nfl-greinar] ${err.message}`);
      state = { ...state, failedAt: Date.now(), pending: null };
      return state.list || [];
    });
  return state.pending;
}

export async function getArticle(slug) {
  if (!SLUG_RE.test(String(slug || ""))) return null;
  return (await getArticles()).find((a) => a.slug === slug) || null;
}

// Tests only.
export function _resetArticlesForTests() {
  state = { at: 0, failedAt: 0, list: null, pending: null };
  bySha.clear();
}
