@echo off
REM ============================================================
REM  Kaspersky Simple Text Editor — Setup
REM  Double-click this file to install. No extra tools needed.
REM  Installs for the current user only — NO admin required.
REM  Does NOT require PowerShell — uses a pure batch installer.
REM ============================================================

title Kaspersky Simple Text Editor - Setup

REM --- Locate the batch installer next to this batch file ---
set "BAT_SCRIPT=%~dp0install-windows.bat"

if not exist "%BAT_SCRIPT%" (
    echo ERROR: Cannot find install-windows.bat
    echo Expected location: %BAT_SCRIPT%
    echo.
    echo Please make sure Setup.bat and install-windows.bat are in the same folder.
    pause
    exit /b 1
)

REM --- Launch the installer (per-user by default, no admin needed) ---
call "%BAT_SCRIPT%"
