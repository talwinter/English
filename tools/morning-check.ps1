# The 04:30 check (a Windows scheduled task runs this). No tokens unless something is wrong:
#   1. node tools\check-draft.js plays the draft that waits for approval, in the real game, with the robot.
#   2. exit 0 (plays to the end) or 2 (nothing waiting)  ->  only a line in the log.
#   3. exit 1 (a problem)                                ->  Claude is started once, non-interactively, to find out why.
# Which server: CHECK_SERVER in .env (default http://localhost:8081, the dev server on this PC).
# Log: dist\checks\morning.log
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$logDir = Join-Path $root "dist\checks"
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir "morning.log"
function Log($m) { "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m | Add-Content -Encoding utf8 $log }

$server = ""
if (Test-Path ".env") {
  foreach ($line in Get-Content ".env") { if ($line -match '^CHECK_SERVER=(.+)$') { $server = $Matches[1].Trim() } }
}
if (-not $server) { $server = "http://localhost:8081" }

$line = & node tools\check-draft.js --server $server 2>&1 | Select-Object -Last 1
$code = $LASTEXITCODE
Log "check ($server) exit=$code  $line"

if ($code -eq 1) {
  $claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
  if (-not $claude) { Log "Claude CLI not found: the problem waits for a human"; exit 1 }
  $prompt = @"
The 04:30 morning check of English Quest found a problem with the draft episode on $server.
Read the newest file in dist\checks\*.json (and dist\checks\morning.log), find the cause, and fix it if it is a bug in this
repository (server/, godot/, tools/, catalog/): run the tests (npm test, node tools/check-words.js) and run
node tools/check-draft.js --server $server again. Do NOT push to git, do NOT upload to the real server, do NOT spend
money on OpenAI (no new episode writing) and do NOT change anything outside this repository.
When you are done, write a short summary in Hebrew to dist\checks\latest-claude.md: what was wrong, what you changed,
and what still needs the parent.
"@
  Log "starting Claude to look at the problem"
  & $claude -p $prompt --permission-mode acceptEdits --allowedTools "Read" "Edit" "Write" "Glob" "Grep" "Bash(node:*)" "Bash(npm:*)" "Bash(git diff:*)" "Bash(git status:*)" --max-turns 40 2>&1 | Add-Content -Encoding utf8 (Join-Path $logDir "latest-claude.log")
  Log "Claude finished (summary: dist\checks\latest-claude.md)"
}
exit $code
