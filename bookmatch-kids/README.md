# BookMatch Kids

MVP for: kids describe the book they want → Gemini parses preferences → MongoDB matches in-stock books → user submits request → staff dashboard fulfills requests.

## Repo layout
- `backend` FastAPI + MongoDB
- `frontend` React + Vite + TypeScript

## Secrets and config
Use a local `.env` file that is **git-ignored**.

Two easy options:

1) Edit `.env` directly
- Copy `.env.example` to `.env`
- Fill in values

2) Use the setup script (recommended)
From `bookmatch-kids/backend`:

```
.\setup_env.ps1
```

Or from the repo root:

```
.\setup_env.cmd
```

This will prompt you for values and write both `.env` and `frontend/.env`.

## Environment
```
MONGODB_URI=mongodb://localhost:27017/bookmatch_kids
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_VERSION=v1
GOOGLE_BOOKS_API_KEY=
GOOGLE_BOOKS_ENABLED=true
STAFF_SIGNUP_CODE=
FRONTEND_BASE_URL=http://localhost:5173
DEMO_LOGIN=true
DEMO_STAFF_EMAIL=demo@bookmatch.local
DEMO_STAFF_PASSWORD=demo1234
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_NAME=Nathaniel– Deep, Meditative and Mellow
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL_ID=eleven_turbo_v2
VITE_API_BASE_URL=http://localhost:8001
```

Gemini is optional. If `GEMINI_API_KEY` is missing, the backend uses a deterministic fallback parser.
Google Books is optional. If `GOOGLE_BOOKS_ENABLED=true`, the API will pull live books when MongoDB has fewer than 5 matches and store them in MongoDB for reuse.
Authentication is enabled. Staff/Volunteer accounts require `STAFF_SIGNUP_CODE` to register.
Demo login is available when `DEMO_LOGIN=true`.
Magic volunteer links are enabled for staff to generate QR logins.

### Inventory CSV format
You can paste CSV into Staff View → **Inventory Upload**. Recommended headers:

```
title,author,description,tags,age_min,age_max,reading_level,language,format,cover_url,isbn,qty_available,location_id
```

Notes:
- `tags` can be comma or `|` separated.
- `qty_available` and `location_id` override the defaults in the upload form.

## MongoDB (local or Atlas)
Local option:
1. Install MongoDB Community Server.
2. Start it with the default port `27017`.

Atlas option:
- Create a cluster and set `MONGODB_URI` to your connection string.

## Backend
From `bookmatch-kids/backend`:

```
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Seed demo data:

```
python -m app.seed
```

Run API:

```
.\run.sh
```

API will be at `http://localhost:8001`.

## Frontend
From `bookmatch-kids/frontend`:

```
npm install
npm run dev
```

Open `http://localhost:5173`.

## Login & Roles
- **Parent/Kid**: can request books and see their latest recommendations.
- **Volunteer**: sees picklists and quick task buttons.
- **Staff**: full dashboard, inventory tools, analytics, and QR magic links.

Demo login:
1. Click **Login**
2. Click **Demo staff login**

To allow staff/volunteer registration, set `STAFF_SIGNUP_CODE` and share it with your team.

## Demo Script
Kid flow:
1. Open the Kid view.
2. Enter: “funny space adventure for a 7 year old” and click **Find books**.
3. Review results and click **Request selected**.

Staff flow:
1. Switch to Staff view.
2. Select the new request and change status (approved → picked → packed → distributed).
3. Click **View picklist** to see the volunteer picklist.
4. (Optional) Click **Seed demo requests** if you want a full queue quickly.

Volunteer flow:
1. Switch to Volunteer view.
2. Select an approved request.
3. Click **Load picklist**, then **Export CSV** or **Print**.

## Accessibility & UI
- Dark mode, high contrast, and large text toggles
- Mobile swipe navigation and bottom nav (Kid view)
- Read-to-me TTS using ElevenLabs

## Background Image
Place your image at:
`frontend/public/library-bg.jpg`

## Notes
- CORS is open for local dev.
- TTS is wired via backend `/api/tts` using ElevenLabs.
- Gemini concierge and book summaries are available via `/api/gemini/concierge` and `/api/books/summary`.
- Staff view includes a Gemini test button and key status panel.
- Staff/Volunteer views require login. Set `STAFF_SIGNUP_CODE` to allow staff/volunteer registration.
- Demo staff login button uses `DEMO_STAFF_EMAIL` and `DEMO_STAFF_PASSWORD`.
- Google Books results are auto-imported into MongoDB when enabled, so picklists work for those books too.
- MongoDB URI can be saved from Staff View → **MongoDB Setup**.
- Inventory tools: CSV upload, search, and per-book quantity update.
- Demo data: Staff View → **Seed demo requests**.

---
## Deployment Guide (Quick)

### Frontend (Vercel or Netlify)

**Vercel**
1. Create a new project from the `bookmatch-kids` repo.
2. Set **Root Directory** to `frontend`.
3. Set **Output Directory** to `dist` if it isn’t auto-detected.
4. Add env var: `VITE_API_BASE_URL` (point to your backend URL)
5. Deploy.

**Netlify**
1. New site from repo.
2. Base directory: `frontend`
3. Build command: `npm run build` (Vite build)
4. Publish directory: `dist` (relative to base)
5. Add env var: `VITE_API_BASE_URL`
6. Deploy.

### Backend (Render)

**Render**
1. New Web Service from repo.
2. Root directory: `backend`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add env vars: `MONGODB_URI`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_API_VERSION`, `GOOGLE_BOOKS_API_KEY`, `GOOGLE_BOOKS_ENABLED`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ADMIN_PIN`

After deploy, update your frontend `VITE_API_BASE_URL` to the backend public URL and redeploy the frontend.
