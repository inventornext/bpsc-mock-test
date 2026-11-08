@echo off
REM Double-click to open the Paper Manager in your browser.
cd /d "%~dp0"
if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe tools\manager.py
) else (
  python tools\manager.py
)
pause
