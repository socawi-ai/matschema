# Matschema

Matschema är en webbapp för att planera veckans måltider.

## Vad appen gör

- Visar 3 veckor i frontend (nuvarande vecka + 2 kommande)
- Visar ingredienser i popup när man klickar på en måltid
- Har en admin/backend bakom inloggning för att:
  - hantera måltidsdatabas
  - generera och redigera veckoscheman
  - hantera användarinställningar

## Teknik

- Node.js
- Express
- EJS
- SQLite (användare)
- JSON-filer (måltider och scheman)

## Snabb setup

1. Klona repot
```bash
git clone https://github.com/socawi-ai/matschema.git
cd matschema
```

2. Installera beroenden
```bash
npm install
```

3. Skapa miljöfil
```bash
cp .env.example .env
```

4. Starta appen
```bash
npm start
```

5. Öppna i webbläsaren
- Frontend: `http://localhost:3000/`
- Login: `http://localhost:3000/auth/login`
- Backend: `http://localhost:3000/backend`

## Skapa första admin

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=your-password npm run seed:admin
```

## Första start (automatisk admin)

Vid första uppstarten (om inga användare finns) skapas en admin automatiskt.
Inloggningsuppgifter skrivs ut i server-loggen.

Valfria variabler i `.env`:

```env
DEFAULT_ADMIN_EMAIL=admin@matschema.local
DEFAULT_ADMIN_PASSWORD=valfritt-losenord
```

Om `DEFAULT_ADMIN_PASSWORD` saknas genererar appen ett slumpat lösenord och visar det i loggen.

## Miljövariabler

I `.env`:

```env
NODE_ENV=development
PORT=3000
SESSION_SECRET=replace-with-a-long-random-secret
COOKIE_SECURE=false
```
