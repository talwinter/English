# Makes a content pack of the game (scripts, rooms, models, sounds, base episodes) for the launcher's automatic update.
#   powershell -File tools\make-update.ps1                       makes dist\update\content-<version>.pck
#   powershell -File tools\make-update.ps1 -To http://192.168.2.47:8080     and uploads it to the server
# The upload needs SERVER_ADMIN_PASSWORD (the server's ADMIN_PASSWORD) in the environment or in .env.
# At its next start the game on his PC finds the new version, downloads it once and uses it.
#
# Rule for code in an update: a NEW script that other scripts use must be reached with preload("res://...") and
# not by class_name, because the engine only knows class names from the files the game started with.
param([string]$To = "")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $root "godot"
$godot = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe\Godot_v4.7.2-stable_win64_console.exe"
if (-not (Test-Path $godot)) { throw "Godot not found: $godot" }

# the data the game reads: episodes, base, catalog
& node (Join-Path $root "tools\build-catalog.js") | Out-Null
& node (Join-Path $root "tools\export-episodes.js") | Out-Null
& $godot --headless --path $proj --import 2>&1 | Out-Null

$dist = Join-Path $root "dist\update"
New-Item -ItemType Directory -Force $dist | Out-Null
$tmp = Join-Path $dist "build.pck"
if (Test-Path $tmp) { Remove-Item $tmp -Force }
& $godot --headless --path $proj --export-pack "Update" $tmp 2>&1 | Out-Null
if (-not (Test-Path $tmp)) { throw "The pack was not made" }

$sha = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower()
$version = "{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmm"), $sha.Substring(0, 8)
$file = Join-Path $dist "content-$version.pck"
Move-Item $tmp $file -Force
"{0}  {1:N1} MB  version {2}" -f $file, ((Get-Item $file).Length / 1MB), $version

if ($To) {
  & node (Join-Path $root "tools\push-update.js") --file $file --version $version --to $To
}
