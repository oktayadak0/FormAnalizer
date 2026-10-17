param([switch]$Demo, [switch]$NoBrowser, [switch]$SmokeTest, [switch]$RestartBackend)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-common.ps1')
Set-Location -LiteralPath $projectRoot
$ownedProcesses = @()
$ownedOllama = $null
$instanceLock = $null
$logReaders = @()
$frontendPort = 5173
$backendPort = 8000
# Readiness tests use private ephemeral ports and never interrupt a running app.
if ($SmokeTest) {
    $frontendPort = Get-FreeLocalPort
    do { $backendPort = Get-FreeLocalPort } while ($backendPort -eq $frontendPort)
}
$url = "http://127.0.0.1:$frontendPort"

try {
    New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null
    Write-RunEvent ("Proje: " + $projectRoot) 'RUN' Cyan
    Write-RunEvent 'Debug acik. Basvuru metni, kisisel bilgiler ve API anahtarlari kayda yazilmaz.' 'RUN' Cyan
    try {
        $instanceLock = [IO.File]::Open((Join-Path $toolsDirectory 'app.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    } catch [IO.IOException] {
        Write-RunEvent 'FormDedektifi zaten calisiyor. Bu pencere mevcut kayitlari izliyor.' 'RUN' Green
        Write-AISetupStatus -Demo:$Demo
        if (-not $NoBrowser -and -not $SmokeTest) { Start-Process $url }
        if ($SmokeTest) { exit 0 }
        $backendLogDirectory = Join-Path $toolsDirectory 'logs'
        if (-not $Demo) { $backendLogDirectory = Get-BackendLogDirectory $backendPort }
        $logReaders = @(Open-RunLogReaders -BackendLogDirectory $backendLogDirectory -SkipBackend:$Demo -SkipFrontend)
        while ($true) { Show-NewRunLogs $logReaders; Start-Sleep -Milliseconds 700 }
    }

    $node = Get-NodeRuntime
    $python = Get-PythonRuntime
    if ($node) { Set-RuntimeEnvironment $node }
    if ($node) { Write-RunEvent ("Node.js " + $node.Version) 'RUNTIME' }
    if ($python) { Write-RunEvent ("Python " + $python.Version) 'RUNTIME' }
    $needsInstall = -not (Test-AppDependencies $node $python -FrontendOnly:$Demo)
    $statePath = Join-Path $toolsDirectory 'install-state.json'
    if (Test-Path -LiteralPath $statePath) {
        try {
            $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($state.fingerprint -ne (Get-DependencyFingerprint)) { $needsInstall = $true }
        } catch { $needsInstall = $true }
    }
    if ($needsInstall) {
        Write-Host 'Eksik bagimliliklar otomatik kuruluyor. Model icin installer.bat kullanabilirsiniz.' -ForegroundColor Yellow
        $powershell = Join-Path $PSHOME 'powershell.exe'
        Invoke-Native $powershell @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'install.ps1'), '-Demo') 'Otomatik kurulum'
        $node = Get-NodeRuntime
        $python = Get-PythonRuntime
        Set-RuntimeEnvironment $node
    }
    $envPath = Join-Path $projectRoot '.env'
    if (-not (Test-Path -LiteralPath $envPath)) { Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination $envPath }
    $ports = @($frontendPort)
    if (-not $Demo) { $ports += $backendPort }
    $reuseFrontend = Test-FormService $url -Frontend
    $reuseBackend = -not $Demo -and (Test-FormService "http://127.0.0.1:$backendPort/openapi.json")
    if ($reuseBackend -and $RestartBackend) {
        Stop-ProjectBackend $backendPort $python.Exe
        $reuseBackend = $false
    } elseif ($reuseBackend) {
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:$backendPort/api/diagnostics" -TimeoutSec 5
        } catch {
            Write-RunEvent 'Calisan backend eski surum olabilir. Yeni loglar icin run.bat -RestartBackend kullanin.' 'BACKEND' Yellow
        }
    }
    foreach ($port in $ports) {
        $recognized = ($port -eq $frontendPort -and $reuseFrontend) -or ($port -eq $backendPort -and $reuseBackend)
        if (-not $recognized -and (Test-LocalPort $port)) { throw "Port $port baska bir uygulama tarafindan kullaniliyor. Diger pencereyi kapatip yeniden deneyin." }
    }

    $logs = Join-Path $toolsDirectory 'logs'
    New-Item -ItemType Directory -Force -Path $logs | Out-Null
    if (-not $Demo) {
        $config = Get-LocalAIConfig
        if (-not $config.Demo -and -not (Test-OllamaServer $config)) {
            $ollama = Get-OllamaExecutable
            if (Test-LocalPort $config.Port) {
                Write-RunEvent 'Ollama portu kullanimda; API henuz yanit vermiyor. Ikinci servis baslatilmadi. Model durumunu uygulamada yeniden kontrol edin.' 'AI' Yellow
            } elseif ($ollama) {
                Write-Host 'Yerel Ollama baslatiliyor...'
                try {
                    $ownedOllama = Start-LocalOllama $ollama $config
                    Wait-LocalService ($config.BaseUrl + '/api/version') $ownedOllama
                } catch {
                    if ($ownedOllama -and -not $ownedOllama.HasExited) { Stop-Process -Id $ownedOllama.Id -ErrorAction SilentlyContinue }
                    $ownedOllama = $null
                    if (Test-OllamaServer $config) { Write-RunEvent 'Baska bir Ollama servisi hazir oldu; mevcut servis kullaniliyor.' 'AI' Green }
                    else { Write-Warning 'Ollama baslatilamadi; uygulama aciliyor, ornek bursu demo modunda kullanabilirsiniz.' }
                }
            } else {
                Write-Host 'Ollama kurulu degil; ornek bursu demo modunda kullanabilirsiniz.' -ForegroundColor Yellow
            }
        }
        if (-not $reuseBackend) {
            $backend = Start-Process -FilePath $python.Exe -ArgumentList @('-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', $backendPort) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'backend.log') -RedirectStandardError (Join-Path $logs 'backend-error.log')
            $ownedProcesses += $backend
            Wait-LocalService "http://127.0.0.1:$backendPort/openapi.json" $backend
        } else { Write-Host 'Zaten calisan FormDedektifi backend kullaniliyor.' }
    }
    Write-AISetupStatus -Demo:$Demo
    if (-not $reuseFrontend) {
        $frontend = Start-Process -FilePath $node.Exe -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', $frontendPort, '--strictPort') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'frontend.log') -RedirectStandardError (Join-Path $logs 'frontend-error.log')
        $ownedProcesses += $frontend
        Wait-LocalService $url $frontend
    } else { Write-Host 'Zaten calisan FormDedektifi arayuzu kullaniliyor.' }
    Write-Host "FormDedektifi hazir: $url" -ForegroundColor Green
    Write-Host 'Bu pencere acik kalsin. Durdurmak icin Ctrl+C. Kayitlar: .tools/logs/'
    Write-RunEvent 'Tanilama: run.log ve backend-events.log. Hata mesajindaki Tani numarasi request= kaydiyla eslesir.' 'LOG' Cyan
    $backendLogDirectory = Join-Path $toolsDirectory 'logs'
    if (-not $Demo) { $backendLogDirectory = Get-BackendLogDirectory $backendPort }
    $logReaders = @(Open-RunLogReaders -BackendLogDirectory $backendLogDirectory -SkipBackend:$Demo -SkipFrontend:$reuseFrontend -IncludeOllama:($null -ne $ownedOllama))
    Show-NewRunLogs $logReaders
    if ($SmokeTest) { Write-Host 'Baslatma testi basarili; servisler kapatiliyor.'; exit 0 }
    if (-not $NoBrowser) { Start-Process $url }
    while ($true) {
        Show-NewRunLogs $logReaders
        Start-Sleep -Milliseconds 700
        foreach ($process in $ownedProcesses) {
            if ($process.HasExited) { throw 'Bir servis durdu. .tools/logs/ dosyalarini kontrol edin.' }
        }
    }
} catch {
    Write-RunEvent ('BASLATMA HATASI: ' + $_.Exception.Message) 'ERROR' Red
    Write-Host 'Kurulumu onarmak icin installer.bat dosyasini calistirin.'
    exit 1
} finally {
    Show-NewRunLogs $logReaders
    foreach ($entry in $logReaders) { $entry.Reader.Dispose() }
    foreach ($process in $ownedProcesses) {
        if (-not $process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue }
    }
    if ($ownedOllama -and -not $ownedOllama.HasExited) { Stop-Process -Id $ownedOllama.Id -ErrorAction SilentlyContinue }
    if ($instanceLock) { $instanceLock.Dispose() }
}
