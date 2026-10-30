# Queues behind C:\ct\heavy.lock (absent AND free RAM >= 900 MB, polled every 2 minutes for up to 60 minutes), takes the lock, starts the LOCAL server, runs one group on layer B, stops the server, releases the lock (guarded).
#   powershell -File tools\livetest\campaign\local-run.ps1 -Group G2 [-Run r1] [-Tree C:\ct\test-sites\wt-player18\tambola]
param([string]$Group = "G2", [string]$Run = ("r" + [int](Get-Date -UFormat %s) % 100000), [string]$Tree = "C:\ct\test-sites\wt-player18\tambola", [int]$Port = 8821)
$lock = 'C:\ct\heavy.lock'; $bun = 'C:\Users\Dell\AppData\Roaming\npm\node_modules\bun\bin\bun.exe'; $out = "C:\ct\test-sites\data\campaign"; $mine = $false
$deadline = (Get-Date).AddMinutes(60)
try {
  while ($true) {
    $free = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024
    if (-not (Test-Path $lock) -and $free -ge 900) { try { New-Item -ItemType Directory $lock -ErrorAction Stop | Out-Null; $mine = $true; break } catch { } }
    if ((Get-Date) -gt $deadline) { "GAVE UP: no lock or RAM within 60 minutes" | Out-File "$out\local-$Group-$Run.log"; exit 3 }
    Start-Sleep -Seconds 120
  }
  Set-Location $Tree
  $env:PORT = "$Port"; $env:TEST_MODE = "1"; $env:DB_FILE = "$out\local-$Group-$Run.sqlite"
  $srv = Start-Process -FilePath $bun -ArgumentList @('run', 'apps/edge/src/local.ts') -PassThru -WindowStyle Hidden -RedirectStandardOutput "$out\server-$Group-$Run.log" -RedirectStandardError "$out\server-$Group-$Run.err"
  Start-Sleep -Seconds 8
  & node tools/livetest/campaign/run-group.mjs $Group B --base "http://localhost:$Port" --run $Run --out $out *> "$out\local-$Group-$Run.log"
  & node tools/livetest/campaign/cleanup.mjs --base "http://localhost:$Port" --run $Run *>> "$out\local-$Group-$Run.log"
} finally {
  if ($srv) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue; Get-CimInstance Win32_Process -Filter "Name='bun.exe'" | Where-Object { $_.CommandLine -like '*local.ts*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
  if ($mine -and (Test-Path $lock)) { Remove-Item $lock -Force -Recurse }
}
