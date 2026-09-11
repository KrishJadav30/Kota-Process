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

:: Strip trailing backslash if present
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

:: Read dynamic ports from .env file
set "FRONTEND_PORT=5173"
set "BACKEND_PORT=5001"

if exist "%PROJECT_DIR%\.env" (
    for /f "usebackq eol=# tokens=1* delims==" %%A in ("%PROJECT_DIR%\.env") do (
        set "ENV_KEY=%%A"
        set "ENV_VAL=%%B"
        set "ENV_KEY=!ENV_KEY: =!"
        set "ENV_VAL=!ENV_VAL: =!"
        set "ENV_VAL=!ENV_VAL:"=!"
        set "ENV_VAL=!ENV_VAL:'=!"
        if /i "!ENV_KEY!"=="FRONTEND_PORT" set "FRONTEND_PORT=!ENV_VAL!"
        if /i "!ENV_KEY!"=="BACKEND_PORT" set "BACKEND_PORT=!ENV_VAL!"
    )
)

echo ===============================================================================
echo   [STOPPING] KOTA PROCESS [BACKEND & FRONTEND]
echo ===============================================================================

:: Free ports from .env
call :FREE_PORT "!BACKEND_PORT!"
call :FREE_PORT "!FRONTEND_PORT!"

:: Safety cleanup: check legacy defaults 5001 and 5173
if not "!BACKEND_PORT!"=="5001" call :FREE_PORT "5001"
if not "!FRONTEND_PORT!"=="5173" call :FREE_PORT "5173"

:: Terminate any active or orphaned KotaProcess.Api process
taskkill /F /IM KotaProcess.Api.exe >nul 2>&1

echo.
echo   [OK] All KOTA Process background services have been stopped.
echo ===============================================================================
ping 127.0.0.1 -n 3 >nul
exit /b 0

:: -------------------------------------------------------------------------------
:: Helper Subroutine: Terminate processes listening on a specific port
:: -------------------------------------------------------------------------------
:FREE_PORT
set "TARGET_PORT=%~1"
if not "%TARGET_PORT%"=="" (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr /c:":%TARGET_PORT% " ^| findstr LISTENING') do (
        if not "%%a"=="" if not "%%a"=="0" (
            echo   Releasing port %TARGET_PORT% - PID %%a
            taskkill /F /PID %%a >nul 2>&1
        )
    )
)
exit /b 0
