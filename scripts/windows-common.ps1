# Shared Windows helpers. No global PATH or machine-wide installation changes.
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDirectory = Join-Path $projectRoot '.tools'
$ProgressPreference = 'SilentlyContinue'
$env:PYTHONUTF8 = '1'
$env:PYTHONUNBUFFERED = '1'
$env:FORMDEDEKTIFI_LOG_LEVEL = 'DEBUG'
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false); $OutputEncoding = [Console]::OutputEncoding } catch { }
$env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Invoke-Native {
    param([string]$Executable, [string[]]$Arguments, [string]$Label)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label basarisiz (kod: $LASTEXITCODE)." }
}

function Receive-File {
    param([string]$Url, [string]$Destination, [string]$SHA256 = '')
    if ((Test-Path -LiteralPath $Destination) -and $SHA256 -and
        (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $SHA256) { return }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Write-Host "Indiriliyor: $Url"
            Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile "$Destination.partial" -TimeoutSec 1800
            if ($SHA256 -and (Get-FileHash -LiteralPath "$Destination.partial" -Algorithm SHA256).Hash -ne $SHA256) {
                throw 'Indirilen dosyanin SHA256 kontrolu basarisiz.'
            }
            Move-Item -LiteralPath "$Destination.partial" -Destination $Destination -Force
            return
        } catch {
            if ($attempt -eq 3) { throw }
            Write-Warning "Indirme yeniden denenecek ($attempt/3)."
            Start-Sleep -Seconds 2
        }
    }
}

function Get-NodeRuntime {
    $candidates = @((Join-Path $toolsDirectory 'node.exe'))
    $runtimeFolder = Join-Path $toolsDirectory 'runtimes'
    if (Test-Path -LiteralPath $runtimeFolder) {
        $candidates += @(Get-ChildItem -Path (Join-Path $runtimeFolder 'node-v*-win-x64\node.exe') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | ForEach-Object { $_.FullName })
    }
    $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($systemNode) { $candidates += $systemNode.Source }
    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate)) { continue }
        try {
            $versionText = (& $candidate --version 2>$null | Out-String).Trim().TrimStart('v')
            if ($LASTEXITCODE -ne 0) { continue }
            $version = [version]$versionText
            if ($version.Major -lt 22 -or ($version.Major -eq 22 -and $version.Minor -lt 12)) { continue }
            $bin = Split-Path -Parent $candidate
            $npmCandidates = @((Join-Path $bin 'node_modules\npm\bin\npm-cli.js'))
            if ($candidate -eq (Join-Path $toolsDirectory 'node.exe')) {
                $npmCandidates += Join-Path $toolsDirectory 'package\bin\npm-cli.js'
            }
            $npm = $npmCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
            if ($npm) { return [pscustomobject]@{ Exe = $candidate; Npm = $npm; Version = $versionText } }
        } catch { continue }
    }
    return $null
}

function Get-PythonRuntime {
    $candidates = @((Join-Path $projectRoot '.venv\Scripts\python.exe'), (Join-Path $toolsDirectory 'python\python.exe'))
    $systemPython = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($systemPython -and $systemPython.Source -notmatch '\\Microsoft\\WindowsApps\\') { $candidates += $systemPython.Source }
    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate)) { continue }
        try {
            $versionText = (& $candidate -c "import sys; print('%s.%s.%s' % sys.version_info[:3])" 2>$null | Out-String).Trim()
            if ($LASTEXITCODE -ne 0) { continue }
            $version = [version]$versionText
            if ($version.Major -eq 3 -and $version.Minor -in @(12, 13)) {
                return [pscustomobject]@{ Exe = $candidate; Version = $versionText }
            }
        } catch { continue }
    }
    return $null
}

function Set-RuntimeEnvironment {
    param($Node)
    $env:PATH = (Split-Path -Parent $Node.Exe) + ';' + $env:PATH
    $env:npm_config_cache = Join-Path $toolsDirectory 'cache\npm'
    $env:PIP_CACHE_DIR = Join-Path $toolsDirectory 'cache\pip'
}

function Test-AppDependencies {
    param($Node, $Python, [switch]$FrontendOnly)
    if (-not $Node) { return $false }
    try {
        & $Node.Exe --input-type=module -e "await import('vite'); await import('react'); await import('@vitejs/plugin-react'); await import('@tailwindcss/vite');" 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { return $false }
        if (-not $FrontendOnly) {
            if (-not $Python) { return $false }
            & $Python.Exe -c 'import fastapi, uvicorn, pymupdf, docx, httpx, multipart, dotenv; from backend.app.main import app' 2>$null | Out-Null
            if ($LASTEXITCODE -ne 0) { return $false }
        }
        return $true
    } catch { return $false }
}

function Get-DependencyFingerprint {
    $files = @('package-lock.json', 'backend\requirements.lock.txt')
    return (($files | ForEach-Object { (Get-FileHash -LiteralPath (Join-Path $projectRoot $_) -Algorithm SHA256).Hash }) -join ':')
}

function Get-LocalAIConfig {
    $values = @{ OLLAMA_BASE_URL = 'http://localhost:11434'; OLLAMA_MODEL = 'gemma4:e4b'; DEMO_MODE = 'false' }
    $envPath = Join-Path $projectRoot '.env'
    if (Test-Path -LiteralPath $envPath) {
        foreach ($line in Get-Content -LiteralPath $envPath -Encoding UTF8) {
            if ($line -match '^\s*(OLLAMA_BASE_URL|OLLAMA_MODEL|DEMO_MODE)\s*=\s*(.*?)\s*$') {
                $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
            }
        }
    }
    foreach ($name in @('OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'DEMO_MODE')) {
        $externalValue = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($null -ne $externalValue) { $values[$name] = $externalValue }
    }
    $uri = [Uri]$values.OLLAMA_BASE_URL
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'http' -or $uri.Host -notin @('localhost', '127.0.0.1', '[::1]', '::1') -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) {
        throw '.env: OLLAMA_BASE_URL yerel bir HTTP adresi olmali.'
    }
    if ($values.OLLAMA_MODEL -notin @('gemma4:e4b', 'gemma4:e2b', 'gemma4:12b', 'gemma4:26b', 'gemma4:31b')) {
        throw '.env: Desteklenen yerel bir Gemma 4 etiketi secin.'
    }
    # Avoid slow IPv6-first localhost resolution when Ollama listens only on IPv4.
    if ($uri.Host -eq 'localhost') { $builder = New-Object UriBuilder($uri); $builder.Host = '127.0.0.1'; $uri = $builder.Uri }
    return [pscustomobject]@{ BaseUrl = $uri.AbsoluteUri.TrimEnd('/'); Model = $values.OLLAMA_MODEL; Demo = $values.DEMO_MODE -eq 'true'; Port = $uri.Port }
}

function Get-OllamaExecutable {
    $candidates = @((Join-Path $toolsDirectory 'ollama\ollama.exe'))
    $command = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe' }
    return $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

function Test-OllamaServer {
    param($Config)
    try {
        $result = Invoke-RestMethod -Uri ($Config.BaseUrl + '/api/version') -TimeoutSec 5
        return [bool]$result.version
    } catch { return $false }
}

function Start-LocalOllama {
    param([string]$Executable, $Config)
    # Existing servers and their model storage are not modified.
    $env:OLLAMA_HOST = $Config.BaseUrl
    if (-not $env:OLLAMA_MODELS) { $env:OLLAMA_MODELS = Join-Path $toolsDirectory 'models' }
    $logFolder = Join-Path $toolsDirectory 'logs'
    New-Item -ItemType Directory -Force -Path $logFolder | Out-Null
    return Start-Process -FilePath $Executable -ArgumentList @('serve') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logFolder 'ollama.log') -RedirectStandardError (Join-Path $logFolder 'ollama-error.log')
}

function Wait-LocalService {
    param([string]$Url, $Process, [int]$Seconds = 45)
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Process -and $Process.HasExited) { throw 'Servis baslatilamadi. .tools/logs/ kayitlarini kontrol edin.' }
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 350
    }
    throw "Servis zamaninda hazir olmadi: $Url"
}

function Test-LocalPort {
    param([int]$Port)
    $socket = New-Object Net.Sockets.TcpClient
    try {
        $pending = $socket.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(350)) { return $false }
        $socket.EndConnect($pending)
        return $true
    } catch { return $false }
    finally { $socket.Dispose() }
}

function Get-FreeLocalPort {
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return $listener.LocalEndpoint.Port
    } finally { $listener.Stop() }
}

function Test-FormService {
    param([string]$Url, [switch]$Frontend)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        if ($Frontend) { return $response.Content.Contains('<title>FormDedektifi') }
        $spec = $response.Content | ConvertFrom-Json
        return $spec.info.title -eq 'FormDedektifi'
    } catch { return $false }
}

function Write-RunEvent {
    param([string]$Message, [string]$Component = 'RUN', [ConsoleColor]$Color = 'Gray')
    $Message = [regex]::Replace($Message, '\x1b\[[0-?]*[ -/]*[@-~]', '')
    $Message = [regex]::Replace($Message, '[\x00-\x08\x0B\x0C\x0E-\x1F]', '')
    if (-not $Message.Trim()) { return }
    if ($Message.Length -gt 2000) { $Message = $Message.Substring(0, 2000) + ' [satir kisaltildi]' }
    $line = '[{0}] [{1}] {2}' -f (Get-Date -Format 'HH:mm:ss'), $Component, $Message
    Write-Host $line -ForegroundColor $Color
    try {
        $folder = Join-Path $toolsDirectory 'logs'
        New-Item -ItemType Directory -Force -Path $folder | Out-Null
        [IO.File]::AppendAllText((Join-Path $folder 'run.log'), $line + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    } catch { }
}

function Write-AISetupStatus {
    param([switch]$Demo)
    Write-RunEvent 'API key: GEREKMIYOR. Saglayici: yerel Ollama; bulut API kullanilmiyor.' 'AI' Cyan
    if ($Demo) { Write-RunEvent 'Yalnizca arayuz/demo: canli otomatik yanit kapali.' 'AI' Yellow; return }
    $config = Get-LocalAIConfig
    Write-RunEvent ("Secili model: " + $config.Model) 'AI' Cyan
    if ($config.Demo) { Write-RunEvent '.env: DEMO_MODE=true; canli yanit icin false yapin.' 'AI' Yellow; return }
    if (-not (Test-OllamaServer $config)) {
        $executable = Get-OllamaExecutable
        if ($executable) { Write-RunEvent 'Ollama programi var fakat yerel servis yanit vermiyor.' 'AI' Yellow }
        else { Write-RunEvent 'Ollama kurulumu BULUNAMADI. Gemma kurulu oldugu dogrulanamiyor.' 'AI' Yellow }
        Write-RunEvent 'Cozum: installer.bat (tam kurulum). -Demo secenegi modeli indirmez.' 'AI' Yellow
        return
    }
    try {
        $tags = Invoke-RestMethod -Uri ($config.BaseUrl + '/api/tags') -TimeoutSec 3
        $present = @($tags.models | Where-Object { $_.name -eq $config.Model -or $_.model -eq $config.Model }).Count -gt 0
        if ($present) { Write-RunEvent 'Ollama: CALISIYOR. Secili Gemma: KURULU. Gercek yanit durumu uygulamada kontrol edilir.' 'AI' Green }
        else { Write-RunEvent ("Ollama calisiyor; " + $config.Model + ' KURULU DEGIL. installer.bat ile model indirin.') 'AI' Yellow }
    } catch { Write-RunEvent 'Ollama model listesi okunamadi; model kurulumu dogrulanamiyor.' 'AI' Yellow }
}

function Get-BackendLogDirectory {
    param([int]$Port = 8000)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/runtime" -TimeoutSec 3
        # Windows PowerShell 5 otherwise decodes UTF-8 JSON paths as a legacy encoding.
        $runtime = ([Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())) | ConvertFrom-Json
        if ($runtime.application -eq 'FormDedektifi' -and $runtime.project_root -and [IO.Path]::IsPathRooted($runtime.project_root)) {
            $folder = Join-Path $runtime.project_root '.tools\logs'
            Write-RunEvent ("Calisan backend klasoru: " + $runtime.project_root) 'BACKEND' Cyan
            Write-RunEvent ("Canli backend kayitlari: " + $folder) 'LOG' Cyan
            return $folder
        }
    } catch { }
    Write-RunEvent 'Backend kayit klasoru dogrulanamadi. Eski backend icin kendi klasorunde run.bat -RestartBackend kullanin.' 'LOG' Yellow
    return (Join-Path $toolsDirectory 'logs')
}

function Open-RunLogReaders {
    param([string]$BackendLogDirectory = (Join-Path $toolsDirectory 'logs'), [switch]$SkipBackend, [switch]$SkipFrontend, [switch]$IncludeOllama)
    $readers = @()
    $files = @()
    if (-not $SkipBackend) { $files += @(
        [pscustomobject]@{ Name = 'backend.log'; Path = (Join-Path $BackendLogDirectory 'backend.log') },
        [pscustomobject]@{ Name = 'backend-error.log'; Path = (Join-Path $BackendLogDirectory 'backend-error.log') }
    ) }
    if (-not $SkipFrontend) { $files += [pscustomobject]@{ Name = 'frontend-error.log'; Path = (Join-Path $toolsDirectory 'logs\frontend-error.log') } }
    if ($IncludeOllama) { $files += [pscustomobject]@{ Name = 'ollama-error.log'; Path = (Join-Path $toolsDirectory 'logs\ollama-error.log') } }
    foreach ($file in $files) {
        $name = $file.Name
        $path = $file.Path
        try {
            if (-not (Test-Path -LiteralPath $path)) { continue }
            # Follow only new events; old smoke-test/bind errors belong to earlier runs.
            $stream = New-Object IO.FileStream($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
            $null = $stream.Seek(0, [IO.SeekOrigin]::End)
            $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::UTF8)
            $readers += [pscustomobject]@{ Name = $name; Reader = $reader }
        } catch { Write-RunEvent ("Kayit henuz acilamadi: " + $name) 'LOG' Yellow }
    }
    return $readers
}

function Show-NewRunLogs {
    param($Readers)
    foreach ($entry in $Readers) {
        try {
            if ($entry.Reader.BaseStream.Position -gt $entry.Reader.BaseStream.Length) {
                $entry.Reader.DiscardBufferedData()
                $null = $entry.Reader.BaseStream.Seek(0, [IO.SeekOrigin]::Begin)
            }
            $count = 0
            while (-not $entry.Reader.EndOfStream -and $count -lt 100) {
                $line = $entry.Reader.ReadLine()
                if ($null -ne $line -and $line.Trim()) { Write-RunEvent $line $entry.Name }
                $count++
            }
        } catch { }
    }
}

function Stop-ProjectBackend {
    param([int]$Port, [string]$PythonExecutable)
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    foreach ($owner in @($listeners.OwningProcess | Select-Object -Unique)) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction Stop
        $command = [string]$process.CommandLine
        $matchesPython = [string]::Equals($process.ExecutablePath, $PythonExecutable, [StringComparison]::OrdinalIgnoreCase) -or $command.StartsWith(('"' + $PythonExecutable + '" '), [StringComparison]::OrdinalIgnoreCase) -or $command.StartsWith(($PythonExecutable + ' '), [StringComparison]::OrdinalIgnoreCase)
        if (-not $matchesPython -or $command -notmatch '-m\s+uvicorn\s+backend\.app\.main:app\b') {
            throw 'Calisan backend bu projenin Python islemi olarak dogrulanamadi. Onu kendi terminalinden kapatin.'
        }
        Write-RunEvent ("Bu projeye ait backend yeniden baslatiliyor. PID=" + $owner) 'BACKEND' Yellow
        Stop-Process -Id $owner -ErrorAction Stop
        Wait-Process -Id $owner -Timeout 5 -ErrorAction SilentlyContinue
    }
}
