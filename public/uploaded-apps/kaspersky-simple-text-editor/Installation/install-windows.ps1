<#
.SYNOPSIS
    Kaspersky Simple Text Editor - GUI Installer / Uninstaller
.DESCRIPTION
    Graphical installer that copies the application into Program Files,
    creates Start Menu and Desktop shortcuts, and registers in
    Add/Remove Programs.  Supports install, update and uninstall.
.NOTES
    Run from PowerShell (administrator privileges will be requested):
        powershell -ExecutionPolicy Bypass -File install.ps1

    Silent / CLI mode:
        install.ps1 -Silent              Install silently
        install.ps1 -Silent -Uninstall   Uninstall silently
        install.ps1 -Version             Show installed version
#>

param(
    [switch]$Uninstall,
    [switch]$Silent,
    [switch]$Version,
    [string]$InstallDir = ""
)

# -- Configuration ----------------------------------------------------------
$AppName       = "Kaspersky Simple Text Editor"
$AppExe        = "app\launch.bat"
$AppVbs        = "app\launch.vbs"
$AppHtml       = "index.html"
$IconFile      = "app\assets\favicon.ico"
$DefaultDir    = Join-Path $env:ProgramFiles $AppName
$RegKey        = "HKLM:\SOFTWARE\$AppName"
$UninstallKey  = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$AppName"
$VersionFile   = ".version"

# -- Helpers ----------------------------------------------------------------
function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-InstalledVersion {
    $dir = if ($InstallDir) { $InstallDir } else { $DefaultDir }
    $vf  = Join-Path $dir $VersionFile
    if (Test-Path $vf) { return (Get-Content $vf -Raw).Trim() }
    return $null
}

function Get-SourceVersion {
    # Look in script directory first, then parent (repo root)
    $vf = Join-Path $PSScriptRoot $VersionFile
    if (Test-Path $vf) { return (Get-Content $vf -Raw).Trim() }
    $vf = Join-Path (Split-Path $PSScriptRoot -Parent) $VersionFile
    if (Test-Path $vf) { return (Get-Content $vf -Raw).Trim() }
    return "1.0.0"
}

# -- Show version (CLI) -----------------------------------------------------
if ($Version) {
    $v = Get-InstalledVersion
    if ($v) { Write-Host "$AppName version $v" -ForegroundColor Green }
    else    { Write-Host "$AppName is not installed." -ForegroundColor Yellow }
    exit 0
}

# -- Request admin if needed -------------------------------------------------
if (-not (Test-Admin)) {
    $argList = "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($Uninstall)   { $argList += " -Uninstall" }
    if ($Silent)      { $argList += " -Silent" }
    if ($InstallDir)  { $argList += " -InstallDir `"$InstallDir`"" }
    try {
        Start-Process powershell.exe -ArgumentList $argList -Verb RunAs
    } catch {
        if (-not $Silent) {
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.MessageBox]::Show(
                "Administrator privileges are required to install $AppName.",
                $AppName, "OK", "Error") | Out-Null
        }
    }
    exit
}

# ---------------------------------------------------------------------------
#  Core install / uninstall logic (no UI)
# ---------------------------------------------------------------------------
function Invoke-Install {
    param([string]$TargetDir, [scriptblock]$OnProgress)

    # Look in script directory first, then parent (repo root)
    $SourceDir  = $PSScriptRoot
    if (-not (Test-Path (Join-Path $SourceDir $AppHtml))) {
        $parentDir = Split-Path $PSScriptRoot -Parent
        if (Test-Path (Join-Path $parentDir $AppHtml)) {
            $SourceDir = $parentDir
        }
    }
    $NewVersion = Get-SourceVersion

    # Resolve source directory (support ZIP archives)
    if (-not (Test-Path (Join-Path $SourceDir $AppHtml))) {
        # Search for ZIP in script dir and parent dir
        $zip = Get-ChildItem -Path $PSScriptRoot -Filter "*.zip" | Select-Object -First 1
        if (-not $zip) {
            $zip = Get-ChildItem -Path (Split-Path $PSScriptRoot -Parent) -Filter "*.zip" | Select-Object -First 1
        }
        if ($zip) {
            & $OnProgress "Extracting archive..."
            $tmp = Join-Path $env:TEMP "${AppName}_install_temp"
            if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
            Expand-Archive -Path $zip.FullName -DestinationPath $tmp -Force
            $idx = Get-ChildItem -Path $tmp -Filter "index.html" -Recurse | Select-Object -First 1
            if ($idx) { $SourceDir = $idx.DirectoryName }
            else { throw "Could not find index.html inside the archive." }
        } else {
            throw "No application files or ZIP archive found in $SourceDir"
        }
    }

    # Create target directory
    & $OnProgress "Creating directory..."
    if (-not (Test-Path $TargetDir)) {
        New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    }

    # Copy files
    & $OnProgress "Copying files..."
    $filesToCopy   = @("index.html", "README.md")
    $foldersToCopy = @("app", "docs", "examples")

    foreach ($f in $filesToCopy) {
        $src = Join-Path $SourceDir $f
        if (Test-Path $src) { Copy-Item $src -Destination $TargetDir -Force }
    }
    foreach ($d in $foldersToCopy) {
        $src = Join-Path $SourceDir $d
        if (Test-Path $src) {
            $dest = Join-Path $TargetDir $d
            if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
            Copy-Item $src -Destination $TargetDir -Recurse -Force
        }
    }

    # Write version file
    Set-Content -Path (Join-Path $TargetDir $VersionFile) -Value $NewVersion

    # Create shortcuts
    & $OnProgress "Creating shortcuts..."
    $WScript  = New-Object -ComObject WScript.Shell
    $iconPath = Join-Path $TargetDir $IconFile
    $vbsPath  = Join-Path $TargetDir $AppVbs

    # Desktop shortcut
    $deskLink = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "$AppName.lnk"
    $sc = $WScript.CreateShortcut($deskLink)
    $sc.TargetPath       = "wscript.exe"
    $sc.Arguments        = "`"$vbsPath`""
    $sc.WorkingDirectory = $TargetDir
    $sc.Description      = $AppName
    if (Test-Path $iconPath) { $sc.IconLocation = "$iconPath,0" }
    $sc.Save()

    # Start Menu shortcut
    $smDir  = Join-Path ([Environment]::GetFolderPath("CommonStartMenu")) "Programs"
    $smLink = Join-Path $smDir "$AppName.lnk"
    $sc2 = $WScript.CreateShortcut($smLink)
    $sc2.TargetPath       = "wscript.exe"
    $sc2.Arguments        = "`"$vbsPath`""
    $sc2.WorkingDirectory = $TargetDir
    $sc2.Description      = $AppName
    if (Test-Path $iconPath) { $sc2.IconLocation = "$iconPath,0" }
    $sc2.Save()

    # Register in Add/Remove Programs
    & $OnProgress "Registering application..."
    if (-not (Test-Path $UninstallKey)) {
        New-Item -Path $UninstallKey -Force | Out-Null
    }
    $instScript = Join-Path $TargetDir "install-windows.ps1"
    Copy-Item $PSCommandPath -Destination $instScript -Force -ErrorAction SilentlyContinue

    Set-ItemProperty -Path $UninstallKey -Name "DisplayName"     -Value $AppName
    Set-ItemProperty -Path $UninstallKey -Name "DisplayVersion"  -Value $NewVersion
    Set-ItemProperty -Path $UninstallKey -Name "Publisher"       -Value "1kuzz"
    Set-ItemProperty -Path $UninstallKey -Name "InstallLocation" -Value $TargetDir
    Set-ItemProperty -Path $UninstallKey -Name "UninstallString" -Value "powershell -ExecutionPolicy Bypass -File `"$instScript`" -Uninstall -Silent"
    Set-ItemProperty -Path $UninstallKey -Name "NoModify"        -Value 1 -Type DWord
    Set-ItemProperty -Path $UninstallKey -Name "NoRepair"        -Value 1 -Type DWord
    if (Test-Path $iconPath) {
        Set-ItemProperty -Path $UninstallKey -Name "DisplayIcon" -Value $iconPath
    }

    & $OnProgress "Done"
    return $NewVersion
}

function Invoke-Uninstall {
    param([string]$TargetDir, [scriptblock]$OnProgress)

    if (-not (Test-Path $TargetDir)) {
        throw "$AppName is not installed at $TargetDir"
    }

    & $OnProgress "Removing shortcuts..."
    $sm = Join-Path ([Environment]::GetFolderPath("CommonStartMenu")) "Programs\$AppName.lnk"
    $dk = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "$AppName.lnk"
    if (Test-Path $sm) { Remove-Item $sm -Force }
    if (Test-Path $dk) { Remove-Item $dk -Force }

    & $OnProgress "Removing files..."
    Remove-Item $TargetDir -Recurse -Force

    & $OnProgress "Cleaning registry..."
    if (Test-Path $RegKey)       { Remove-Item $RegKey -Recurse -Force }
    if (Test-Path $UninstallKey) { Remove-Item $UninstallKey -Recurse -Force }

    & $OnProgress "Done"
}

# ---------------------------------------------------------------------------
#  Silent mode (no GUI)
# ---------------------------------------------------------------------------
if ($Silent) {
    $dir = if ($InstallDir) { $InstallDir } else { $DefaultDir }
    $progress = { param($msg) Write-Host "  $msg" }
    try {
        if ($Uninstall) {
            Invoke-Uninstall -TargetDir $dir -OnProgress $progress
            Write-Host "  $AppName has been uninstalled." -ForegroundColor Green
        } else {
            $ver = Invoke-Install -TargetDir $dir -OnProgress $progress
            Write-Host "  $AppName $ver installed successfully." -ForegroundColor Green
        }
    } catch {
        Write-Host "  Error: $_" -ForegroundColor Red
        exit 1
    }
    exit 0
}

# ---------------------------------------------------------------------------
#  GUI mode  (Windows Forms)
# ---------------------------------------------------------------------------
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# -- Accent colors ----------------------------------------------------------
$ColorBg       = [System.Drawing.Color]::FromArgb(245, 245, 245)
$ColorHeader   = [System.Drawing.Color]::FromArgb(0, 120, 69)
$ColorBtnGreen = [System.Drawing.Color]::FromArgb(0, 150, 80)
$ColorBtnRed   = [System.Drawing.Color]::FromArgb(200, 50, 50)
$ColorWhite    = [System.Drawing.Color]::White
$ColorGray     = [System.Drawing.Color]::FromArgb(100, 100, 100)

# -- Main form --------------------------------------------------------------
$form              = New-Object System.Windows.Forms.Form
$form.Text         = "$AppName - Setup"
$form.Size         = New-Object System.Drawing.Size(520, 420)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox  = $false
$form.BackColor    = $ColorBg
$form.Font         = New-Object System.Drawing.Font("Segoe UI", 9)

# Try to set form icon from the repo (check script dir, then parent)
$icoPath = Join-Path $PSScriptRoot $IconFile
if (-not (Test-Path $icoPath)) {
    $icoPath = Join-Path (Split-Path $PSScriptRoot -Parent) $IconFile
}
if (Test-Path $icoPath) {
    try { $form.Icon = New-Object System.Drawing.Icon($icoPath) } catch {}
}

# -- Header panel -----------------------------------------------------------
$header           = New-Object System.Windows.Forms.Panel
$header.Dock      = "Top"
$header.Height    = 70
$header.BackColor = $ColorHeader

$lblTitle              = New-Object System.Windows.Forms.Label
$lblTitle.Text         = $AppName
$lblTitle.ForeColor    = $ColorWhite
$lblTitle.Font         = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$lblTitle.AutoSize     = $true
$lblTitle.Location     = New-Object System.Drawing.Point(20, 12)
$header.Controls.Add($lblTitle)

$lblSub              = New-Object System.Windows.Forms.Label
$lblSub.Text         = "Setup Wizard"
$lblSub.ForeColor    = [System.Drawing.Color]::FromArgb(200, 255, 200)
$lblSub.Font         = New-Object System.Drawing.Font("Segoe UI", 9)
$lblSub.AutoSize     = $true
$lblSub.Location     = New-Object System.Drawing.Point(22, 44)
$header.Controls.Add($lblSub)

$form.Controls.Add($header)

# -- Version info -----------------------------------------------------------
$srcVer = Get-SourceVersion
$curVer = Get-InstalledVersion

$lblInfo              = New-Object System.Windows.Forms.Label
$lblInfo.Location     = New-Object System.Drawing.Point(20, 82)
$lblInfo.Size         = New-Object System.Drawing.Size(460, 36)
$lblInfo.ForeColor    = $ColorGray
if ($curVer) {
    $lblInfo.Text = "Installed: v$curVer    |    Available: v$srcVer"
} else {
    $lblInfo.Text = "Version: v$srcVer    |    Not yet installed"
}
$form.Controls.Add($lblInfo)

# -- Install directory ------------------------------------------------------
$lblDir              = New-Object System.Windows.Forms.Label
$lblDir.Text         = "Installation folder:"
$lblDir.Location     = New-Object System.Drawing.Point(20, 120)
$lblDir.AutoSize     = $true
$form.Controls.Add($lblDir)

$txtDir              = New-Object System.Windows.Forms.TextBox
$txtDir.Location     = New-Object System.Drawing.Point(20, 142)
$txtDir.Size         = New-Object System.Drawing.Size(380, 24)
$txtDir.Text         = if ($InstallDir) { $InstallDir } else { $DefaultDir }
$form.Controls.Add($txtDir)

$btnBrowse           = New-Object System.Windows.Forms.Button
$btnBrowse.Text      = "..."
$btnBrowse.Location  = New-Object System.Drawing.Point(406, 140)
$btnBrowse.Size      = New-Object System.Drawing.Size(70, 27)
$btnBrowse.FlatStyle = "Flat"
$btnBrowse.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description  = "Choose installation folder"
    $dlg.SelectedPath = $txtDir.Text
    if ($dlg.ShowDialog() -eq "OK") { $txtDir.Text = $dlg.SelectedPath }
})
$form.Controls.Add($btnBrowse)

# -- Checkboxes -------------------------------------------------------------
$chkDesktop            = New-Object System.Windows.Forms.CheckBox
$chkDesktop.Text       = "Create Desktop shortcut"
$chkDesktop.Location   = New-Object System.Drawing.Point(20, 178)
$chkDesktop.AutoSize   = $true
$chkDesktop.Checked    = $true
$form.Controls.Add($chkDesktop)

$chkStartMenu          = New-Object System.Windows.Forms.CheckBox
$chkStartMenu.Text     = "Create Start Menu shortcut"
$chkStartMenu.Location = New-Object System.Drawing.Point(240, 178)
$chkStartMenu.AutoSize = $true
$chkStartMenu.Checked  = $true
$form.Controls.Add($chkStartMenu)

# -- Progress bar -----------------------------------------------------------
$progress              = New-Object System.Windows.Forms.ProgressBar
$progress.Location     = New-Object System.Drawing.Point(20, 218)
$progress.Size         = New-Object System.Drawing.Size(460, 22)
$progress.Style        = "Marquee"
$progress.MarqueeAnimationSpeed = 30
$progress.Visible      = $false
$form.Controls.Add($progress)

# -- Status label -----------------------------------------------------------
$lblStatus             = New-Object System.Windows.Forms.Label
$lblStatus.Location    = New-Object System.Drawing.Point(20, 246)
$lblStatus.Size        = New-Object System.Drawing.Size(460, 20)
$lblStatus.ForeColor   = $ColorGray
$form.Controls.Add($lblStatus)

# -- Buttons ----------------------------------------------------------------
$btnInstall            = New-Object System.Windows.Forms.Button
$btnInstall.Text       = if ($curVer) { "Update" } else { "Install" }
$btnInstall.Location   = New-Object System.Drawing.Point(20, 330)
$btnInstall.Size       = New-Object System.Drawing.Size(140, 38)
$btnInstall.FlatStyle  = "Flat"
$btnInstall.BackColor  = $ColorBtnGreen
$btnInstall.ForeColor  = $ColorWhite
$btnInstall.Font       = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnInstall.FlatAppearance.BorderSize = 0
$form.Controls.Add($btnInstall)

$btnUninstall            = New-Object System.Windows.Forms.Button
$btnUninstall.Text       = "Uninstall"
$btnUninstall.Location   = New-Object System.Drawing.Point(175, 330)
$btnUninstall.Size       = New-Object System.Drawing.Size(140, 38)
$btnUninstall.FlatStyle  = "Flat"
$btnUninstall.BackColor  = $ColorBtnRed
$btnUninstall.ForeColor  = $ColorWhite
$btnUninstall.Font       = New-Object System.Drawing.Font("Segoe UI", 10)
$btnUninstall.FlatAppearance.BorderSize = 0
$btnUninstall.Enabled    = [bool]$curVer
$form.Controls.Add($btnUninstall)

$btnClose              = New-Object System.Windows.Forms.Button
$btnClose.Text         = "Close"
$btnClose.Location     = New-Object System.Drawing.Point(370, 330)
$btnClose.Size         = New-Object System.Drawing.Size(110, 38)
$btnClose.FlatStyle    = "Flat"
$btnClose.FlatAppearance.BorderSize = 0
$btnClose.Add_Click({ $form.Close() })
$form.Controls.Add($btnClose)

# -- Helper: toggle UI during work ------------------------------------------
function Set-Busy {
    param([bool]$Busy)
    $btnInstall.Enabled   = -not $Busy
    $btnUninstall.Enabled = -not $Busy
    $btnBrowse.Enabled    = -not $Busy
    $txtDir.Enabled       = -not $Busy
    $chkDesktop.Enabled   = -not $Busy
    $chkStartMenu.Enabled = -not $Busy
    $progress.Visible     = $Busy
    $form.Refresh()
}

# -- Install handler --------------------------------------------------------
$btnInstall.Add_Click({
    $targetDir = $txtDir.Text.Trim()
    if (-not $targetDir) {
        [System.Windows.Forms.MessageBox]::Show(
            "Please choose an installation folder.",
            $AppName, "OK", "Warning") | Out-Null
        return
    }

    Set-Busy $true
    $lblStatus.ForeColor = $ColorGray
    $onProgress = { param($msg) $lblStatus.Text = $msg; $form.Refresh() }

    try {
        $ver = Invoke-Install -TargetDir $targetDir -OnProgress $onProgress

        # Optionally remove shortcuts the user didn't want
        if (-not $chkDesktop.Checked) {
            $dk = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "$AppName.lnk"
            if (Test-Path $dk) { Remove-Item $dk -Force }
        }
        if (-not $chkStartMenu.Checked) {
            $sm = Join-Path ([Environment]::GetFolderPath("CommonStartMenu")) "Programs\$AppName.lnk"
            if (Test-Path $sm) { Remove-Item $sm -Force }
        }

        Set-Busy $false
        $lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(0, 130, 60)
        $lblStatus.Text = "Successfully installed v$ver"
        $btnInstall.Text = "Update"
        $btnUninstall.Enabled = $true

        [System.Windows.Forms.MessageBox]::Show(
            "$AppName v$ver has been installed successfully!`n`nShortcuts have been created on your Desktop and Start Menu.",
            "$AppName - Setup Complete", "OK", "Information") | Out-Null

    } catch {
        Set-Busy $false
        $lblStatus.ForeColor = [System.Drawing.Color]::Red
        $lblStatus.Text = "Error: $_"
        [System.Windows.Forms.MessageBox]::Show(
            "Installation failed:`n$_",
            $AppName, "OK", "Error") | Out-Null
    }
})

# -- Uninstall handler ------------------------------------------------------
$btnUninstall.Add_Click({
    $targetDir = $txtDir.Text.Trim()
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "Are you sure you want to uninstall $AppName?",
        "$AppName - Confirm Uninstall", "YesNo", "Question")
    if ($answer -ne "Yes") { return }

    Set-Busy $true
    $lblStatus.ForeColor = $ColorGray
    $onProgress = { param($msg) $lblStatus.Text = $msg; $form.Refresh() }

    try {
        Invoke-Uninstall -TargetDir $targetDir -OnProgress $onProgress

        Set-Busy $false
        $lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(0, 130, 60)
        $lblStatus.Text = "$AppName has been uninstalled."
        $btnInstall.Text = "Install"
        $btnUninstall.Enabled = $false

        [System.Windows.Forms.MessageBox]::Show(
            "$AppName has been removed from your computer.",
            "$AppName - Uninstalled", "OK", "Information") | Out-Null

    } catch {
        Set-Busy $false
        $lblStatus.ForeColor = [System.Drawing.Color]::Red
        $lblStatus.Text = "Error: $_"
        [System.Windows.Forms.MessageBox]::Show(
            "Uninstall failed:`n$_",
            $AppName, "OK", "Error") | Out-Null
    }
})

# -- Auto-start uninstall if flag was passed --------------------------------
if ($Uninstall -and $curVer) {
    $form.Add_Shown({ $btnUninstall.PerformClick() })
}

# -- Show form --------------------------------------------------------------
[void]$form.ShowDialog()
