@echo off
cd /d "%~dp0"

echo Building Next.js standalone server...
cd ..
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
cd electron

echo Copying standalone server to electron package...
if exist "standalone-server" rmdir /s /q "standalone-server"
mkdir standalone-server
xcopy /e /i /q "..\.next\standalone\*" "standalone-server\"

echo Building Electron installer...
call npx electron-builder --win
if %errorlevel% neq 0 exit /b %errorlevel%

echo Done!
