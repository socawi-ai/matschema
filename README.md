# Matschema

Matschema is a self-hosted dinner planner for a household. You keep a library of your own meals, set a few rules (how often fish and vegetarian, which days are weekend specials), and Matschema plans dinners for this week and the next two. It can also follow this week's grocery offers and plan around the meals whose main ingredient is on sale at the store you're going to.

The family sees the plan on a simple public page or on a Home Assistant dashboard; you manage everything in a password-protected admin.

It runs as a single Docker container with one SQLite database. The interface is in Swedish.

## Features

**Planning**

- **Meal library**: your own meals, each with a type (regular, vegetarian or fish), an optional ⭐ weekend special flag, and an ingredient list.
- **Automatic 3-week plan** from simple rules: fish and vegetarian meals per week, which days may be vegetarian, which days are special days (e.g. Friday and Saturday, optionally sharing one dish).
- **Variety**: no dish twice in a week, no ordinary dish two weeks in a row, and the same weekend special at most once in three weeks, whenever you have alternatives.
- **Your choices stay**: pick a meal for a day, write a one-off meal, mark leftovers or reroll a day. Days you set are never overwritten by the generator.

**Grocery offers**

- **Offers from Willys, ICA, Coop and Lidl**, fetched automatically from the chains' own websites. They're sorted into everyday categories (dairy, meat, chicken, fish, vegetables, pasta …), with manual corrections and a "new this week" check.
- **Deal-based planning**: the plan picks meals whose main ingredient is on offer at the one store you'll do your big shop at, for the days you're shopping for.
- **Automatic weekly planning** (optional): when the new offers arrive each Monday, the coming weeks are planned again for the best store, and from Friday the days you've shopped for are locked.

**Viewing**

- **Public schedule** at `/frontend`: three weeks, today highlighted, meal-type markers, ingredients on tap, and a shopping list: which store to go to and which offers to buy for which meals.
- **Home Assistant view** at `/frontend/ha`: a compact schedule for an iframe card, with the store to shop at.
- **Light and dark theme.**

## Installation

You need Docker with the Compose plugin. Everything else is in the image `ghcr.io/socawi-ai/matschema`.

1. Create a folder for Matschema, and a `data` folder inside it for the database:

   ```bash
   mkdir -p matschema/data && cd matschema
   ```

2. Create `docker-compose.yml`:

   ```yaml
   services:
     matschema:
       image: ghcr.io/socawi-ai/matschema:latest
       container_name: matschema
       restart: unless-stopped
       ports:
         - "3000:3000"
       environment:
         NODE_ENV: production
         TZ: ${TZ:-Europe/Stockholm}
         PORT: 3000
         SESSION_SECRET: ${SESSION_SECRET:?set SESSION_SECRET in .env or shell}
         COOKIE_SECURE: ${COOKIE_SECURE:-false}
         FORCE_HTTPS: ${FORCE_HTTPS:-false}
         EMBED_ALLOWED_ORIGINS: ${EMBED_ALLOWED_ORIGINS:-}
         AUTO_BOOTSTRAP_ADMIN: ${AUTO_BOOTSTRAP_ADMIN:-false}
         DEFAULT_ADMIN_USERNAME: ${DEFAULT_ADMIN_USERNAME:-admin}
         DEFAULT_ADMIN_PASSWORD: ${DEFAULT_ADMIN_PASSWORD:-}
         DEALS_AUTO_REFRESH: ${DEALS_AUTO_REFRESH:-true}
       volumes:
         - ./data:/app/data
       healthcheck:
         test: ["CMD-SHELL", "node -e \"require('http').get('http://127.0.0.1:3000/health', r => process.exit(r.statusCode === 200 || r.statusCode === 301 ? 0 : 1)).on('error', () => process.exit(1))\""]
         interval: 30s
         timeout: 5s
         retries: 3
         start_period: 10s
   ```

3. Create `.env` next to it. The first start creates the admin account from these values:

   ```env
   SESSION_SECRET=replace-with-a-long-random-secret
   AUTO_BOOTSTRAP_ADMIN=true
   DEFAULT_ADMIN_USERNAME=admin
   DEFAULT_ADMIN_PASSWORD=choose-a-password
   ```

   Generate a secret with e.g. `openssl rand -hex 32`. Always set `DEFAULT_ADMIN_PASSWORD`: if it's empty a password is generated, but it isn't shown in production logs.

4. Start it:

   ```bash
   docker compose up -d
   docker compose logs -f
   ```

5. Log in at `http://<your-server>:3000/auth/login` with that username and password. Then:
   - change the password under ⚙️ Inställningar,
   - add your meals under 🍽 Måltider,
   - press ✨ Fyll tomma dagar under 📅 Schema.

   Once the account exists you can remove `DEFAULT_ADMIN_PASSWORD` from `.env` and set `AUTO_BOOTSTRAP_ADMIN=false`.

### Addresses

| Address | What |
| --- | --- |
| `/` or `/frontend` | Public 3-week schedule |
| `/frontend/ha` | Compact view for Home Assistant |
| `/auth/login` | Admin login |
| `/backend` | Admin |

### Without Compose

```bash
docker run -d --name matschema --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production -e TZ=Europe/Stockholm \
  -e SESSION_SECRET="replace-with-a-long-random-secret" \
  -e AUTO_BOOTSTRAP_ADMIN=true -e DEFAULT_ADMIN_USERNAME=admin -e DEFAULT_ADMIN_PASSWORD=choose-a-password \
  -v "$PWD/data:/app/data" \
  ghcr.io/socawi-ai/matschema:latest
```

## Running

| Task | Command |
| --- | --- |
| Follow the log | `docker compose logs -f` |
| Stop / start | `docker compose stop` / `docker compose start` |
| Update | See below |
| Back up | `cp -a data data-backup-$(date +%F)` |

### Updating

```bash
cp -a data data-backup-$(date +%F)   # back up first
docker compose pull
docker compose up -d
docker compose logs -f
```

Your data lives in `./data` and is kept when the image is updated. When a new version changes how data is stored, the app migrates the database automatically on startup, before it serves any requests. Each migration runs once, inside a transaction; if one fails, nothing is changed and the container stops with an error.

To stay on a specific version instead of `latest`, set the image tag, e.g. `ghcr.io/socawi-ai/matschema:v0.5.0`. Every published build is also tagged `sha-<commit>`.

### Restoring a backup

```bash
docker compose down
rm -rf data && cp -a data-backup-2026-10-11 data   # the backup to restore
docker compose up -d
```

If the backup is from before an update, also set the image back to the version you ran then, since database updates are one-way.

### Upgrading from v0.4 or earlier

v0.4 and earlier kept meals and schedules in `meals.json` and `schedules.json`. On the first start of a newer image:

1. Both files are imported into `matschema.sqlite`. Meal IDs are kept, so planned days still point at the right meals.
2. The files are renamed to `meals.json.migrated` and `schedules.json.migrated` and kept as a backup.

`docker compose logs matschema | grep -i migrer` reports how many meals and weeks were moved. If a file can't be read, nothing is changed and the container stops with an error naming the file.

**What changes with the upgrade**

- **Your existing days count as your own choices.** Every day that already has a meal is treated as yours. *Planera om med erbjudanden* then leaves them alone unless you choose *Hela perioden*.
- **Planning rules are shared.** They were saved per admin user before; the most recently saved rules are carried over.
- **Add `TZ` to your setup** if your Compose file doesn't have it yet (see [Configuration](#configuration)).

## Configuration

Settings are environment variables, set in `.env` when using Compose.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | required | Secret for signing login sessions. Use a long random value. |
| `TZ` | `Europe/Stockholm` | Timezone for "today", week starts and offer end dates. Without it the container runs on UTC and shows yesterday as today for an hour or two after midnight. |
| `AUTO_BOOTSTRAP_ADMIN` | `false` | Create the first admin account on startup if there is none. |
| `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` | `admin` / generated | Credentials for that first account. |
| `COOKIE_SECURE` / `FORCE_HTTPS` | `false` | Set both to `true` when the app is reached over HTTPS through a reverse proxy. Keep them `false` for plain HTTP. |
| `EMBED_ALLOWED_ORIGINS` | empty | Sites allowed to show the app in an iframe, comma-separated (see [Home Assistant](#home-assistant)). |
| `DEALS_AUTO_REFRESH` | `true` | Fetch store offers automatically. `false` = only when you press *Uppdatera nu*. |
| `PORT` | `3000` | Port inside the container. |

## Using Matschema

The admin at `/backend` has four tabs.

### 📅 Schema

The three planned weeks, one row per day.

- **✨ Fyll tomma dagar** fills every empty day following your rules. Days that already have a meal are left alone.
- **Click a meal** to change it. You can:
  - search your meals and pick one,
  - type a one-off meal and press Enter,
  - choose 🍱 *Rester/Matlåda* (leftovers),
  - choose *Töm dagen* to hand the day back to the generator.
- **🎲** picks another meal that fits the day: fish stays fish, a special stays a special.
- **🛒** marks a day as bought: [automatic planning](#automatic-weekly-planning) locked it, so it isn't re-planned. Changing the day makes it your own choice.
- **🗑** removes a week. It can be filled again.
- **🏷 Handla på** and **🏷 Planera om med erbjudanden** plan around current offers (see [Deal-based planning](#deal-based-planning)).

Days you set yourself (a picked meal, a one-off meal, leftovers, 🎲) are kept by *Fyll tomma dagar* and by re-planning, unless you choose to replace the whole period.

### 🍽 Måltider

Your meal library, searchable by name or ingredient. Click a meal to edit:

- its name,
- its type (*Vanlig*, *Vegetarisk* or *Fisk*),
- the ⭐ special flag,
- its ingredients, one per line.

Each meal shows its **main ingredient** (e.g. 🍗 Kyckling), which is what offers are matched on. Deleting a meal keeps it on days where it's already planned.

### 🏷 Erbjudanden

This week's offers from your stores.

- **Gäller idag** or **Nästa vecka**.
- **🛒 Vardagsvaror** (everyday groceries, the default), **Alla erbjudanden**, or **🆕 Nya varor**: products seen for the first time this week, worth a quick look.
- **✎** on an offer moves the product to another category, or marks it as not an everyday item. The correction applies in all stores and future weeks, and corrected products show ✋.
- A switch per store, its status, and **Uppdatera nu** to fetch immediately.

### ⚙️ Inställningar

- **Planning rules**, saved automatically: fish and vegetarian meals per week, weeks ahead, special days, vegetarian days, whether to prioritize offers, automatic weekly planning, and which stores you shop at.
- **Account**: change username and password.

## Grocery offers

Offers are read from each chain's own website, since none of them has a public API:

| Chain | Store | Offers |
| --- | --- | --- |
| Willys | Willys Östersund | per store |
| ICA | ICA Maxi Östersund, ICA Kvantum Lillänge | per store |
| Coop | Stora Coop Östersund | per store |
| Lidl | Lidl | national |

The stores are set up for Östersund. Offers are fetched every 12 hours, and every 3 hours on weekends when next week's offers tend to appear.

A chain can change its website at any time. If a source stops working, the admin shows the error for that store and keeps its last offers until they expire; the other stores carry on.

The data is for your own household's planning. Don't republish it.

### Everyday categories

Each offer is sorted by keywords in its name into one of these categories:

Mejeri & matfett · Ost · Ägg · Kött · Köttfärs · Kyckling · Korv & bacon · Fisk & skaldjur · Vegetariskt protein · Grönsaker · Frysta grönsaker · Potatis · Pasta · Ris & gryn · Mjöl & bakning · Kaffe & te

Some categories are deliberately narrow:

- **Ost** is sliceable and hard cheese only.
- **Yoghurt** is ordinary breakfast yoghurt and filmjölk in packs of 500 g or more.

Snacks, sweets, drinks, bread, ready meals, cold cuts and canned goods aren't counted as everyday groceries.

Most products land right, but not all, especially brand names without a describing word. Fix those with ✎, and glance at 🆕 Nya varor now and then.

### Deal-based planning

1. **Main ingredient.** A meal's main ingredient is its protein: meat, mince, chicken, sausage and bacon, fish, or vegetarian protein. Beans only count when there's no meat or fish. Meals without one, like a mushroom risotto, are never prioritized. If an ingredient is categorized wrongly, fix it with ✎ in the meal editor.
2. **Matching.** A meal counts as on offer when the store has an offer for that ingredient itself, e.g. *Kyckling* → "Kycklingbröstfilé", *Lax* → "Laxfilé 4-pack". The same category isn't enough, since every store has some meat on offer every week. Write ingredients the way stores name them if you want them to match.
3. **One store.** Under ⚙️ Inställningar, choose the stores you do your big shop at; by default Willys Östersund, ICA Maxi Östersund and ICA Kvantum Lillänge. Under 📅 Schema, *Handla på* is either *Automatiskt*, the store with offers for the most of your meals (a comparison is shown), or a store you pick.
4. **Period.** You shop before Friday, so offers are used from Friday this week (or today, if later) through Sunday two weeks ahead.
5. **Planning.** In that period, meals on offer at that store are chosen first, as long as variety allows. All the usual rules still apply. Offers on one ingredient (e.g. chicken) count for all meals with it, so buying for the freezer works across weeks.
6. **Re-planning.** *🏷 Planera om med erbjudanden* plans the period again with the current offers. Choose *Bara genererade dagar* to keep your own choices, or *Hela perioden* to replace every day in the period.
7. **Why.** Days with a meal on offer show 🏷. Click it to see the offer: product, price, store and end date.

Prioritizing offers can be switched off under ⚙️ Inställningar.

### Automatic weekly planning

For a household that gets new offers on Monday, does the big shop on Tuesday, Wednesday or Thursday, and buys for the deal period (Friday through Sunday two weeks ahead). Turn it on under ⚙️ Inställningar with *🤖 Planera om automatiskt varje vecka*. It's off by default.

1. **Planning, Monday–Thursday.** Once this week's offers are in, Matschema does what *Planera om med erbjudanden → Bara genererade dagar* does, for the store with offers for the most meals (whatever *Handla på* is set to). The offers count as in when every store you shop at has been fetched since Monday and has new offers. If they're late, it plans anyway on Tuesday at 06:00. It runs at most once a week.
2. **Locking, from Friday.** By Friday you've shopped, so every generated day with a meal up to the end of that week's period is marked 🛒 bought. The next Monday leaves those days alone, so in practice it plans the newest week and any empty days.
3. **Your choices.** Days you set yourself are never touched. To change a bought day, change it as usual. To re-plan everything, including bought days, use *Planera om med erbjudanden → Hela perioden*.
4. **Downtime.** If the server was off, a missed Friday is locked before the next planning, and a missed Monday is planned as soon as it's back (until Thursday).

The 📅 Schema tab shows when it last planned, for which store, and which days were locked. Times follow the container's `TZ`.

## Public schedule

`/frontend` shows this week and the next two:

- today is highlighted,
- 🐟, 🥕 and ⭐ mark fish, vegetarian and special meals, and 🏷 meals whose main ingredient is on offer,
- tapping a meal shows its ingredients, and for 🏷 meals the offer.

### Shopping list

When the plan was made with offers, a **🛒 Handla på …** card at the top shows the store to go to and the offers to buy. The offers are grouped by main ingredient (🥩 Köttfärs, 🍗 Kyckling, 🐟 Fisk …). Each offer shows its price, compare price, member-only price and purchase limits, how long it's valid, and which meals and days it's for.

- **Which store.** The store the plan was made for, by automatic planning or by *Fyll tomma dagar* / *Planera om med erbjudanden*. That store is shown even if another one has better offers later in the week, so the list always matches the schedule.
- **Which offers.** Only offers for meals planned from today to the end of the period, at that store, and still valid. Other offers stay in the admin.
- **When.** Monday–Thursday, once this week's plan is made, the card is open. Otherwise (Friday–Sunday, or Monday before the new offers are in) it shrinks to *Handlat för … på …*. Tap it to see the list.
- **No card.** If the plan was made without offers, or its period is over, there's no card. A plan made before this feature was added doesn't count until the schedule is filled or re-planned again.

Only the finished list is public. Settings, store choice and all other offers stay behind the admin login. If `/frontend` is reachable from the internet, keep in mind that the list shows some of the chains' offers (see [Grocery offers](#grocery-offers)).

A page left open, such as a kitchen tablet, reloads itself after midnight or after 30 minutes.

## Home Assistant

`/frontend/ha` is a compact view for an iframe card on a Home Assistant dashboard. It highlights today, shows ingredients and offers on tap, uses the dark theme by default, and reloads every 5 minutes. When the plan was made with offers, a line at the top shows the store and the number of offers (*🛒 Willys Östersund · 7 erbjudanden*), and 🏷 marks meals on offer.

Embedding is blocked by default. Allow your Home Assistant address:

```env
EMBED_ALLOWED_ORIGINS=https://homeassistant.example.com
```

## Reverse proxy and HTTPS

To reach Matschema over HTTPS through a reverse proxy (e.g. nginx, Caddy, Traefik), proxy to port 3000 and set:

```env
COOKIE_SECURE=true
FORCE_HTTPS=true
```

## Data

Everything is in one SQLite database, `data/matschema.sqlite`: accounts and sessions, meals, schedules, rules, stores, offers and category corrections. Back up the `data` folder before updating or moving the app.

The container runs as root so it can write to the mounted folder without extra permission setup.

## Security

- **Login**: passwords are hashed with bcrypt, and failed logins are limited to 8 per 15 minutes per IP address.
- **Changes**: only accepted from the app's own pages; requests from other sites, including other subdomains of your domain, are refused.
- **Pages**: a Content-Security-Policy limits them to the app's own scripts and styles. Framing is blocked unless allowed, and admin pages aren't cached.
- **Input**: form fields accept plain text only, within length limits.
- **Store websites**: requests time out after 20 seconds and responses are capped at 10 MB.

## Development

Requires Node.js 22 or later.

```bash
npm install
cp .env.example .env   # set NODE_ENV=development and a SESSION_SECRET
npm run dev            # http://localhost:3000, restarts on file changes
```

| Command | Purpose |
| --- | --- |
| `npm test` | Run the tests: scheduling, rules, migrations, offer sources (against saved real responses), categories and deal-based planning. |
| `npm run seed:admin` | Create an admin account from `ADMIN_USERNAME` and `ADMIN_PASSWORD`. |
| `node scripts/seed-meals.js` | Add 31 example meals, covering every main ingredient. Meals with the same names are overwritten. |

`MATSCHEMA_DATA_DIR` points the app or a script at another data folder, e.g. a copy of real data:

```bash
cp -a data /tmp/matschema-test
MATSCHEMA_DATA_DIR=/tmp/matschema-test PORT=3200 npm start
```

In development, login sessions are kept in memory, so restarting the server logs you out.

| Path | Contents |
| --- | --- |
| `src/routes/` | Admin (`backend.js`), public pages (`frontend.js`), login |
| `src/utils/scheduler.js` | Schedule generation |
| `src/utils/rules.js` | Planning rules and defaults |
| `src/data/` | Meals and schedules (`store.js`), offers (`deals.js`) |
| `src/db/` | Database connection and migrations |
| `src/deals/sources/` | One module per chain |
| `src/deals/categories.js` | Everyday category rules |
| `src/deals/meal-deals.js` | Main ingredients, matching, store choice and the offer period |
| `views/`, `public/` | Pages, styles and browser scripts |

Pushes to `main` and `v*` tags are built by GitHub Actions, smoke-tested, scanned with Trivy and published to `ghcr.io/socawi-ai/matschema` as `latest`, `sha-<commit>` and the version tag.
