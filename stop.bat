@echo off
setlocal enabledelayedexpansion

title Stop KOTA Process

set "PROJECT_DIR=C:\Users\krish\Downloads\Web Devlopment\Office\KOTA Process"

if exist "%PROJECT_DIR%\backend\KotaProcess.Api.csproj" (
    cd /d "%PROJECT_DIR%"
) else if exist "%~dp0backend\KotaProcess.Api.csproj" (
    cd /d "%~dp0"
    set "PROJECT_DIR=%~dp0"
)

:: Read dynamic ports from .env file
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

echo ===============================================================================
echo   [STOPPING] KOTA PROCESS [BACKEND & FRONTEND]
echo ===============================================================================

echo Stopping processes on port %BACKEND_PORT% [Backend]...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%BACKEND_PORT% ^| findstr LISTENING') do (
    if not "%%a"=="" if not "%%a"=="0" (
        echo   Releasing port %BACKEND_PORT% - PID %%a
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo Stopping processes on port %FRONTEND_PORT% [Frontend]...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%FRONTEND_PORT% ^| findstr LISTENING') do (
    if not "%%a"=="" if not "%%a"=="0" (
        echo   Releasing port %FRONTEND_PORT% - PID %%a
        taskkill /F /PID %%a >nul 2>&1
    )
)

:: Also check legacy default ports if different from .env
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

taskkill /F /IM KotaProcess.Api.exe >nul 2>&1

echo.
echo   [OK] All KOTA Process background services have been stopped.
echo ===============================================================================
ping 127.0.0.1 -n 3 >nul
exit
