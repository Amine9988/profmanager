@echo off
REM =============================================
REM  ProfManager - Build complet (Next.js + Electron installer)
REM  Usage: double-click or run from command line
REM  Output: electron\dist\ProfManager Setup *.exe
REM =============================================
cd /d "%~dp0"
echo.
echo === ProfManager - Build complet ===
echo.

echo [1/2] Construction Next.js + Electron...
call npm run build:electron
if %errorlevel% neq 0 (
  echo ERREUR : echec de la construction.
  pause
  exit /b 1
)

echo [2/2] Verification du dossier de sortie...
if exist "electron\dist\*.exe" (
  echo.
  echo === Construction terminee avec succes ! ===
  echo.
  dir /b "electron\dist\*.exe"
  echo.
  echo Les installateurs se trouvent dans : electron\dist\
) else (
  echo ATTENTION : Aucun installateur trouve dans electron\dist\
)

echo.
pause
