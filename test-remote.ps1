# test-remote.ps1 - local + ngrok friend test for Live Argument Translator.
# Single-tunnel mode (ngrok free = 1 static domain):
#   backend :8000 <- Next rewrites <- frontend :3000 <- ONE ngrok tunnel.
# Your GROQ key stays in backend/.env (never printed). Ctrl+C stops everything.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPort = 8000
$frontendPort = 3000

function Wait-Http($url, $retries = 30) {
  for ($i = 0; $i -lt $retries; $i++) {
    try { Invoke-RestMethod -Uri $url -TimeoutSec 3 | Out-Null; return $true }
    catch { Start-Sleep -Seconds 1 }
  }
  return $false
}
function Get-NgrokUrl($logPath) {
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-Path -LiteralPath $logPath) {
      $txt = Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue
      if ($txt -match '"url"\s*:\s*"(https://[^"]+)"') { return $Matches[1] }
      if ($txt -match 'url=(https://\S+)') { return $Matches[1].Trim() }
      if ($txt -match 'ERR_NGROK') { throw ("ngrok error - see " + $logPath) }
    }
    Start-Sleep -Seconds 1
  }
  throw ("ngrok tunnel did not come up - see " + $logPath)
}

function Stop-OldJobs {
  Get-Job -Name arg-backend,arg-frontend,arg-ngrok,arg-ngrok-be,arg-ngrok-fe -ErrorAction SilentlyContinue | Stop-Job -PassThru -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue
  # ngrok.exe can outlive its job and keep holding your 1 free domain -> ERR_NGROK_334.
  Get-Process -Name ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

# Clean stale runs from previous failed attempt (old script leaked jobs on throw).
Stop-OldJobs

try {
  Write-Host "== 1/3 backend :$backendPort ==" -ForegroundColor Cyan
  $be = Start-Job -Name arg-backend -ScriptBlock {
    param($root, $port)
    Set-Location (Join-Path $root "backend")
    python -m uvicorn app.main:app --host 127.0.0.1 --port $port 2>&1
  } -ArgumentList $root, $backendPort
  if (-not (Wait-Http "http://127.0.0.1:$backendPort/health")) {
    Receive-Job $be | Select-Object -Last 20
    throw "backend did not start - see job output above"
  }
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$backendPort/health"
  Write-Host ("health: stt={0} translate={1} tts={2}" -f $health.stt, $health.translate, $health.tts) -ForegroundColor Green
  if ($health.stt -ne "groq") { Write-Host "WARN: not groq mode - check backend/.env GROQ_API_KEY" -ForegroundColor Yellow }

  Write-Host "== 2/3 frontend :$frontendPort (same-origin -> :$backendPort) ==" -ForegroundColor Cyan
  # Empty = same-origin mode: frontend calls /api/*, /health, /ws/* on its own
  # origin, Next rewrites proxy them to 127.0.0.1:8000. One ngrok URL covers both.
  Set-Content -LiteralPath (Join-Path $root "frontend\.env.local") -Value "NEXT_PUBLIC_BACKEND_URL=`n"
  $fe = Start-Job -Name arg-frontend -ScriptBlock {
    param($root, $fport, $bport)
    $env:BACKEND_URL = "http://127.0.0.1:$bport"
    Set-Location (Join-Path $root "frontend")
    npm run dev -- --port $fport 2>&1
  } -ArgumentList $root, $frontendPort, $backendPort
  if (-not (Wait-Http "http://127.0.0.1:$frontendPort" 60)) {
    Receive-Job $fe | Select-Object -Last 20
    throw "frontend did not start"
  }
  # Same-origin proxy check (no second tunnel needed).
  if (-not (Wait-Http "http://127.0.0.1:$frontendPort/health" 15)) {
    Receive-Job $fe | Select-Object -Last 20
    throw "frontend proxy to backend failed - check next.config.mjs rewrites / backend running"
  }

  Write-Host "== 3/3 single ngrok tunnel -> :$frontendPort ==" -ForegroundColor Cyan
  $feLog = Join-Path $root "ngrok.log"
  foreach ($old in @((Join-Path $root "ngrok-backend.log"), (Join-Path $root "ngrok-frontend.log"), $feLog)) {
    if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force }
  }
  $ng = Start-Job -Name arg-ngrok -ScriptBlock {
    param($port, $log) & ngrok http $port --inspect=false --log $log --log-format json
  } -ArgumentList $frontendPort, $feLog
  $feUrl = Get-NgrokUrl $feLog
  Write-Host ""
  Write-Host "SHARE THIS WITH YOUR FRIEND: $feUrl" -ForegroundColor Yellow -BackgroundColor Black
  Write-Host "You open it too (2nd tab will not work - same mic). Both pick languages, join same code." -ForegroundColor Gray
  Write-Host "First ngrok page load: click 'Visit Site'. Use Chrome + headphones." -ForegroundColor Gray
  Write-Host "API+WS go same-origin via Next rewrites (no 2nd tunnel needed on free ngrok)." -ForegroundColor Gray
  Write-Host ""
  Write-Host "Press Ctrl+C to stop everything." -ForegroundColor Cyan
  try { while ($true) { Start-Sleep -Seconds 5 } }
  finally {
    Stop-OldJobs
    Write-Host "stopped." -ForegroundColor Gray
  }
}
catch {
  Stop-OldJobs
  throw
}
