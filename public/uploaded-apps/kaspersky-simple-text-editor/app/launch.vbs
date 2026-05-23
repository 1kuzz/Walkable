' ============================================================
'  Kaspersky Simple Text Editor — Silent Launcher (no console)
'  This VBScript wrapper runs launch.bat without showing
'  a Command Prompt window.
' ============================================================

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & Replace(WScript.ScriptFullName, WScript.ScriptName, "") & "launch.bat" & Chr(34), 0, False
