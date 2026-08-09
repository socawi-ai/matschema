# Matschema

Matschema is a self-hosted weekly meal planning app, packaged as a Docker image. It plans meals across the current week and two weeks ahead, and includes an admin backend for managing the meal library and planning rules.

Image:

- `ghcr.io/socawi-ai/matschema:latest`
- Version tags are also published, e.g. `ghcr.io/socawi-ai/matschema:v0.4.0`

Default port:

- `3000`

## Features

- **Meal database** — meals tagged as regular, vegetarian, fish, or special, each with a free-text ingredient list.
- **Automatic 3-week schedule** — generates the current week plus two weeks ahead based on configurable rules: how many fish/vegetarian meals per week, which days allow vegetarian meals, and which days (e.g. Friday/Saturday) always share the same special dish.
- **No repeats within a week** — every day gets a distinct dish, except the shared special-day dish by design. If there aren't enough different meals on file to fill every day, the leftover days show "Rester" (leftovers) instead of repeating a dish.
- **Manual overrides** — swap any day to a specific meal, a one-off custom meal, or randomize it.
- **Ingredient viewer** — click a meal on the public view to see its ingredients.
- **Home Assistant view** — a compact, iframe-friendly schedule view at `/frontend/ha` for dashboard embedding.
- **Light/dark theme**, remembered per browser.

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

- `http://localhost:3000` — public 3-week schedule
- `http://localhost:3000/frontend/ha` — compact view for Home Assistant
- `http://localhost:3000/auth/login` — admin login
- `http://localhost:3000/backend` — admin (meal database, planning rules, schedule editing)

## Update

```bash
docker compose pull
docker compose up -d
```

Your meal library, schedules, and user database live in `./data`, which is bind-mounted into the container — updating the image never touches it. See [Data](#data) below.

To pin a specific release instead of tracking `latest`, set the image tag in `docker-compose.yml`, e.g. `ghcr.io/socawi-ai/matschema:v0.4.0`.

## Logs

```bash
docker compose logs -f
```

## Data

Runtime data is stored in `./data` on the host and mounted into the container at `/app/data`. The container runs as root so it can write to bind-mounted host data directories without extra ownership setup.

```bash
mkdir -p data
```

This includes:

- SQLite user database (`matschema.sqlite`)
- meal data (`meals.json`)
- schedule data (`schedules.json`)

The app only creates these files if they don't already exist — it never overwrites existing data on startup or update. Back up `./data` before replacing servers or moving the app.

## Home Assistant Embedding

`/frontend/ha` is designed to be embedded as an iframe card in a Home Assistant dashboard. Iframe embedding is blocked by default; allow it from your Home Assistant origin with:

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

## Docker Run

Compose is recommended because it keeps the volume and environment configuration explicit. A direct `docker run` example:

```bash
docker run -d \
  --name matschema \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e SESSION_SECRET="replace-with-a-long-random-secret" \
  -e COOKIE_SECURE=false \
  -e FORCE_HTTPS=false \
  -v "$PWD/data:/app/data" \
  ghcr.io/socawi-ai/matschema:latest
```

## Local Development

```bash
npm install
cp .env.example .env
npm start
```

## Container Publishing

GitHub Actions builds and publishes the image to GitHub Container Registry on pushes to `main` and tags matching `v*`. Every build is smoke-tested and scanned with Trivy before publishing.

Published tags include:

- `latest`
- `sha-*`
- version tags such as `v0.4.0`
