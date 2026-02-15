@echo off
start "Backend" powershell -NoExit -Command "Set-Location -Path 'E:\Patriot hacks 2026\Book Program\HackFax_2026\bookmatch-kids\backend'; & .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
start "Frontend" powershell -NoExit -Command "Set-Location -Path 'E:\Patriot hacks 2026\Book Program\HackFax_2026\bookmatch-kids\frontend'; npm run dev"
