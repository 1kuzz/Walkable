@echo off
REM ============================================================
REM  Kaspersky Simple Text Editor — Batch Installer / Uninstaller
REM  Pure batch-file installer that does NOT require PowerShell.
REM
REM  Default: per-user install — NO administrator privileges needed.
REM  Installs to %LOCALAPPDATA%\Programs, creates user-level
REM  shortcuts and registers in the current user's Add/Remove
REM  Programs.  Works in locked-down corporate environments.
REM
REM  Usage:
REM      install-windows.bat              Per-user interactive install
REM      install-windows.bat /silent      Per-user silent install
REM      install-windows.bat /allusers    System-wide install (admin)
REM      install-windows.bat /uninstall   Uninstall (interactive)
REM      install-windows.bat /s /u        Silent uninstall
REM      install-windows.bat /version     Show installed version
REM      install-windows.bat /help        Show this help
REM ============================================================

setlocal EnableDelayedExpansion

REM -- Configuration --------------------------------------------------------
set "AppName=Kaspersky Simple Text Editor"
set "AppSlug=KasperskySimpleTextEditor"
set "AppVbs=app\launch.vbs"
set "AppHtml=index.html"
set "IconFile=app\assets\favicon.ico"
set "VersionFile=.version"
set "Publisher=1kuzz"

REM -- Parse command-line arguments -----------------------------------------
set "MODE=install"
set "SILENT=0"
set "SHOW_VERSION=0"
set "SHOW_HELP=0"
set "ALL_USERS=0"

:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="/silent"    set "SILENT=1"      & shift & goto :parse_args
if /i "%~1"=="/s"         set "SILENT=1"      & shift & goto :parse_args
if /i "%~1"=="/uninstall" set "MODE=uninstall" & shift & goto :parse_args
if /i "%~1"=="/u"         set "MODE=uninstall" & shift & goto :parse_args
if /i "%~1"=="/allusers"  set "ALL_USERS=1"   & shift & goto :parse_args
if /i "%~1"=="/a"         set "ALL_USERS=1"   & shift & goto :parse_args
if /i "%~1"=="/version"   set "SHOW_VERSION=1" & shift & goto :parse_args
if /i "%~1"=="/v"         set "SHOW_VERSION=1" & shift & goto :parse_args
if /i "%~1"=="/help"      set "SHOW_HELP=1"   & shift & goto :parse_args
if /i "%~1"=="/?"         set "SHOW_HELP=1"   & shift & goto :parse_args
REM Ignore unknown arguments
shift
goto :parse_args
:args_done

REM -- Resolve paths based on install scope ---------------------------------
if "%ALL_USERS%"=="1" (
    set "DefaultDir=%ProgramFiles%\%AppName%"
    set "RegKey=HKLM\SOFTWARE\%AppName%"
    set "UninstallKey=HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\%AppName%"
    set "SHORTCUT_SCOPE=AllUsers"
) else (
    set "DefaultDir=%LOCALAPPDATA%\Programs\%AppName%"
    set "RegKey=HKCU\SOFTWARE\%AppName%"
    set "UninstallKey=HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\%AppName%"
    set "SHORTCUT_SCOPE=CurrentUser"
)

REM -- Show help ------------------------------------------------------------
if "%SHOW_HELP%"=="1" (
    echo.
    echo  %AppName% - Installer
    echo  ============================================================
    echo.
    echo  Usage:  install-windows.bat [options]
    echo.
    echo  Install modes:
    echo    ^(none^)          Per-user install — no admin required ^(default^)
    echo    /allusers /a    System-wide install — requires administrator
    echo.
    echo  Options:
    echo    /silent  /s      Silent install ^(no prompts^)
    echo    /uninstall /u    Uninstall the application
    echo    /s /u            Silent uninstall
    echo    /version /v      Show installed version
    echo    /help /?         Show this help message
    echo.
    echo  Per-user install location:
    echo    %LOCALAPPDATA%\Programs\%AppName%
    echo.
    echo  System-wide install location ^(/allusers^):
    echo    %ProgramFiles%\%AppName%
    echo.
    exit /b 0
)

REM -- Show version ---------------------------------------------------------
if "%SHOW_VERSION%"=="1" (
    set "TARGET_DIR=%DefaultDir%"
    call :GetInstalledVersion
    if defined INSTALLED_VER (
        echo %AppName% version !INSTALLED_VER!
    ) else (
        echo %AppName% is not installed.
    )
    exit /b 0
)

REM -- Admin elevation: only when /allusers is requested --------------------
if "%ALL_USERS%"=="1" (
    call :CheckAdmin
    if "!IS_ADMIN!"=="0" (
        call :RequestAdmin %*
        exit /b
    )
)

REM -- Locate source directory ----------------------------------------------
call :FindSourceDir
if "%SOURCE_DIR%"=="" (
    echo ERROR: Could not find application files ^(%AppHtml%^).
    echo Please run this installer from the application directory.
    if "%SILENT%"=="0" pause
    exit /b 1
)

REM -- Read source version --------------------------------------------------
call :GetSourceVersion

REM -- Route to install or uninstall ----------------------------------------
if "%MODE%"=="uninstall" goto :RouteUninstall

REM =========================================================================
REM  INSTALL
REM =========================================================================
:RouteInstall
set "TARGET_DIR=%DefaultDir%"

if "%SILENT%"=="0" (
    call :InteractiveInstall
) else (
    call :SilentInstall
)
goto :EOF

REM =========================================================================
REM  UNINSTALL
REM =========================================================================
:RouteUninstall
set "TARGET_DIR=%DefaultDir%"

REM Try to read install location from registry
for /f "tokens=2,*" %%A in ('reg query "%UninstallKey%" /v InstallLocation 2^>nul ^| findstr /i "InstallLocation"') do (
    set "TARGET_DIR=%%B"
)

if "%SILENT%"=="0" (
    call :InteractiveUninstall
) else (
    call :SilentUninstall
)
goto :EOF

REM =========================================================================
REM  Interactive Install
REM =========================================================================
:InteractiveInstall
echo.
echo  ============================================================
echo   %AppName% - Setup
echo  ============================================================
echo.

if "%ALL_USERS%"=="1" (
    echo   Mode              : System-wide ^(all users^)
) else (
    echo   Mode              : Per-user ^(no admin required^)
)

call :GetInstalledVersion
if defined INSTALLED_VER (
    echo   Installed version : v!INSTALLED_VER!
    echo   Available version : v%SOURCE_VER%
) else (
    echo   Version           : v%SOURCE_VER%
    echo   Status            : Not yet installed
)
echo.
echo   Default folder: %TARGET_DIR%
echo.

set /p "CUSTOM_DIR=  Install to [press Enter for default]: "
if not "!CUSTOM_DIR!"=="" set "TARGET_DIR=!CUSTOM_DIR!"

echo.
call :DoInstall
if errorlevel 1 (
    echo.
    echo   [ERROR] Installation failed.
    echo.
    pause
    exit /b 1
)

echo.
echo   %AppName% v%SOURCE_VER% installed successfully!
echo   Shortcuts created on Desktop and Start Menu.
echo.
pause
exit /b 0

REM =========================================================================
REM  Silent Install
REM =========================================================================
:SilentInstall
call :DoInstall
if errorlevel 1 (
    echo   Error: Installation failed.
    exit /b 1
)
echo   %AppName% %SOURCE_VER% installed successfully.
exit /b 0

REM =========================================================================
REM  Interactive Uninstall
REM =========================================================================
:InteractiveUninstall
echo.
echo  ============================================================
echo   %AppName% - Uninstall
echo  ============================================================
echo.

call :GetInstalledVersion
if not defined INSTALLED_VER (
    echo   %AppName% is not installed.
    echo.
    pause
    exit /b 0
)

echo   Installed version : v!INSTALLED_VER!
echo   Install location  : %TARGET_DIR%
echo.

set /p "CONFIRM=  Are you sure you want to uninstall? (Y/N): "
if /i not "!CONFIRM!"=="Y" (
    echo   Uninstall cancelled.
    echo.
    pause
    exit /b 0
)

echo.
call :DoUninstall
if errorlevel 1 (
    echo.
    echo   [ERROR] Uninstall failed.
    echo.
    pause
    exit /b 1
)

echo.
echo   %AppName% has been removed from your computer.
echo.
pause
exit /b 0

REM =========================================================================
REM  Silent Uninstall
REM =========================================================================
:SilentUninstall
call :GetInstalledVersion
if not defined INSTALLED_VER (
    echo   %AppName% is not installed.
    exit /b 0
)

call :DoUninstall
if errorlevel 1 (
    echo   Error: Uninstall failed.
    exit /b 1
)
echo   %AppName% has been uninstalled.
exit /b 0

REM =========================================================================
REM  DoInstall - Core install logic
REM =========================================================================
:DoInstall
echo   Creating directory...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
if errorlevel 1 (
    echo   ERROR: Could not create directory "%TARGET_DIR%"
    exit /b 1
)

echo   Copying files...
REM -- Copy individual files --
if exist "%SOURCE_DIR%\index.html" (
    copy /y "%SOURCE_DIR%\index.html" "%TARGET_DIR%\" >nul 2>&1
)
if exist "%SOURCE_DIR%\README.md" (
    copy /y "%SOURCE_DIR%\README.md" "%TARGET_DIR%\" >nul 2>&1
)

REM -- Copy folders --
if exist "%SOURCE_DIR%\app" (
    if exist "%TARGET_DIR%\app" rmdir /s /q "%TARGET_DIR%\app" >nul 2>&1
    xcopy "%SOURCE_DIR%\app" "%TARGET_DIR%\app" /E /I /Y /Q >nul 2>&1
)
if exist "%SOURCE_DIR%\docs" (
    if exist "%TARGET_DIR%\docs" rmdir /s /q "%TARGET_DIR%\docs" >nul 2>&1
    xcopy "%SOURCE_DIR%\docs" "%TARGET_DIR%\docs" /E /I /Y /Q >nul 2>&1
)
if exist "%SOURCE_DIR%\examples" (
    if exist "%TARGET_DIR%\examples" rmdir /s /q "%TARGET_DIR%\examples" >nul 2>&1
    xcopy "%SOURCE_DIR%\examples" "%TARGET_DIR%\examples" /E /I /Y /Q >nul 2>&1
)

REM -- Write version file --
>"%TARGET_DIR%\%VersionFile%" echo %SOURCE_VER%

REM -- Copy this installer to the target directory for uninstall --
echo   Copying installer...
copy /y "%~f0" "%TARGET_DIR%\install-windows.bat" >nul 2>&1

REM -- Create shortcuts --
echo   Creating shortcuts...
call :CreateShortcuts

REM -- Register in Add/Remove Programs --
echo   Registering application...
call :RegisterApp

echo   Done
exit /b 0

REM =========================================================================
REM  DoUninstall - Core uninstall logic
REM =========================================================================
:DoUninstall
echo   Removing shortcuts...
call :RemoveShortcuts

echo   Removing files...
if exist "%TARGET_DIR%" (
    rmdir /s /q "%TARGET_DIR%" >nul 2>&1
)

echo   Cleaning registry...
reg delete "%RegKey%" /f >nul 2>&1
reg delete "%UninstallKey%" /f >nul 2>&1

echo   Done
exit /b 0

REM =========================================================================
REM  Helper: Check if running as administrator
REM =========================================================================
:CheckAdmin
set "IS_ADMIN=0"
net session >nul 2>&1
if not errorlevel 1 set "IS_ADMIN=1"
exit /b

REM =========================================================================
REM  Helper: Request admin elevation via VBScript
REM =========================================================================
:RequestAdmin
set "VBS_ELEVATE=%TEMP%\elevate_%~n0.vbs"

REM Build the argument string for re-launch
set "RELAUNCH_ARGS=/allusers"
if "%SILENT%"=="1" set "RELAUNCH_ARGS=!RELAUNCH_ARGS! /silent"
if "%MODE%"=="uninstall" set "RELAUNCH_ARGS=!RELAUNCH_ARGS! /uninstall"

REM Create a temporary VBScript that uses ShellExecute with "runas"
(
    echo Set objShell = CreateObject^("Shell.Application"^)
    echo objShell.ShellExecute "%~f0", "!RELAUNCH_ARGS!", "", "runas", 1
) > "!VBS_ELEVATE!"

cscript //nologo "!VBS_ELEVATE!" 2>nul
del /f /q "!VBS_ELEVATE!" >nul 2>&1
exit /b

REM =========================================================================
REM  Helper: Find source directory (where index.html lives)
REM =========================================================================
:FindSourceDir
set "SOURCE_DIR="

REM Check script's own directory first
set "SCRIPT_DIR=%~dp0"
REM Remove trailing backslash
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

if exist "%SCRIPT_DIR%\%AppHtml%" (
    set "SOURCE_DIR=%SCRIPT_DIR%"
    exit /b
)

REM Check parent directory (repo root)
for %%I in ("%SCRIPT_DIR%\..") do set "PARENT_DIR=%%~fI"
if exist "%PARENT_DIR%\%AppHtml%" (
    set "SOURCE_DIR=%PARENT_DIR%"
    exit /b
)

exit /b

REM =========================================================================
REM  Helper: Get source version from .version file
REM =========================================================================
:GetSourceVersion
set "SOURCE_VER=1.0.0"

REM Check script directory
if exist "%SCRIPT_DIR%\%VersionFile%" (
    set /p SOURCE_VER=<"%SCRIPT_DIR%\%VersionFile%"
    exit /b
)

REM Check parent directory
if exist "%PARENT_DIR%\%VersionFile%" (
    set /p SOURCE_VER=<"%PARENT_DIR%\%VersionFile%"
    exit /b
)

exit /b

REM =========================================================================
REM  Helper: Get installed version from target directory
REM =========================================================================
:GetInstalledVersion
set "INSTALLED_VER="
set "VER_PATH=%TARGET_DIR%\%VersionFile%"

REM Also check default dir if TARGET_DIR is not set
if not defined TARGET_DIR set "VER_PATH=%DefaultDir%\%VersionFile%"

if exist "!VER_PATH!" (
    set /p INSTALLED_VER=<"!VER_PATH!"
)
exit /b

REM =========================================================================
REM  Helper: Create Desktop and Start Menu shortcuts via VBScript
REM  Uses current-user folders for per-user, AllUsers for system-wide.
REM =========================================================================
:CreateShortcuts
set "VBS_SHORTCUT=%TEMP%\create_shortcuts_%~n0.vbs"
set "ICON_PATH=%TARGET_DIR%\%IconFile%"
set "VBS_PATH=%TARGET_DIR%\%AppVbs%"

if "%SHORTCUT_SCOPE%"=="AllUsers" (
    set "SC_DESKTOP=AllUsersDesktop"
    set "SC_PROGRAMS=AllUsersPrograms"
) else (
    set "SC_DESKTOP=Desktop"
    set "SC_PROGRAMS=Programs"
)

(
    echo Set WshShell = CreateObject^("WScript.Shell"^)
    echo.
    echo ' --- Desktop shortcut ---
    echo strDesktop = WshShell.SpecialFolders^("!SC_DESKTOP!"^)
    echo Set scDesktop = WshShell.CreateShortcut^(strDesktop ^& "\%AppName%.lnk"^)
    echo scDesktop.TargetPath = "wscript.exe"
    echo scDesktop.Arguments = Chr^(34^) ^& "%VBS_PATH%" ^& Chr^(34^)
    echo scDesktop.WorkingDirectory = "%TARGET_DIR%"
    echo scDesktop.Description = "%AppName%"
    echo scDesktop.IconLocation = "%ICON_PATH%,0"
    echo scDesktop.Save
    echo.
    echo ' --- Start Menu shortcut ---
    echo strStartMenu = WshShell.SpecialFolders^("!SC_PROGRAMS!"^)
    echo Set scMenu = WshShell.CreateShortcut^(strStartMenu ^& "\%AppName%.lnk"^)
    echo scMenu.TargetPath = "wscript.exe"
    echo scMenu.Arguments = Chr^(34^) ^& "%VBS_PATH%" ^& Chr^(34^)
    echo scMenu.WorkingDirectory = "%TARGET_DIR%"
    echo scMenu.Description = "%AppName%"
    echo scMenu.IconLocation = "%ICON_PATH%,0"
    echo scMenu.Save
) > "!VBS_SHORTCUT!"

cscript //nologo "!VBS_SHORTCUT!" 2>nul
del /f /q "!VBS_SHORTCUT!" >nul 2>&1
exit /b

REM =========================================================================
REM  Helper: Remove Desktop and Start Menu shortcuts via VBScript
REM =========================================================================
:RemoveShortcuts
set "VBS_REMOVE=%TEMP%\remove_shortcuts_%~n0.vbs"

if "%SHORTCUT_SCOPE%"=="AllUsers" (
    set "SC_DESKTOP=AllUsersDesktop"
    set "SC_PROGRAMS=AllUsersPrograms"
) else (
    set "SC_DESKTOP=Desktop"
    set "SC_PROGRAMS=Programs"
)

(
    echo Set WshShell = CreateObject^("WScript.Shell"^)
    echo Set fso = CreateObject^("Scripting.FileSystemObject"^)
    echo.
    echo strDesktop = WshShell.SpecialFolders^("!SC_DESKTOP!"^) ^& "\%AppName%.lnk"
    echo If fso.FileExists^(strDesktop^) Then fso.DeleteFile strDesktop, True
    echo.
    echo strMenu = WshShell.SpecialFolders^("!SC_PROGRAMS!"^) ^& "\%AppName%.lnk"
    echo If fso.FileExists^(strMenu^) Then fso.DeleteFile strMenu, True
) > "!VBS_REMOVE!"

cscript //nologo "!VBS_REMOVE!" 2>nul
del /f /q "!VBS_REMOVE!" >nul 2>&1
exit /b

REM =========================================================================
REM  Helper: Register application in Add/Remove Programs (registry)
REM  Per-user installs use HKCU; system-wide installs use HKLM.
REM =========================================================================
:RegisterApp
set "UNINST_BAT=%TARGET_DIR%\install-windows.bat"
set "UNINST_ARGS=/uninstall /silent"
if "%ALL_USERS%"=="1" set "UNINST_ARGS=/uninstall /silent /allusers"

reg add "%UninstallKey%" /v "DisplayName"     /t REG_SZ /d "%AppName%" /f >nul 2>&1
reg add "%UninstallKey%" /v "DisplayVersion"  /t REG_SZ /d "%SOURCE_VER%" /f >nul 2>&1
reg add "%UninstallKey%" /v "Publisher"        /t REG_SZ /d "%Publisher%" /f >nul 2>&1
reg add "%UninstallKey%" /v "InstallLocation"  /t REG_SZ /d "%TARGET_DIR%" /f >nul 2>&1
reg add "%UninstallKey%" /v "UninstallString"  /t REG_SZ /d "\"%UNINST_BAT%\" %UNINST_ARGS%" /f >nul 2>&1
reg add "%UninstallKey%" /v "NoModify"         /t REG_DWORD /d 1 /f >nul 2>&1
reg add "%UninstallKey%" /v "NoRepair"         /t REG_DWORD /d 1 /f >nul 2>&1

REM Set display icon if it exists
if exist "%TARGET_DIR%\%IconFile%" (
    reg add "%UninstallKey%" /v "DisplayIcon" /t REG_SZ /d "%TARGET_DIR%\%IconFile%" /f >nul 2>&1
)

exit /b