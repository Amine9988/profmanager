@echo off
cd /d "%~dp0"

echo === Step 1: Build Next.js standalone ===
cd ..
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
cd electron

echo === Step 2: Remove old standalone-server if exists ===
if exist "standalone-server" rmdir /s /q "standalone-server"

echo === Step 3: Copy standalone server ===
xcopy /e /i /q "..\.next\standalone" "standalone-server\"

echo === Step 4: Build Electron installer ===
call npx electron-builder --win
if %errorlevel% neq 0 exit /b %errorlevel%

echo === Step 5: Verify node_modules in output ===
if exist "dist\win-unpacked\resources\standalone-server\node_modules\next" (
    echo SUCCESS: node_modules found in packaged output
) else (
    echo ERROR: node_modules NOT found. Copying manually...
    if not exist "dist\win-unpacked\resources\standalone-server" mkdir "dist\win-unpacked\resources\standalone-server"
    xcopy /e /i /q "standalone-server\node_modules" "dist\win-unpacked\resources\standalone-server\node_modules\"
    xcopy /e /i /q "standalone-server\.next" "dist\win-unpacked\resources\standalone-server\.next\"
)

echo === Done! ===
