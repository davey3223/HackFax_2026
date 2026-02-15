@echo off
start "Backend" powershell -NoExit -Command "Set-Location -Path 'E:\Patriot hacks 2026\Book Program\HackFax_2026_main branch\bookmatch-kids\backend'; & .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001"
start "Frontend" powershell -NoExit -Command "Set-Location -Path 'E:\Patriot hacks 2026\Book Program\HackFax_2026_main branch\bookmatch-kids\frontend'; npm run dev"
