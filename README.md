# Matschema

Matschema is a meal planning web app packaged as a Docker image.

Image:

- `ghcr.io/socawi-ai/matschema:latest`

Default port:

- `3000`

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
sudo chown -R 1000:1000 data
docker compose pull
docker compose up -d
```

Open:

- `http://localhost:3000`
- `http://localhost:3000/auth/login`
- `http://localhost:3000/backend`

## Update

```bash
docker compose pull
docker compose up -d
```

## Logs

```bash
docker compose logs -f
```

## Data

Runtime data is stored in `./data` on the host and mounted into the container at `/app/data`.
The container runs as the non-root `node` user, which uses UID/GID `1000`.
The host data directory must be writable by that user:

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

This includes:

- SQLite user database
- meal data
- schedule data

Back up `./data` before replacing servers or moving the app.

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

GitHub Actions builds and publishes the image to GitHub Container Registry on pushes to `main` and tags matching `v*`.

Published tags include:

- `latest`
- `sha-*`
- version tags such as `v1.0.0`
