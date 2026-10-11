# Matschema

Matschema is a self-hosted weekly meal planning app, packaged as a Docker image. It plans dinners for the current week and two weeks ahead, can prioritize meals whose main ingredient is on offer at your local grocery store, and has a public read-only schedule plus a compact view for Home Assistant dashboards.

The interface is in Swedish.

Image:

- `ghcr.io/socawi-ai/matschema:latest`
- Version tags are also published, e.g. `ghcr.io/socawi-ai/matschema:v0.4.0`

Default port:

- `3000`

## Features

- **Meal library**: each meal has a type (regular, vegetarian or fish), an optional ⭐ special flag for weekend dishes, and an ingredient list.
- **Automatic 3-week schedule**: fills the current week and two weeks ahead from configurable rules. You set how many fish and vegetarian meals per week, which days may be vegetarian, and which days are special days (e.g. Friday/Saturday, optionally sharing one dish). No dish repeats within a week, and dishes vary across weeks too: an ordinary dish isn't planned two weeks in a row, and a weekend special comes back three weeks later at the earliest, whenever there are alternatives. If there aren't enough meals, the leftover days show "Rester" (leftovers) instead.
- **Your choices are kept**: pick a meal, write a one-off meal, mark leftovers or reroll a day. Days you set yourself are never overwritten by the generator.
- **Food deals**: this week's offers from Willys, ICA, Coop and Lidl, fetched automatically. They're sorted into everyday grocery categories (dairy, meat, chicken, fish, vegetables, pasta …) with manual corrections and a "new this week" check.
- **Deal-based planning**: meals whose main ingredient is on offer at the one store you'll shop at are picked first for the days you're shopping for.
- **Public schedule** at `/frontend`: three weeks, today highlighted, meal-type markers, ingredients on tap.
- **Home Assistant view** at `/frontend/ha`: a compact, iframe-friendly schedule for dashboards.
- **Light/dark theme**: follows the system setting until you choose, then remembered per browser.
- **Self-contained**: one container, one SQLite database in `./data`, data migrations run automatically on startup.

## Quick Start

Create a `.env` file next to `docker-compose.yml`:

```env
SESSION_SECRET=replace-with-a-long-random-secret
COOKIE_SECURE=false
FORCE_HTTPS=false
AUTO_BOOTSTRAP_ADMIN=true
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=change-this-password
```

Start the app:

```bash
mkdir -p data
docker compose pull
docker compose up -d
```

Open:

- `http://localhost:3000`: public 3-week schedule
- `http://localhost:3000/frontend/ha`: compact view for Home Assistant
- `http://localhost:3000/auth/login`: admin login
- `http://localhost:3000/backend`: admin

## Configuration

All settings are environment variables (set in `.env` when using Compose).

| Variable | Default | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | – (required) | Secret for signing login sessions. Use a long random value. |
| `TZ` | `Europe/Stockholm` (Compose) | Timezone for "today", week starts and offer end dates. Without it the container runs on UTC and shows yesterday as today for an hour or two after midnight. |
| `COOKIE_SECURE` / `FORCE_HTTPS` | `false` | Set both to `true` behind an HTTPS reverse proxy. See [Reverse Proxy / HTTPS](#reverse-proxy--https). |
| `EMBED_ALLOWED_ORIGINS` | empty | Origins allowed to embed the app in an iframe (comma-separated). See [Home Assistant Embedding](#home-assistant-embedding). |
| `AUTO_BOOTSTRAP_ADMIN` | `false` | Create the first admin account on startup if there is none. |
| `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` | `admin` / generated | Credentials for that first admin account. Change the password in the admin afterwards. |
| `DEALS_AUTO_REFRESH` | `true` | Fetch store offers automatically. `false` = only when you press "Uppdatera nu". |
| `PORT` | `3000` | Port inside the container. |

## Using the Admin

The admin at `/backend` has four tabs.

### 📅 Schema

The three planned weeks, one row per day.

- **✨ Fyll tomma dagar** fills every empty day for the planning horizon (3 weeks by default) according to the rules. Days that already have a meal are left alone.
- **Click a meal** to change it. The picker lets you search meals, write a one-off meal (type a name and press Enter), choose 🍱 Rester/Matlåda (leftovers), 🎲 a random meal that fits the day, or *Töm dagen* to empty the day for the next fill.
- **🎲** next to a day rerolls just that day, keeping the day's type (fish stays fish, special stays special) and avoiding dishes already used that week.
- **🗑** removes a whole week. It can be filled again afterwards.

Every day remembers whether you chose it or the generator did. Anything you set (a picked meal, a one-off meal, leftovers, 🎲) counts as **your choice** and is never replaced by the generator. *Töm dagen* hands the day back to the generator.

When deals are in use, this tab also has the store choice and **🏷 Planera om med erbjudanden** (see [Deal-Based Planning](#deal-based-planning)).

### 🍽 Måltider

The meal library, searchable by name or ingredient. Click a meal to edit its name, type (Vanlig / Vegetarisk / Fisk), ⭐ special flag and ingredients (one per line). Each meal shows its **main ingredient** (e.g. 🍗 Kyckling), and the editor shows the category of every ingredient with ✎ to correct it.

Deleting a meal keeps it on days where it's already planned, as a one-off meal with the same name.

### 🏷 Erbjudanden

Current offers from the configured stores (see [Food Deals](#food-deals)).

- **Gäller idag / Nästa vecka**: what's valid today, or in the coming week. Next week shows offers already published for it plus current offers that run on into it.
- **🛒 Vardagsvaror** (default): only everyday groceries, grouped by category, with a category filter.
- **Alla erbjudanden**: everything, with the rest under "Övrigt".
- **🆕 Nya varor**: products first seen in the last week. These are the ones most likely to land in the wrong category, so it's a quick weekly check.
- **✎** on an offer moves that product to another category, or marks it "Inte vardagsvara". The correction is stored per product name and applies to all stores and future weeks. Corrected products show ✋.
- Search, a store filter, today's date and "Slutar idag" for offers ending today.
- A switch per store, its status (number of offers, last fetch, or the error if a fetch failed) and **Uppdatera nu** to fetch immediately.

### ⚙️ Inställningar

- **Planning rules** (saved automatically, with a plain-language summary): fish and vegetarian meals per week, weeks ahead, special days and whether they share one dish, which days may be vegetarian, whether to prioritize deal meals, and which stores you do your big shop at.
- **Account**: change username and password.

## Food Deals

Offers are fetched straight from each chain's own website:

| Chain | Source | Scope |
| --- | --- | --- |
| Willys | the campaign search behind willys.se's store pages | per store |
| ICA | the offers embedded in the store's page on ica.se/erbjudanden | per store |
| Coop | the offers API used by coop.se's store pages | per store |
| Lidl | the weekly campaign pages linked from lidl.se (with each product's in-store period) | national |

The stores are currently set up for Östersund: Willys Östersund, ICA Maxi Östersund, ICA Kvantum Lillänge, Stora Coop Östersund and Lidl. Each store can be switched on and off in the admin. Offers are fetched automatically (each store every 12 hours, every 3 hours on weekends when next week's offers tend to appear; one store at a time) and when you press **Uppdatera nu**.

None of the chains offer a public API, so these sources can break when a chain changes its website. When that happens the admin shows the error for that store and keeps its last fetched offers until they expire; the other stores are unaffected.

### Everyday categories

Each offer is sorted into one of these categories by keywords in its name. Some chains also provide their own category, which is used to rule out non-food and as a fallback.

Mejeri & matfett · Ost (påläggs- & hårdost) · Ägg · Kött · Köttfärs · Kyckling · Korv & bacon · Fisk & skaldjur · Vegetariskt protein · Grönsaker · Frysta grönsaker · Potatis · Pasta · Ris & gryn · Mjöl & bakning · Kaffe & te

Some categories are deliberately narrow:

- **Mejeri & matfett** covers milk, cream, crème fraiche, butter, margarine and cooking oils. Yoghurt counts only as ordinary breakfast yoghurt and filmjölk in packs of 500 g/ml or more, so no kvarg, drinking yoghurt or dessert cups.
- **Ost** covers sliceable and hard grating cheese only. Mozzarella, brie, cream cheese and the like don't count.
- Snacks, sweets, drinks, bread, ready meals, cold cuts, canned goods and non-food don't count as everyday groceries.

Name-based sorting gets most products right but not all, especially brand names without a describing word. Use ✎ to correct those, and check 🆕 Nya varor now and then. The rules live in `src/deals/categories.js`.

The data is for personal use in your own household's meal planning. Don't republish it.

## Deal-Based Planning

The schedule can pick meals whose main ingredient is on offer, at the one store you'll do your big shop at.

1. **Main ingredient.** Each ingredient gets the same category an offer with that name would get. A meal's main ingredient is its protein: Kött, Köttfärs, Kyckling, Korv & bacon, Fisk & skaldjur or Vegetariskt protein. Beans and lentils only count when there's no meat or fish, so in chili con carne the mince is what counts. Meals without one, like a mushroom risotto, are never prioritized. Correct an ingredient's category with ✎ in the meal editor.
2. **Matching.** A meal is a *deal meal* when the store has an offer for its main ingredient, valid now, in the same category. The product name must contain the ingredient ("Kyckling" → "Kycklingbröstfilé", "Lax" → "Laxfilé 4-pack"), or the ingredient must end with a word from the product name ("Röda linser" → "Bönor, kikärtor, linser"). The same category alone isn't enough: every store has some meat on offer every week, so everything would match.
3. **Store.** You do your big shop at one store at a time. Under Inställningar, choose the stores you shop at (by default Willys Östersund, ICA Maxi Östersund and ICA Kvantum Lillänge). Under Schema, **Handla på** is either *Automatiskt* (the store with offers for the most of your meals, with a comparison shown) or a store you pick, which is remembered.
4. **Period.** Shopping happens before Friday, so the offers are used for the days from Friday this week (or today, if later) through Sunday two weeks ahead. Earlier days are considered already bought for.
5. **Generation.** In that period, *Fyll tomma dagar* picks deal meals from the chosen store first, filling the period's days first so earlier days don't use them up. The usual rules still apply: fish days get fish, vegetarian days vegetarian, special days ⭐, and no repeats within a week. Variety across weeks comes before deals: for each day the generator picks, in order, a deal meal not planned in nearby weeks, then any meal not planned nearby, then a deal meal, then anything. Nearby means the week before and after for ordinary dishes, and two weeks either side for specials. So a store with two specials on offer gets one on each of the next two weekends, rather than the same one twice. Buying for the freezer still works: an offer on chicken counts for all your chicken dishes, so two weeks can use the same offer through different meals.
6. **Re-planning.** **🏷 Planera om med erbjudanden** empties the generator's days in the period and fills them again with the current offers. Your own choices are kept.
7. **Why.** Days with a deal meal show **🏷**. Click it to see the offer behind it (product, price, store, valid until).

Deal prioritization can be switched off under Inställningar.

Things to know:

- Offers change weekly. 🏷 always reflects the current offers, so a day planned last week may lose its 🏷 while keeping its meal.
- Planning on a weekend uses the offers valid that day, which usually end on Sunday.
- Write ingredients the way stores name them ("Kycklingbröstfilé", "Blandfärs") if you want them to match specific offers.

## Update

```bash
cp -a data data-backup-$(date +%F)   # back up first
docker compose pull
docker compose up -d
docker compose logs -f
```

Your meals, schedules, settings and user accounts live in `./data`, which is bind-mounted into the container, so updating the image keeps them. When a new version changes how data is stored, the app migrates the database automatically on startup, before it starts serving requests. Each migration runs once, inside a transaction. If one fails, nothing is changed and the container stops with an error.

To pin a specific release instead of tracking `latest`, set the image tag in `docker-compose.yml`, e.g. `ghcr.io/socawi-ai/matschema:v0.4.0`.

### Upgrading from v0.4 or earlier

Older versions stored meals and schedules in `meals.json` and `schedules.json`. Newer versions keep everything in `matschema.sqlite`. On the first start of the new image the app:

1. Imports both files into the database. Meal IDs are kept, so planned days keep pointing at the right meals.
2. Renames the files to `meals.json.migrated` and `schedules.json.migrated` as a backup.

The log reports how many meals and weeks were moved:

```bash
docker compose logs matschema | grep -i migrer
```

If a JSON file can't be read, the migration is rolled back, nothing in `./data` is changed, and the container stops with an error that names the file. Fix or restore the file and start it again.

The same startup also adds the tables for food deals and category corrections. It also marks every day that already has a meal as **your choice**, so nothing you planned is replaced by mistake. As a result, *Planera om med erbjudanden* won't touch those existing weeks. To let a week be re-planned, remove it with 🗑 and press *Fyll tomma dagar* once.

Two more changes come with the upgrade:

- Planning rules used to be saved per admin user. They are now shared, and the most recently saved rules are carried over.
- Add `TZ=Europe/Stockholm` (or your timezone) to your environment if your Compose file doesn't have it yet.

The upgrade is one-way: an older image won't see data added after the migration. To go back, restore the backup taken before updating.

## Data

Runtime data is stored in `./data` on the host and mounted into the container at `/app/data`. The container runs as root so it can write to bind-mounted host data directories without extra ownership setup.

```bash
mkdir -p data
```

Everything is stored in the SQLite database `matschema.sqlite`:

- users and login sessions
- meals and schedules, including whether each day was your choice or generated
- planning rules
- stores, fetched offers, category corrections, and when each product was first seen

After an upgrade from v0.4 or earlier you may also see `meals.json.migrated` and `schedules.json.migrated`: the old files, kept as a backup and no longer read.

The app creates the database if it doesn't exist and never overwrites existing data on startup or update. Back up `./data` before updating, replacing servers or moving the app.

## Public Schedule

`/frontend` shows the current week and the next two:

- today's row is highlighted
- every day shows its date, and every week its date range
- 🐟, 🥕 and ⭐ mark fish, vegetarian and special meals
- tapping a meal shows its ingredients

A page left open, such as a tablet in the kitchen, reloads itself when it's shown again after midnight or after 30 minutes, so "today" stays right.

## Home Assistant Embedding

`/frontend/ha` is designed to be embedded as an iframe card in a Home Assistant dashboard. It highlights today, opens ingredients on tap, defaults to the dark theme and reloads every 5 minutes so schedule changes show up.

Iframe embedding is blocked by default; allow it from your Home Assistant origin with:

```env
EMBED_ALLOWED_ORIGINS=https://homeassistant.example.com
```

Multiple origins can be comma-separated.

## Reverse Proxy / HTTPS

If the app runs behind HTTPS through a reverse proxy, set:

```env
COOKIE_SECURE=true
FORCE_HTTPS=true
```

If you run it directly over plain HTTP, keep:

```env
COOKIE_SECURE=false
FORCE_HTTPS=false
```

## Security

- **Login:** passwords are hashed with bcrypt. Login attempts are rate-limited per IP address (8 failures per 15 minutes). Logging in starts a new session.
- **Changes only from the app's own pages:** requests that change something are refused when the browser reports they come from another site, including sibling subdomains on the same home domain. Login cookies are `HttpOnly` and `SameSite=Lax`.
- **Headers:** a Content-Security-Policy limits the pages to the app's own scripts, styles and requests and blocks form posts elsewhere. Framing is blocked unless allowed with `EMBED_ALLOWED_ORIGINS`. Admin pages are sent with `Cache-Control: no-store`.
- **Input:** form fields only accept plain text, within length limits (e.g. 100 characters for meal names, 50 ingredients per meal).
- **Store websites:** responses are size-limited (10 MB) and time out after 20 seconds.

## Docker Run

Compose is recommended because it keeps the volume and environment configuration explicit. A direct `docker run` example:

```bash
docker run -d \
  --name matschema \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e TZ=Europe/Stockholm \
  -e PORT=3000 \
  -e SESSION_SECRET="replace-with-a-long-random-secret" \
  -e COOKIE_SECURE=false \
  -e FORCE_HTTPS=false \
  -v "$PWD/data:/app/data" \
  ghcr.io/socawi-ai/matschema:latest
```

## Local Development

Requires Node.js 22 or later.

```bash
npm install
cp .env.example .env     # then set NODE_ENV=development and a SESSION_SECRET
npm run dev              # restarts on file changes
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm test` | Run the test suite (Node's built-in test runner). Covers the scheduler, planning rules, data migrations, the deal sources (against saved copies of real responses in `test/fixtures/deals`), the category rules and deal-based planning. |
| `npm run seed:admin` | Create an admin account from `ADMIN_USERNAME` and `ADMIN_PASSWORD`. |
| `node scripts/seed-meals.js` | Add or update a set of 31 example meals covering every main-ingredient category. Existing meals with the same names are overwritten. |

Set `MATSCHEMA_DATA_DIR` to run the app, or a script, against another data directory, e.g. a copy of your real data for testing:

```bash
cp -a data /tmp/matschema-test
MATSCHEMA_DATA_DIR=/tmp/matschema-test PORT=3200 npm start
```

In development mode, login sessions are kept in memory, so restarting the server logs you out.

Code layout:

| Path | Contents |
| --- | --- |
| `src/routes/` | Admin (`backend.js`), public pages (`frontend.js`), login |
| `src/utils/scheduler.js` | Schedule generation |
| `src/utils/rules.js` | Planning rules and their defaults |
| `src/data/` | Data access: meals and schedules (`store.js`), deals (`deals.js`) |
| `src/db/` | Database connection and migrations (`migrations.js`) |
| `src/deals/sources/` | One module per chain for fetching offers |
| `src/deals/categories.js` | Everyday category rules |
| `src/deals/meal-deals.js` | Main ingredients, matching, store choice and the deal period |
| `views/`, `public/` | Pages, styles and browser scripts |

## Container Publishing

GitHub Actions builds and publishes the image to GitHub Container Registry on pushes to `main` and tags matching `v*`. Every build is smoke-tested and scanned with Trivy before publishing.

Published tags include:

- `latest`
- `sha-*`
- version tags such as `v0.4.0`
