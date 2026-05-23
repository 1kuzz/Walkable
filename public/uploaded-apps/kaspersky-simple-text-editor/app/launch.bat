@echo off
REM ============================================================
REM  Kaspersky Simple Text Editor — Standalone Window Launcher
REM  Opens the application in a frameless browser window
REM  (no address bar, no tabs — just the app).
REM  Tries Microsoft Edge first, then Google Chrome.
REM  Falls back to the default browser if neither is found.
REM ============================================================

setlocal

set "HTML_FILE=%~dp0..\index.html"
set "FILE_URL="

if not exist "%HTML_FILE%" (
    echo ERROR: Cannot find %HTML_FILE%
    exit /b 1
)

for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = [System.IO.Path]::GetFullPath('%HTML_FILE%'); [System.Uri]::new($path).AbsoluteUri"`) do (
    set "FILE_URL=%%U"
)

if not defined FILE_URL (
    echo ERROR: Failed to build file URL for %HTML_FILE%
    exit /b 1
)

REM --- Try Microsoft Edge (Chromium) ---
set "EDGE="
for %%P in (
    "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
    "%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
) do (
    if exist %%P (
        set "EDGE=%%~P"
        goto :launch_edge
    )
)

REM --- Try Google Chrome ---
set "CHROME="
for %%P in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
    if exist %%P (
        set "CHROME=%%~P"
        goto :launch_chrome
    )
)

REM --- Fallback: open in default browser ---
echo No Chromium browser found. Opening in default browser...
start "" "%HTML_FILE%"
goto :eof

:launch_edge
start "" "%EDGE%" "--app=%FILE_URL%" --window-size=1400,900 --allow-file-access-from-files
goto :eof

:launch_chrome
start "" "%CHROME%" "--app=%FILE_URL%" --window-size=1400,900 --allow-file-access-from-files
goto :eof
