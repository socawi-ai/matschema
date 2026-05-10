# matschema

Meal planning web app built with Node.js + Express.

## Features

- Frontend is the default view (`/`) and shows a 3-week meal schedule window.
- Frontend navigation for previous/current/next 3-week windows.
- Backend admin for:
  - adding meals to a meal database
  - generating randomized weekly schedules from saved meals
  - updating the logged-in user email
  - changing the logged-in user password
- Backend is protected by login (session-based authentication).
- User accounts stored in SQLite.
- Local JSON storage for meals and generated schedules.
- Health endpoint at `/health`.

## Run locally

1. Install dependencies:
   `npm install`
2. Start server:
   `npm start`
3. Or restart server (auto-frees port `3000` first):
   `npm run restart`
4. Open:
   `http://localhost:3000`

## Environment

Copy `.env.example` to `.env` and set:
- `SESSION_SECRET` to a long random value (required in production)

## App views

- Frontend (default): `http://localhost:3000/`
- Frontend direct route: `http://localhost:3000/frontend`
- Backend login: `http://localhost:3000/auth/login`
- Backend admin (login required): `http://localhost:3000/backend`
- Health: `http://localhost:3000/health`

## Backend login setup (SQLite users)

1. Set admin credentials and create first user:
   `ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=change-me npm run seed:admin`
2. Start app:
   `npm start`
3. Sign in:
   `http://localhost:3000/auth/login`

## Data storage

- Users database: `data/matschema.sqlite`
- Meals: `data/meals.json`
- Generated schedules: `data/schedules.json`

These files are ignored by git via `.gitignore`.
