# Runs the Godot game from the command line and prints only what matters.
#   powershell -File godot/tools/run.ps1 [-GodotArgs "-- --autoplay --shots"] [-Import]
param([string]$GodotArgs = "-- --autoplay --shots", [switch]$Import, [int]$Frames = 4000)
$g = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe\Godot_v4.7.2-stable_win64_console.exe"
$proj = Split-Path -Parent $PSScriptRoot
if ($Import) { & $g --headless --path $proj --import 2>&1 | Out-Null }
$argList = @("--path", $proj, "--windowed", "--resolution", "1280x720", "--quit-after", "$Frames") + ($GodotArgs -split " ")
& $g @argList 2>&1 | ForEach-Object { $_ -replace '\x1b\[[0-9;]*m','' } |
  Where-Object { $_ -notmatch 'Source geometry parsing|This poses a significant|For runtime|agent_radius is ceiled|^\s*(at:|GDScript backtrace|\[\d\])' -and $_.Trim() -ne '' }
