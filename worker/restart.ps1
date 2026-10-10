# Restarts the English Quest art worker (run by restart.bat as administrator).
# If this folder has a newer eq_art_worker.py (from a new ZIP), it is copied in first.
$ErrorActionPreference = "Continue"
$dest = Join-Path $env:LOCALAPPDATA "EnglishQuestWorker"
if ($args.Count -ge 1 -and $args[0]) { $dest = $args[0] }

Write-Host "Stopping the worker and its ComfyUI..."
Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -like "*eq_art_worker*" -or $_.CommandLine -like "*main.py*--port 8188*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

$new = Join-Path $PSScriptRoot "eq_art_worker.py"
if ((Test-Path $new) -and (Test-Path $dest) -and ((Resolve-Path $PSScriptRoot).Path -ne (Resolve-Path $dest).Path)) {
    Copy-Item $new $dest -Force
    Write-Host "Copied the worker from this folder (the version in the ZIP)."
}

Write-Host "Starting the worker again..."
if (Get-ScheduledTask -TaskName "English Quest Art Worker" -ErrorAction SilentlyContinue) {
    Start-ScheduledTask -TaskName "English Quest Art Worker"
}
$link = Join-Path ([Environment]::GetFolderPath("Startup")) "English Quest Art Worker.lnk"
if (Test-Path $link) { Start-Process $link }

Write-Host "Done. The worker reads config.json again." -ForegroundColor Green
Write-Host "Log: $dest\worker.log"
Start-Sleep -Seconds 4
