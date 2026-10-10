# English Quest art worker: one-time setup on the Windows PC with the graphics card.
# Run it by double-clicking install.bat (in the same folder).

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms

function Say($text, $color = "White") { Write-Host $text -ForegroundColor $color }
function Fail($text) { Say "`n$text" Red; exit 1 }

Say "`n=== English Quest: art worker setup ===`n" Cyan

# ---------------------------------------------------------------------------
# 1. Find ComfyUI installed by Stability Matrix
# ---------------------------------------------------------------------------
$roots = @("$env:APPDATA\StabilityMatrix", "$env:LOCALAPPDATA\StabilityMatrix", "$env:USERPROFILE\StabilityMatrix")
foreach ($drive in (Get-PSDrive -PSProvider FileSystem).Root) {
    $roots += Get-ChildItem -Path $drive -Directory -Filter "StabilityMatrix*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    $roots += Get-ChildItem -Path (Join-Path $drive "*") -Directory -Filter "StabilityMatrix*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
}
$candidates = foreach ($r in $roots) {
    foreach ($packages in @("$r\Packages", "$r\Data\Packages")) {
        Get-ChildItem -Path $packages -Directory -Filter "ComfyUI*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    }
}
$comfy = $candidates | Where-Object { (Test-Path "$_\main.py") -and (Test-Path "$_\venv\Scripts\python.exe") } | Select-Object -First 1

if (-not $comfy) {
    Say "I could not find ComfyUI from Stability Matrix." Yellow
    Say "If you don't have it: open Stability Matrix > Packages > Add Package > ComfyUI, then run this again."
    Say "If you have it somewhere else, choose its folder now (the folder with main.py)."
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = "Choose the ComfyUI folder (the one with main.py)"
    if ($dialog.ShowDialog() -ne "OK") { Fail "No folder chosen." }
    $comfy = $dialog.SelectedPath
    if (-not ((Test-Path "$comfy\main.py") -and (Test-Path "$comfy\venv\Scripts\python.exe"))) {
        Fail "That folder has no main.py and venv. Choose the ComfyUI package folder."
    }
}
Say "ComfyUI: $comfy" Green
$python = "$comfy\venv\Scripts\python.exe"
$pythonw = "$comfy\venv\Scripts\pythonw.exe"

# ---------------------------------------------------------------------------
# 2. Choose the model (and an optional LoRA)
# ---------------------------------------------------------------------------
function Find-Models($folders) {
    foreach ($f in $folders) {
        if (Test-Path $f) {
            Get-ChildItem -Path $f -Recurse -File -Include *.safetensors, *.ckpt -ErrorAction SilentlyContinue |
                ForEach-Object { $_.FullName.Substring($f.TrimEnd('\').Length + 1) }
        }
    }
}
$smData = Split-Path (Split-Path $comfy)          # ...\Data (Packages\ComfyUI -> Data)
$checkpoints = @(Find-Models @("$smData\Models\StableDiffusion", "$comfy\models\checkpoints") | Sort-Object -Unique)
if ($checkpoints.Count -eq 0) { Fail "No models found. Download an SDXL model in Stability Matrix (Model Browser), then run this again." }

Say "`nModels:"
for ($i = 0; $i -lt $checkpoints.Count; $i++) { Say ("  {0}. {1}" -f ($i + 1), $checkpoints[$i]) }
$best = [array]::FindIndex([string[]]$checkpoints, [Predicate[string]] { param($n) $n -match "xl" })
if ($best -lt 0) { $best = 0 }
$answer = Read-Host "Which model? (Enter = $($best + 1))"
$index = if ($answer) { [int]$answer - 1 } else { $best }
$checkpoint = $checkpoints[$index]
$isXl = $checkpoint -match "xl"
$answer = Read-Host ("Is it an SDXL model? (Enter = {0})" -f $(if ($isXl) { "yes" } else { "no" }))
if ($answer) { $isXl = $answer -match "^(y|yes)" }

$loras = @(Find-Models @("$smData\Models\Lora", "$comfy\models\loras") | Sort-Object -Unique)
$lora = ""
if ($loras.Count -gt 0) {
    Say "`nLoRAs (optional, for example a pixel-art LoRA):"
    for ($i = 0; $i -lt $loras.Count; $i++) { Say ("  {0}. {1}" -f ($i + 1), $loras[$i]) }
    $answer = Read-Host "Which LoRA? (Enter = none)"
    if ($answer) { $lora = $loras[[int]$answer - 1] }
}

# ---------------------------------------------------------------------------
# 3. The English Quest server
# ---------------------------------------------------------------------------
Say ""
$server = (Read-Host "Server address (example: http://192.168.88.10:8080)").Trim().TrimEnd("/")
$token = (Read-Host "Worker token (WORKER_TOKEN in docker-compose.yml)").Trim()
try {
    Invoke-RestMethod -Uri "$server/api/art/hello" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 10 | Out-Null
    Say "Server OK" Green
} catch {
    Fail "Could not reach the server with that token: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# 4. Install the worker
# ---------------------------------------------------------------------------
$dest = "$env:LOCALAPPDATA\EnglishQuestWorker"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item "$PSScriptRoot\eq_art_worker.py" $dest -Force
@{
    server     = $server
    token      = $token
    comfy_dir  = $comfy
    checkpoint = $checkpoint
    lora       = $lora
    model      = $(if ($isXl) { "sdxl" } else { "sd15" })
} | ConvertTo-Json | Set-Content -Path "$dest\config.json" -Encoding UTF8
Say "Installed in $dest" Green

# ---------------------------------------------------------------------------
# 5. Test: make one picture
# ---------------------------------------------------------------------------
Say "`nMaking a test picture. ComfyUI starts in the background; the first time can take a few minutes..."
& $python "$dest\eq_art_worker.py" --test
if ($LASTEXITCODE -ne 0) { Fail "The test picture failed. Look at $dest\worker.log and $dest\comfyui.log" }
Start-Process "$dest\test-pixel.png"

# ---------------------------------------------------------------------------
# 6. Start with Windows: before login (a Windows task, needs admin) and/or at login (Startup folder)
# ---------------------------------------------------------------------------
Say "`nShould the worker also run when the PC is on but nobody has logged in?"
Say "(Windows will ask for admin permission once. Before login it checks that the graphics card is free.)"
$answer = Read-Host "Run before login? (Enter = yes, n = no)"
if ($answer -notmatch "^(n|no)") {
    Start-Process powershell -Verb RunAs -Wait -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSScriptRoot\install-task.ps1`"",
        "-Python", "`"$pythonw`"", "-Folder", "`"$dest`"")
}

$startup = [Environment]::GetFolderPath("Startup")
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut("$startup\English Quest Art Worker.lnk")
$link.TargetPath = $pythonw
$link.Arguments = "`"$dest\eq_art_worker.py`""
$link.WorkingDirectory = $dest
$link.Save()
Start-Process -FilePath $pythonw -ArgumentList "`"$dest\eq_art_worker.py`"" -WorkingDirectory $dest -WindowStyle Hidden

Say "`nDone! The art worker runs now and starts with Windows." Green
Say "It only uses the graphics card when nobody has used the PC for 5 minutes."
Say "Tip: in Windows power settings, set sleep to Never (or 1-2 hours) when plugged in,"
Say "so the PC stays awake long enough to get work. It never sleeps in the middle of a picture."
Say "Log: $dest\worker.log"
