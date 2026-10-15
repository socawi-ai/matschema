# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Matschema is a self-hosted dinner planner: a meal library, rule-based 3-week schedules, and grocery offers scraped from Willys, ICA, Coop and Lidl to plan around what's on sale. Node.js 22+, Express 5, EJS, SQLite; CommonJS throughout. It ships as one Docker image (`ghcr.io/socawi-ai/matschema`). README.md is the user manual and documents the intended behavior in detail; feature changes usually update it too.

## Commands

```bash
npm install
npm run dev                                   # http://localhost:3000, restarts on change (node --watch)
npm test                                      # node --test, all of test/
node --test test/scheduler.test.js            # one test file
node --test --test-name-pattern="shopping"   # tests whose name matches, across all files
npm run seed:admin                            # admin from ADMIN_USERNAME / ADMIN_PASSWORD
node scripts/seed-meals.js                    # 31 example meals (overwrites same-named ones)
MATSCHEMA_DATA_DIR=/tmp/copy PORT=3200 npm start   # run against another data folder
```

There is no build step, bundler, linter or formatter. `.env` in the repo root is loaded by `src/load-env.js` (it never overrides variables already set). `src/env.js` decides the mode: only `NODE_ENV=development` or `test` is development; anything else, including unset, is production. In development sessions are in memory and an admin is bootstrapped automatically; in production `SESSION_SECRET` is required and sessions live in SQLite. Express's `trust proxy` comes from `trustProxySetting()` in `src/env.js` (`TRUST_PROXY`, else one hop only when `COOKIE_SECURE`/`FORCE_HTTPS` say there's an HTTPS proxy). It decides `req.ip`, which the login rate limit counts, so never trust `X-Forwarded-*` without a proxy in front.

## Architecture

**Startup** (`src/server.js`): `getDb()` opens the database and runs pending migrations *before* `app.listen`, so a failed migration stops the app instead of serving empty data. Then two in-process background timers start: the deals refresher (`src/deals/index.js`) and the weekly auto-planner (`src/schedule/auto.js`).

**Data layer** (`src/db/`, `src/data/`): one shared SQLite connection (`data/matschema.sqlite`). Every write goes through `inTransaction()` in `src/db/transaction.js`, a queue that guarantees only one `BEGIN IMMEDIATE` transaction at a time; don't write with `getDb()` directly. Schedule changes use the read-plan-write pattern in `store.updateSchedules(plan)` so a day the user edits mid-planning is never overwritten with stale data. Settings (rules, `autoPlan` state, …) are JSON values in a `settings` key/value table.

**Migrations** (`src/db/migrations.js`): an ordered `MIGRATIONS` array, tracked with `PRAGMA user_version`; each runs once in its own transaction (`afterCommit` hooks run file operations such as renaming the old JSON files). Add a new migration by appending to the array; never edit, remove or reorder existing ones, since they are one-way on users' data. `test/migration.test.js` simulates upgrading a v0.4 install.

**Schedule entry `source`** is central to planning: `manual` (user's choice), `auto` (generated) or `bought` (generated, then locked because the food was bought). Fill and re-plan only touch `auto` days unless the user explicitly replaces the whole period; `bought` days are left alone by auto-planning.

**Planning**: `src/utils/scheduler.js` generates weeks (variety rules: no dish twice a week, no ordinary dish two weeks running, specials at most once in three weeks), with rules normalized by `src/utils/rules.js` (`normalizeRules` fills defaults and clamps values). `src/schedule/fill.js` is the shared entry point for the admin buttons and `auto.js`. Dates are local time (the container's `TZ`): use `toISODate`/`startOfWeek` from the scheduler, not `toISOString().slice(0, 10)`.

**Deals**:
- `src/deals/sources/<chain>.js` each export `fetchDeals(store)` returning a normalized offer shape (`name`, `dealText`, `price`, `validFrom`/`validTo`, `memberOnly`, …). They scrape the chains' own websites/endpoints; there's no official API.
- Tests parse trimmed real responses saved in `test/fixtures/deals/`, never the network. When a chain changes its site, update the parser and refresh the fixture.
- `refreshDeals()` fetches enabled stores one after another, with only one run at a time.
- `src/deals/categories.js` sorts offers into everyday categories by product-name keywords. Rules are checked in order and the first match wins (specific before general). Patterns use Unicode letter lookarounds instead of `\b`, which treats å/ä/ö as non-letters, and `ending()` for Swedish compound words.
- `src/deals/meal-deals.js` works out a meal's main ingredient (its protein) and matches it against offers for that ingredient itself, not just the same category. It also ranks stores and defines the deal period: Friday this week through Sunday two weeks ahead.

**Web layer** (`src/app.js`, `src/routes/`):
- Server-rendered EJS. `/backend` (admin, behind `requireAuth`) is one large `views/backend.ejs` with inline scripts.
- Public views `/frontend`, `/frontend/ny` (a trial redesign) and `/frontend/ha` (Home Assistant iframe) share `getFrontendData()` in `src/routes/frontend.js`. `/frontend` and `/frontend/ny` load `public/frontend.js`.
- Data reaches browser scripts as `<script type="application/json">` blocks escaped with `.replace(/</g, '\\u003c')`; keep that escaping.
- The CSP allows inline scripts and styles but nothing external, so don't add CDN assets. Fonts are self-hosted in `public/fonts/`.
- Non-GET requests with `Sec-Fetch-Site: cross-site` or `same-site` are rejected.
- Form input goes through `src/utils/input.js` (`text`, `textList`, `secret`).
- Login stores `users.session_version` in the session; `attachUser` (`src/middleware/auth.js`) logs out sessions whose version doesn't match. `updateUserPasswordHash` bumps it, ending every other session, and the password route saves the new version in the current one. Sessions from before this existed count as 0.

## Conventions

- The UI and log messages are in Swedish; code, identifiers and comments are in English.
- Tests use `node:test` with `node:assert/strict`, and each test file sets `process.env.MATSCHEMA_DATA_DIR` to a fresh temp dir **before** requiring app modules (the data path is read at require time). Files that load `src/app` also set `NODE_ENV=test` first. Each file runs in its own process, so it can set its own environment (see `test/rate-limit-proxy.test.js`). Don't let tests touch `data/`.
- `data/` (the real database) and `.env` are git-ignored.
- Releases: bump `version` in package.json in its own commit ("Bump version to x.y.z"). Pushes to `main` and `v*` tags are built by `.github/workflows/docker-publish.yml`: smoke-tested (requires `src/data/store` and `src/app`), Trivy-scanned (fails on fixable HIGH/CRITICAL), and published as `latest`, `sha-<commit>` and the tag.
- `ecosystem.config.cjs` / `npm run pm2:*` and `scripts/restart-server.sh` are for a bare-metal pm2 deployment; Docker is the documented way to run it.
