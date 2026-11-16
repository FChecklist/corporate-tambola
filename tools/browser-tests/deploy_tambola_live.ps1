$envf = 'C:\ct\ct\.env.local'
foreach ($l in Get-Content $envf) { if ($l -match '^(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"'), 'Process') } }
$env:PATH = (Join-Path $env:USERPROFILE 'AppData\Roaming\npm\node_modules\bun\node_modules\@oven\bun-windows-x64-baseline\bin') + ';' + $env:PATH
Set-Location C:\ct\test-sites\tambola
& bun run pages/build.mjs 2>&1 | Select-Object -Last 2
Set-Location pages
& "C:\Users\Dell\AppData\Local\snip\bin\snip.exe" run -- npx wrangler@3 pages deploy public --project-name corporate-tambola --branch main --commit-dirty=true 2>&1 | Select-Object -Last 4
