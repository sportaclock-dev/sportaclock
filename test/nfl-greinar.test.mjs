import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontMatter, toArticle, renderMarkdown } from "../nfl-is/articles.js";
import { dateIs } from "../nfl-is/content.js";

const doc = (head, body = "## Fyrirsogn\n\nTexti.") => `---\n${head}\n---\n\n${body}\n`;
const good = "title: Hvað eru downs?\nslug: hvad-eru-downs\ndate: 2026-09-21\ndraft: false";

test("front matter: the four keys, quotes stripped, CRLF and BOM tolerated", () => {
  const fm = parseFrontMatter("\uFEFF" + doc('title: "Með gæsalöppum"\nslug: a\ndate: 2026-09-21\ndraft: false').replace(/\n/g, "\r\n"));
  assert.equal(fm.data.title, "Með gæsalöppum");
  assert.equal(fm.data.slug, "a");
  assert.ok(fm.body.includes("Texti."));
  assert.equal(parseFrontMatter("engin haus"), null);
});

test("a ---js header is never executed, just rejected", () => {
  globalThis.__pwned = false;
  const r = toArticle("x.md", "---js\n{ title: (globalThis.__pwned = true, 'x') }\n---\nhi");
  assert.equal(typeof r, "string");
  assert.equal(globalThis.__pwned, false);
});

test("publishable articles, and the reasons others are skipped", () => {
  const a = toArticle("hvad-eru-downs.md", doc(good));
  assert.equal(a.title, "Hvað eru downs?");
  assert.equal(a.date, "2026-09-21");
  assert.ok(a.html.includes("<h2>Fyrirsogn</h2>"));
  assert.equal(toArticle("hvad-eru-downs.md", doc(good.replace("draft: false", "draft: true"))), "draft");
  assert.match(toArticle("annad-nafn.md", doc(good)), /match/);
  assert.equal(toArticle("hvad-eru-downs.md", doc(good.replace("2026-09-21", "21.9.2026"))), "bad date");
  assert.equal(toArticle("hvad-eru-downs.md", doc(good.replace("2026-09-21", "2026-02-30x"))), "bad date");
  assert.equal(toArticle("hvad-eru-downs.md", doc(good.replace("title: Hvað eru downs?\n", ""))), "no title");
});

test("markdown: raw HTML is shown as text, never run", () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\nHæ <img src=x onerror="alert(1)"> og <b>feitt</b>');
  assert.ok(!/<script/i.test(html));
  assert.ok(!/<img/i.test(html));
  assert.ok(!/<b>/.test(html));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("markdown: only http(s) and site links survive", () => {
  const html = renderMarkdown("[a](javascript:alert(1)) [b](data:text/html,x) [c](//evil.example) [d](https://nfl.com) [e](/nfl/lid/kc)");
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("data:"));
  assert.ok(!html.includes('href="//evil'));
  assert.ok(html.includes('href="https://nfl.com" target="_blank" rel="noopener nofollow"'));
  assert.ok(html.includes('href="/nfl/lid/kc"'));
});

test("markdown: images become their alt text, # is demoted to ##, bold stays", () => {
  const html = renderMarkdown("# Titill\n\n![lýsing](https://x/y.png)\n\n**Kosturinn:** pressa");
  assert.ok(html.includes("<h2>Titill</h2>"));
  assert.ok(!html.includes("<h1"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("lýsing"));
  assert.ok(html.includes("<strong>Kosturinn:</strong>"));
});

test("Icelandic article dates", () => {
  assert.equal(dateIs("2026-09-21"), "21. september 2026");
  assert.equal(dateIs("2027-01-05"), "5. janúar 2027");
  assert.equal(dateIs("rubbish"), "");
});
