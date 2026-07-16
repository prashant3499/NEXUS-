@echo off
REM Creates a NEXUS desktop shortcut on Windows that launches the cockpit.
set APP=%~dp0
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\NEXUS.lnk');" ^
  "$s.TargetPath='%APP%backend\start.bat'; $s.WorkingDirectory='%APP%backend'; $s.IconLocation='%APP%build\icon.png'; $s.Save()"
echo Desktop shortcut created: NEXUS.lnk
pause
