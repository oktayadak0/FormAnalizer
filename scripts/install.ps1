param([switch]$Demo, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-common.ps1')
Set-Location -LiteralPath $projectRoot
$ownedOllama = $null
$installLock = $null
$coreReady = $false

try {
    Write-Host ''
    Write-Host 'FormDedektifi - Otomatik Kurulum' -ForegroundColor Cyan
    if (-not [Environment]::Is64BitOperatingSystem -or ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64')) {
        throw 'Bu kurucu Windows x64 icindir.'
    }
    $node = Get-NodeRuntime
    $python = Get-PythonRuntime
    if ($CheckOnly) {
        if (-not $node -or -not $python) { throw 'Node.js veya Python eksik. installer.bat calistirin.' }
        Set-RuntimeEnvironment $node
        if (-not (Test-AppDependencies $node $python)) { throw 'Uygulama bagimliliklari eksik. installer.bat calistirin.' }
        Write-Host "Node.js $($node.Version), Python $($python.Version), frontend ve backend: HAZIR" -ForegroundColor Green
        Write-Host 'Bu kontrol modelden canli yanit alindigi anlamina gelmez.'
        exit 0
    }

    New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null
    try {
        $installLock = [IO.File]::Open((Join-Path $toolsDirectory 'install.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    } catch [IO.IOException] { throw 'Bu klasor icin baska bir kurulum zaten calisiyor. O pencerenin tamamlanmasini bekleyin.' }
    $downloads = Join-Path $toolsDirectory 'downloads'
    New-Item -ItemType Directory -Force -Path $downloads | Out-Null
    Write-Host '[1/6] Node.js ve npm kontrol ediliyor...'
    if (-not $node) {
        $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
        $release = $releases | Where-Object { $_.version -match '^v22\.' -and $_.lts -and 'win-x64-zip' -in $_.files } | Select-Object -First 1
        if (-not $release) { throw 'Resmi Node.js 22 LTS surumu bulunamadi.' }
        $archiveName = 'node-' + $release.version + '-win-x64.zip'
        $baseUrl = 'https://nodejs.org/dist/' + $release.version
        $checksums = (Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl + '/SHASUMS256.txt') -TimeoutSec 30).Content
        $checksumLine = ($checksums -split "`n") | Where-Object { $_.Trim().EndsWith(' ' + $archiveName) } | Select-Object -First 1
        if (-not $checksumLine) { throw 'Node.js SHA256 bilgisi bulunamadi.' }
        $checksum = ($checksumLine.Trim() -split '\s+')[0]
        $archive = Join-Path $downloads $archiveName
        Receive-File ($baseUrl + '/' + $archiveName) $archive $checksum
        Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $toolsDirectory 'runtimes') -Force
        $node = Get-NodeRuntime
        if (-not $node) { throw 'Node.js kurulumu dogrulanamadi.' }
    }
    Set-RuntimeEnvironment $node
    Write-Host "Node.js $($node.Version) hazir."

    Write-Host '[2/6] Python ve pip kontrol ediliyor...'
    if ($python -and $python.Exe -notlike ($toolsDirectory + '\*') -and $python.Exe -ne (Join-Path $projectRoot '.venv\Scripts\python.exe')) {
        Invoke-Native $python.Exe @('-m', 'venv', (Join-Path $projectRoot '.venv')) 'Python sanal ortami'
        $python = Get-PythonRuntime
    }
    if (-not $python) {
        # Official Windows embeddable release; digest from python.org's release bundle.
        $pythonVersion = '3.13.16'
        $pythonArchive = Join-Path $downloads "python-$pythonVersion-embed-amd64.zip"
        Receive-File "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip" $pythonArchive '97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297'
        Expand-Archive -LiteralPath $pythonArchive -DestinationPath (Join-Path $toolsDirectory 'python') -Force
    }
    $embeddedFolder = Join-Path $toolsDirectory 'python'
    if (Test-Path -LiteralPath $embeddedFolder) {
        Get-ChildItem -LiteralPath $embeddedFolder -Filter 'python*._pth' | ForEach-Object {
            [IO.File]::WriteAllLines($_.FullName, @(($_.BaseName + '.zip'), '.', 'import site', '..\..'), [Text.Encoding]::ASCII)
        }
    }
    $python = Get-PythonRuntime
    if (-not $python) { throw 'Python kurulumu dogrulanamadi.' }
    $pipAvailable = $false
    try {
        & $python.Exe -m pip --version 2>$null | Out-Null
        $pipAvailable = $LASTEXITCODE -eq 0
    } catch { }
    if (-not $pipAvailable) {
        $getPip = Join-Path $downloads 'get-pip.py'
        Receive-File 'https://bootstrap.pypa.io/get-pip.py' $getPip
        Invoke-Native $python.Exe @($getPip, '--no-warn-script-location') 'pip kurulumu'
    }
    Write-Host "Python $($python.Version) hazir."

    Write-Host '[3/6] Uygulama kutuphaneleri kuruluyor...'
    Invoke-Native $node.Exe @($node.Npm, 'ci', '--no-fund') 'Frontend bagimliliklari'
    Invoke-Native $python.Exe @('-m', 'pip', 'install', '--no-warn-script-location', '-r', 'backend/requirements.lock.txt') 'Backend bagimliliklari'

    Write-Host '[4/6] Ayarlar ve uretim derlemesi hazirlaniyor...'
    $envPath = Join-Path $projectRoot '.env'
    if (-not (Test-Path -LiteralPath $envPath)) { Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination $envPath }
    if (-not (Test-AppDependencies $node $python)) { throw 'Kutuphane dogrulamasi basarisiz.' }
    Invoke-Native $node.Exe @($node.Npm, 'run', 'build') 'Uretim derlemesi'
    @{ fingerprint = Get-DependencyFingerprint; node = $node.Version; python = $python.Version; installed = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $toolsDirectory 'install-state.json') -Encoding UTF8
    $coreReady = $true
    if ($Demo) {
        Write-Host '[5/6] Ollama ve model indirmesi demo secenegiyle atlandi.'
        Write-Host '[6/6] Kurulum tamam. run.bat dosyasina cift tiklayin.' -ForegroundColor Green
        Write-Host 'Uygulamada ornek bursu acip demo secenegini kullanabilirsiniz.'
        exit 0
    }

    Write-Host '[5/6] Ollama ve Gemma 4 hazirlaniyor...'
    Write-Host 'Ilk kurulumda Ollama ve model icin birkac GB indirme yapilir.' -ForegroundColor Yellow
    $config = Get-LocalAIConfig
    if ($config.Demo) {
        Write-Host '.env icinde DEMO_MODE=true; canli model kurulumu atlandi. Uygulama hazir.'
        exit 0
    }
    $ollama = Get-OllamaExecutable
    if (-not $ollama) {
        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/ollama/ollama/releases/latest' -TimeoutSec 30
        $asset = $release.assets | Where-Object { $_.name -eq 'ollama-windows-amd64.zip' } | Select-Object -First 1
        if (-not $asset -or $asset.digest -notmatch '^sha256:([a-fA-F0-9]{64})$') { throw 'Resmi Ollama paketi veya SHA256 bilgisi bulunamadi.' }
        $digest = $Matches[1]
        $archive = Join-Path $downloads ('ollama-' + $release.tag_name + '-windows-amd64.zip')
        Receive-File $asset.browser_download_url $archive $digest
        Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $toolsDirectory 'ollama') -Force
        $ollama = Get-OllamaExecutable
        if (-not $ollama) { throw 'Ollama kurulumu dogrulanamadi.' }
    }
    if (-not (Test-OllamaServer $config)) {
        $ownedOllama = Start-LocalOllama $ollama $config
        Wait-LocalService ($config.BaseUrl + '/api/version') $ownedOllama
    }
    $env:OLLAMA_HOST = $config.BaseUrl
    Invoke-Native $ollama @('pull', $config.Model) 'Gemma 4 indirmesi'
    Write-Host '[6/6] Modelden gercek yanit bekleniyor (cihaza gore zaman alabilir)...'
    $payload = @{ model = $config.Model; stream = $false; think = $false; format = 'json'; messages = @(@{ role = 'user'; content = 'Return exactly this JSON: {"ok":true}' }); options = @{ temperature = 0; num_predict = 128; num_ctx = 2048 } } | ConvertTo-Json -Depth 6
    $result = Invoke-RestMethod -Uri ($config.BaseUrl + '/api/chat') -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 300
    $reply = $result.message.content | ConvertFrom-Json
    if ($reply.ok -ne $true) { throw 'Gemma 4 yaniti dogrulanamadi.' }
    Write-Host 'Kurulum tamamlandi. Yerel Gemma 4 modelinden yanit alindi.' -ForegroundColor Green
    Write-Host 'Uygulamayi acmak icin run.bat dosyasina cift tiklayin.'
    exit 0
} catch {
    Write-Host ''
    Write-Host ('KURULUM HATASI: ' + $_.Exception.Message) -ForegroundColor Red
    if ($coreReady) { Write-Host 'Uygulama kurulumu hazir; model kurulumu tamamlanmadi. run.bat ile demoyu kullanabilirsiniz.' -ForegroundColor Yellow }
    Write-Host 'Internet baglantisini ve bos disk alanini kontrol edip installer.bat dosyasini yeniden calistirin.'
    exit 1
} finally {
    if ($ownedOllama -and -not $ownedOllama.HasExited) { Stop-Process -Id $ownedOllama.Id -ErrorAction SilentlyContinue }
    if ($installLock) { $installLock.Dispose() }
}
