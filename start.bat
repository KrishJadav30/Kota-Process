@echo off
setlocal enabledelayedexpansion

title KOTA Process - Background Auto-Starter

:: ===============================================================================
:: Project Directory Configuration
:: ===============================================================================
set "PROJECT_DIR=C:\Users\krish\Downloads\Web Devlopment\Office\KOTA Process"

:: If this .bat file is placed in Windows Startup (shell:startup) or another folder,
:: navigate to the configured project directory. If not found, fallback to script directory.
if exist "%PROJECT_DIR%\backend\KotaProcess.Api.csproj" (
    cd /d "%PROJECT_DIR%"
) else if exist "%~dp0backend\KotaProcess.Api.csproj" (
    cd /d "%~dp0"
    set "PROJECT_DIR=%~dp0"
) else (
    echo [ERROR] Could not locate KOTA Process project directory at:
    echo         "%PROJECT_DIR%"
    echo Please verify the folder path.
    pause
    exit /b 1
)

:: ===============================================================================
:: Read Dynamic Ports from root .env file
:: ===============================================================================
set "FRONTEND_PORT=5173"
set "BACKEND_PORT=5001"

if exist "%PROJECT_DIR%\.env" (
    for /f "usebackq eol=# tokens=1* delims==" %%A in ("%PROJECT_DIR%\.env") do (
        set "ENV_KEY=%%A"
        set "ENV_VAL=%%B"
        for /f "tokens=* delims= " %%K in ("!ENV_KEY!") do set "ENV_KEY=%%K"
        for /f "tokens=* delims= " %%V in ("!ENV_VAL!") do set "ENV_VAL=%%V"
        if /i "!ENV_KEY!"=="FRONTEND_PORT" set "FRONTEND_PORT=!ENV_VAL!"
        if /i "!ENV_KEY!"=="BACKEND_PORT" set "BACKEND_PORT=!ENV_VAL!"
    )
)

set "FRONTEND_URL=http://localhost:%FRONTEND_PORT%"
set "BACKEND_URL=http://localhost:%BACKEND_PORT%"

echo ===============================================================================
echo   ^> KOTA PROCESS - BACKGROUND SERVICE LAUNCHER
echo ===============================================================================
echo   Folder   : %CD%
echo   Config   : .env [Dynamic Port Synchronization]
echo   Frontend : %FRONTEND_URL% [Port %FRONTEND_PORT%]
echo   Backend  : %BACKEND_URL% [Port %BACKEND_PORT%]
echo ===============================================================================
echo.

:: ===============================================================================
:: Step 1: Check and Free Ports (Dynamic from .env)
:: ===============================================================================
echo [1/4] Checking and freeing ports %BACKEND_PORT% [Backend] and %FRONTEND_PORT% [Frontend]...

:: Terminate any active process holding BACKEND_PORT
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%BACKEND_PORT% ^| findstr LISTENING') do (
    if not "%%a"=="" if not "%%a"=="0" (
        echo       Releasing port %BACKEND_PORT% - PID %%a
        taskkill /F /PID %%a >nul 2>&1
    )
)

:: Terminate any active process holding FRONTEND_PORT
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%FRONTEND_PORT% ^| findstr LISTENING') do (
    if not "%%a"=="" if not "%%a"=="0" (
        echo       Releasing port %FRONTEND_PORT% - PID %%a
        taskkill /F /PID %%a >nul 2>&1
    )
)

:: Safety cleanup: If ports changed from defaults (5001 / 5173), also free legacy defaults
if not "%BACKEND_PORT%"=="5001" (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5001 ^| findstr LISTENING') do (
        if not "%%a"=="" if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
    )
)
if not "%FRONTEND_PORT%"=="5173" (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
        if not "%%a"=="" if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
    )
)

:: Ensure any orphaned KotaProcess.Api process is terminated
taskkill /F /IM KotaProcess.Api.exe >nul 2>&1

:: Wait 1 second to ensure ports are completely freed
ping 127.0.0.1 -n 2 >nul

:: ===============================================================================
:: Step 2: Start Backend Web API in the Background
:: ===============================================================================
echo [2/4] Starting KOTA Process Backend Web API on port %BACKEND_PORT% in background...
powershell -NoProfile -Command "Start-Process -FilePath 'dotnet' -ArgumentList 'run --no-launch-profile' -WorkingDirectory '%CD%\backend' -WindowStyle Hidden"

:: ===============================================================================
:: Step 3: Start Frontend Dev Server in the Background
:: ===============================================================================
echo [3/4] Starting KOTA Process Frontend UI on port %FRONTEND_PORT% in background...
powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run dev' -WorkingDirectory '%CD%\frontend' -WindowStyle Hidden"

:: ===============================================================================
:: Step 4: Verify and Launch Web Browser
:: ===============================================================================
echo [4/4] Verifying background services and launching browser...

:: Wait 3 seconds for background servers to initialize
ping 127.0.0.1 -n 4 >nul

:: Open dynamic frontend URL in default browser
start "" "%FRONTEND_URL%"

echo.
echo ===============================================================================
echo   [OK] KOTA Process is now active and running in the background!
echo   Frontend : %FRONTEND_URL%
echo   Backend  : %BACKEND_URL%
echo   Closing launcher window...
echo ===============================================================================

ping 127.0.0.1 -n 3 >nul
exit
