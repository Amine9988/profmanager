@echo off
REM =============================================
REM  ProfManager - Script de reconstruction
REM  Utilisation : double-clic ou ligne de commande
REM =============================================
echo.
echo === ProfManager Desktop Builder ===
echo.

cd /d "%~dp0electron"

echo [1/3] Installation des dependances...
call npm install
if %errorlevel% neq 0 (
  echo ERREUR : echec de l'installation des dependances.
  pause
  exit /b 1
)

echo [2/3] Construction de l'application...
call npm run build:win
if %errorlevel% neq 0 (
  echo ERREUR : echec de la construction.
  pause
  exit /b 1
)

echo [3/3] Copie des fichiers vers le bureau...
set desktop=%USERPROFILE%\Desktop\ProfManager-Desktop
if not exist "%desktop%" mkdir "%desktop%"
copy /Y "dist\ProfManager Setup 1.0.0.exe" "%desktop%\" >nul
copy /Y "dist\ProfManager-Portable-1.0.0.exe" "%desktop%\" >nul
copy /Y "dist\latest.yml" "%desktop%\" >nul

echo.
echo === Construction terminee avec succes ! ===
echo.
echo Les fichiers se trouvent ici :
echo   %desktop%
echo.
echo - ProfManager Setup 1.0.0.exe  (installateur)
echo - ProfManager-Portable-1.0.0.exe (portable)
echo.
pause
