# Builds the package for the son's PC: dist\EnglishQuest.zip
#   powershell -File tools\make-package.ps1 [-Server http://192.168.2.47:8080]
# The zip holds the game folder, a copy of the Godot engine (EnglishQuest.exe) and a launcher. He unzips it
# anywhere and double-clicks "Play English Quest.bat". Nothing else is installed on his PC.
param([string]$Server = "")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $root "godot"
$godot = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe\Godot_v4.7.2-stable_win64.exe"
$godotConsole = $godot -replace "\.exe$", "_console.exe"
if (-not (Test-Path $godot)) { throw "Godot not found: $godot" }
if (-not $Server) {
  $cfg = Join-Path $proj "config.json"
  if (Test-Path $cfg) { $Server = (Get-Content $cfg -Raw | ConvertFrom-Json).server }
}
if (-not $Server) { throw "Give the server address: -Server http://HOST:8080" }

# fresh imports, so the package starts at once
& $godotConsole --headless --path $proj --import 2>&1 | Out-Null

$dist = Join-Path $root "dist"
$out = Join-Path $dist "EnglishQuest"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$out\game" | Out-Null
# the game folder without work files (Blender scripts, screenshots, test data, this PC's own config)
robocopy $proj "$out\game" /E /XD shots blender tools export __pycache__ /XF config.json server.txt *.avi *.mp4 *.bak /NFL /NDL /NJH /NJS /NP | Out-Null
Copy-Item $godot "$out\EnglishQuest.exe"
@{ server = $Server; report = $true } | ConvertTo-Json | Set-Content -Encoding ascii "$out\game\config.json"

@'
@echo off
rem English Quest: double-click to play.
cd /d "%~dp0"
start "" "%~dp0EnglishQuest.exe" --path "%~dp0game"
'@ | Set-Content -Encoding ascii "$out\Play English Quest.bat"

@"
English Quest - Lost in the Game
================================
1. Unzip this folder anywhere (for example on the Desktop).
2. Double-click "Play English Quest.bat".
3. The game talks to the home server ($Server), so the home network must be on.

Hebrew: חלצו את התיקייה, לחצו פעמיים על "Play English Quest.bat" והמשחק יתחיל.
"@ | Set-Content -Encoding utf8 "$out\README.txt"

$zip = Join-Path $dist "EnglishQuest.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$out\*" -DestinationPath $zip -CompressionLevel Optimal
"{0}  {1:N0} MB" -f $zip, ((Get-Item $zip).Length / 1MB)
