# Shared Windows helpers. No global PATH or machine-wide installation changes.
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDirectory = Join-Path $projectRoot '.tools'
$ProgressPreference = 'SilentlyContinue'
$env:PYTHONUTF8 = '1'
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
        $result = Invoke-RestMethod -Uri ($Config.BaseUrl + '/api/version') -TimeoutSec 2
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
