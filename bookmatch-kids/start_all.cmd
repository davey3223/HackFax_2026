  @echo off
  setlocal

  set "ROOT=%~dp0"
  rem remove trailing backslash
  if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

  start "Backend" powershell -NoExit -Command "Set-Location -Path '%ROOT%\backend'; & .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001"
  start "Frontend" powershell -NoExit -Command "Set-Location -Path '%ROOT%\frontend'; npm run dev"

  endlocal 	