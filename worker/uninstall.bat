@echo off
rem Removes the English Quest art worker.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='pythonw.exe'\" | Where-Object { $_.CommandLine -like '*eq_art_worker.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force };" ^
  "Remove-Item \"$([Environment]::GetFolderPath('Startup'))\English Quest Art Worker.lnk\" -ErrorAction SilentlyContinue;" ^
  "Remove-Item \"$env:LOCALAPPDATA\EnglishQuestWorker\" -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "Write-Host 'English Quest art worker removed.'"
pause
