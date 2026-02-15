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

This will prompt you for values and write the `.env` file.

Or from the repo root:

```
.\setup_env.cmd
```

## Environment
```
MONGODB_URI=mongodb://localhost:27017/bookmatch_kids
GEMINI_API_KEY=
ELEVENLABS_API_KEY=
VITE_API_BASE_URL=http://localhost:8000
```

Gemini is optional. If `GEMINI_API_KEY` is missing, the backend uses a deterministic fallback parser.

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

API will be at `http://localhost:8000`.

## Frontend
From `bookmatch-kids/frontend`:

```
npm install
npm run dev
```

Open `http://localhost:5173`.

## Demo Script
Kid flow:
1. Open the Kid view.
2. Enter: “funny space adventure for a 7 year old” and click **Find books**.
3. Review results and click **Request these**.

Staff flow:
1. Switch to Staff view.
2. Select the new request and change status (approved → picked → packed → distributed).
3. Click **View picklist** to see the volunteer picklist.

## Notes
- CORS is enabled for `http://localhost:5173`.
- ElevenLabs integration is a UI placeholder only (no TTS call yet).
- The Staff view shows a config status banner without revealing secrets.
