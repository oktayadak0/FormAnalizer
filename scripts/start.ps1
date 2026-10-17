param([switch]$Demo)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$nodePath = Join-Path $projectRoot '.tools\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { throw 'Node.js bulunamadi. Node.js 22 LTS kurun.' }
    $nodePath = $nodeCommand.Source
}
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { $pythonPath = Join-Path $projectRoot '.tools\python\python.exe' }
if (-not $Demo -and -not (Test-Path -LiteralPath $pythonPath)) { throw 'Python ortami bulunamadi. README kurulum adimlarini uygulayin.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\vite\bin\vite.js'))) { throw 'Frontend bagimliliklari eksik. npm ci calistirin.' }

$logDirectory = Join-Path $projectRoot '.tools\logs'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$ownedProcesses = @()
try {
    if (-not $Demo) {
        $ownedProcesses += Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'backend.log') -RedirectStandardError (Join-Path $logDirectory 'backend-error.log')
    }
    $ownedProcesses += Start-Process -FilePath $nodePath -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'frontend.log') -RedirectStandardError (Join-Path $logDirectory 'frontend-error.log')
    Write-Host 'FormDedektifi: http://127.0.0.1:5173' -ForegroundColor Green
    if ($Demo) { Write-Host 'Ornek bursu acin ve demo secenegini kullanin. Canli model baslatilmadi.' }
    Write-Host 'Durdurmak icin Ctrl+C. Tani kayitlari: .tools/logs/'
    while ($true) {
        Start-Sleep -Seconds 1
        foreach ($process in $ownedProcesses) {
            if ($process.HasExited) { throw 'Bir servis durdu. .tools/logs dosyalarini kontrol edin; port kullaniliyor olabilir.' }
        }
    }
} finally {
    foreach ($process in $ownedProcesses) {
        if (-not $process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue }
    }
}
