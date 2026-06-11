# ⏱ Sportaclock — World Cup 2026

**Ready. Tick. Kick.**

Every World Cup 2026 kickoff counted down in your timezone, plus a spoiler-free
catch-up zone with replay links for the matches you slept through.

---

## How to put this on the internet (step by step, no experience needed)

You need two free-ish things:
1. A **GitHub** account (stores your code) — free
2. A **Railway** account (runs your website) — has a small monthly cost after the trial

### Part 1 — Put the code on GitHub

1. Go to **github.com** and log in (or click "Sign up" if you don't have an account).
2. Click the **+** button in the top-right corner → **New repository**.
3. Name it `sportaclock` (or anything you like).
4. Leave everything else as it is. Click **Create repository**.
5. On the page that appears, click the link that says **"uploading an existing file"**.
6. On your computer, open the unzipped `sportaclock` folder.
7. Select ALL the files and folders inside it (`package.json`, `index.html`,
   `vite.config.js`, `.gitignore`, `README.md`, and the `src` folder) and
   **drag them into the GitHub upload box** in your browser.
   - ⚠️ Important: upload the files *inside* the folder, not the folder itself.
     GitHub should show `package.json` at the top level, not `sportaclock/package.json`.
   - 💡 If dragging the `src` folder doesn't work in your browser: click
     "choose your files" instead, go inside the `src` folder, and select the
     two files there. GitHub keeps the folder structure if you drag, but if you
     must use the file picker, upload `main.jsx` and `App.jsx`, then use
     GitHub's pencil/edit option to make sure they live under `src/`.
     (Dragging the whole folder works in Chrome and is the easiest way.)
8. Scroll down and click the green **Commit changes** button.

Done! Your code now lives on GitHub.

### Part 2 — Make it a live website with Railway

1. Go to **railway.app** (or **railway.com**) and click **Login** → choose
   **Login with GitHub**. Approve the permissions it asks for.
2. Click **+ New** → **Deploy from GitHub repo**.
3. If Railway asks to "Configure GitHub App", click it, choose your account,
   and give it access to your `sportaclock` repository. Then come back.
4. Select your **sportaclock** repository from the list.
5. Click **Deploy**. Railway will now:
   - install the packages (`npm install`)
   - build the website (`npm run build`)
   - start it (`npm start`)
   This takes 1–3 minutes. You'll see logs scrolling — that's normal.
6. When it says **Success / Active**: click on the service box, go to
   **Settings** → **Networking** → click **Generate Domain**.
7. Railway gives you a link like `sportaclock-production.up.railway.app`.
   Click it — your site is live! 🎉

### Part 3 — Turn on automatic knockout updates (football-data.org)

Without this, the site still works perfectly — knockout games just show
"Winner A" style placeholders. With it, team names fill in automatically and
matches are marked finished at the actual final whistle.

1. Go to **football-data.org** → click **Get your free API key** (or "Register").
2. Fill in your name and email. The free tier is enough — the World Cup is included.
3. Check your email: you'll receive your **API token** (a long string of letters
   and numbers). Copy it.
4. In **Railway**: open your sportaclock service → click the **Variables** tab.
5. Click **+ New Variable**. For the name, type exactly:
   `FOOTBALL_DATA_TOKEN`
   For the value, paste your token. Click **Add**.
6. Railway redeploys automatically (takes a minute). Open your site —
   the header now shows "● live bracket updates on".

That's it. The server checks for new bracket results every 15 minutes, and it
**strips out all scores before sending anything to the browser**, so the
spoiler-free zone can never leak a result.

### Part 4 (optional) — Use your own domain (sportaclock.com)

1. In Railway: your service → **Settings** → **Networking** → **+ Custom Domain**.
2. Type `sportaclock.com` (and/or `www.sportaclock.com`). Railway shows you a
   DNS record (usually a **CNAME** value).
3. Log in to the website where you bought sportaclock.com (your domain registrar).
4. Find **DNS settings** and add the record exactly as Railway shows it.
5. Wait a bit (a few minutes up to a couple of hours). Railway will show a
   green checkmark when it's connected, and HTTPS works automatically.

### How to make changes later

1. Edit the file on GitHub directly: open your repo → click `src/App.jsx` →
   click the **pencil icon** → make your change → **Commit changes**.
2. Railway notices the change and **redeploys automatically**. Refresh your
   site a minute later and the change is live.

---

## Where things live in the code

| What | Where |
| --- | --- |
| All 104 matches (times in UTC) | `src/App.jsx` → the `MATCHES` list |
| Broadcasters / replay links | `src/App.jsx` → the `COUNTRIES` list |
| Knockout names & match status | Filled in automatically via `server.js` + football-data.org |
| Slogan / header text | `src/App.jsx` → the `<header>` section |

## Run it on your own computer (optional)

If you have Node.js installed: open a terminal in this folder and run
`npm install`, then `npm run dev`, and open the link it prints.
