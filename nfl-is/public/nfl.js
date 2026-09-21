/* NFL á íslensku — the little bit of JavaScript.
   The server renders everything; this only adds the ticking clock,
   the tabbed explainer, the in-page highlights player and live score
   refresh. Every node is built with createElement/textContent. */
(function () {
  "use strict";
  document.documentElement.classList.remove("no-js");

  /* ---------- countdown ---------- */
  var clocks = [].slice.call(document.querySelectorAll("[data-countdown]"));
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function tick() {
    var now = Date.now();
    clocks.forEach(function (el) {
      var ms = Math.max(0, new Date(el.getAttribute("data-countdown")).getTime() - now);
      var s = Math.floor(ms / 1000);
      var v = { d: Math.floor(s / 86400), h: pad(Math.floor(s / 3600) % 24), m: pad(Math.floor(s / 60) % 60), s: pad(s % 60) };
      Object.keys(v).forEach(function (u) {
        var n = el.querySelector('[data-u="' + u + '"]');
        if (n && n.textContent !== String(v[u])) n.textContent = v[u];
      });
    });
  }
  if (clocks.length) { tick(); setInterval(tick, 1000); }

  /* ---------- explainer tabs ---------- */
  var tabs = [].slice.call(document.querySelectorAll('.learn-tabs [role="tab"]'));
  function select(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
  }
  if (tabs.length) {
    select(tabs[0]);
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t); });
      t.addEventListener("keydown", function (e) {
        var j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
        if (j === null) return;
        var next = tabs[(j + tabs.length) % tabs.length];
        select(next); next.focus(); e.preventDefault();
      });
    });
  }

  /* ---------- highlights player ---------- */
  var player = document.querySelector("[data-player]");
  function play(id, title) {
    if (!player || !/^[\w-]{6,20}$/.test(id)) return false;
    var frame = document.createElement("iframe");
    frame.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
    frame.title = "Highlights: " + title;
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    while (player.firstChild) player.removeChild(player.firstChild);
    player.appendChild(frame);
    [].forEach.call(document.querySelectorAll(".feature-side [data-player-title]"), function (n) { n.textContent = title; });
    [].forEach.call(document.querySelectorAll("button[data-video]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-video") === id ? "true" : "false");
    });
    return true;
  }
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-video]") : null;
    if (!el) return;
    if (play(el.getAttribute("data-video"), el.getAttribute("data-title") || "")) {
      e.preventDefault();
      if (el.tagName === "BUTTON") player.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  /* ---------- live scores ----------
     Only when this week has a game in progress. Scores update in place;
     if a game starts or finishes the page reloads, since that changes
     more than a number (a Highlights button appears, for one). */
  var list = document.querySelector(".games[data-live]");
  if (list) {
    var week = list.getAttribute("data-week");
    var refresh = function () {
      if (document.hidden) return;
      fetch("/nfl/api/vika?vika=" + encodeURIComponent(week))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return;
          d.games.forEach(function (g) {
            var row = list.querySelector('[data-game="' + g.id + '"]');
            if (!row) return;
            if (row.getAttribute("data-state") !== g.state) { location.reload(); return; }
            var set = function (sel, v) { var n = row.querySelector(sel); if (n && v != null) n.textContent = v; };
            set('[data-score="h"]', g.h);
            set('[data-score="a"]', g.a);
            set("[data-detail]", g.detail);
          });
        })
        .catch(function () {});
    };
    setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
  }
})();
