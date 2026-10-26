# Restarts ONLY the local Corporate Tambola test server (port 8801, TEST mode, nothing live is touched). Usage: powershell -File start-tambola.ps1 [-Port 8801] [-Db tambola-test.sqlite]
param([int]$Port = 8801, [string]$Db = "tambola-test.sqlite")
$root = "C:\ct\test-sites"
$bun = "C:\Users\Dell\AppData\Roaming\npm\node_modules\bun\bin\bun.exe"
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) { foreach ($c in $conn) { & taskkill /PID $c.OwningProcess /T /F | Out-Null } }
Start-Sleep 2
New-Item -ItemType Directory -Force "$root\data" | Out-Null
$env:PORT = $Port; $env:CT_MODE = "TEST"; $env:TEST_MODE = "1"; $env:PUBLIC_ORIGIN = "http://localhost:$Port"
$env:DB_FILE = Join-Path "$root\data" $Db
Start-Process -WindowStyle Hidden -WorkingDirectory "$root\tambola" -FilePath $bun -ArgumentList "run","apps/edge/src/local.ts" -RedirectStandardOutput "$root\data\tambola-$Port.log" -RedirectStandardError "$root\data\tambola-$Port.err"
Start-Sleep 5
$c = try { (Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 8).StatusCode } catch { "DOWN" }
Write-Host "tambola http://localhost:$Port -> $c  (db $Db)"
