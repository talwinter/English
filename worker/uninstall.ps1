# Removes the English Quest art worker (run by uninstall.bat as administrator).
Unregister-ScheduledTask -TaskName "English Quest Art Worker" -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='pythonw.exe'" |
    Where-Object { $_.CommandLine -like "*eq_art_worker.py*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-ChildItem "C:\Users\*\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\English Quest Art Worker.lnk" -ErrorAction SilentlyContinue |
    Remove-Item -Force
Get-ChildItem "C:\Users\*\AppData\Local\EnglishQuestWorker" -Directory -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force
Write-Host "English Quest art worker removed." -ForegroundColor Green
Start-Sleep -Seconds 3
