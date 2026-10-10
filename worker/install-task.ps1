# Registers the art worker as a Windows task that starts when the PC starts, before anyone logs in.
# install.ps1 runs this as administrator. Arguments: the pythonw.exe and the worker folder.
# Everything is written to install-task.log in the worker folder, and the window waits on errors.
param([Parameter(Mandatory = $true)][string]$Python, [Parameter(Mandatory = $true)][string]$Folder)
$ErrorActionPreference = "Stop"
Start-Transcript -Path "$Folder\install-task.log" -Force | Out-Null
try {
    $action = New-ScheduledTaskAction -Execute $Python -Argument "`"$Folder\eq_art_worker.py`"" -WorkingDirectory $Folder
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName "English Quest Art Worker" -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host "The art worker now starts with the PC, before login." -ForegroundColor Green
    Start-Sleep -Seconds 3
} catch {
    Write-Host "Could not add the startup task: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to close"
} finally {
    Stop-Transcript | Out-Null
}
