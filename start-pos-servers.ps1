# Starts the RestoPOS dev servers (Laravel API :8001, Vite :5180) if not already running.
# Idempotent: safe to re-run — skips anything whose port is already listening.
# Launched at logon by start-pos-servers.vbs (Startup folder); can also be run by hand.

$php      = 'C:\xampp\php\php.exe'
$backend  = 'C:\Elevenone\Projects\pos-elevenone\backend'
$frontend = 'C:\Elevenone\Projects\pos-elevenone\frontend'
$logDir   = Join-Path $env:LOCALAPPDATA 'RestoPOS'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'startup.log'

function Test-PortListening($port) {
    [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Write-Log($msg) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File $log -Append -Encoding utf8
}

if (Test-PortListening 8001) {
    Write-Log 'API :8001 already listening - skipped'
} else {
    Start-Process -FilePath $php -ArgumentList 'artisan', 'serve', '--port=8001' -WorkingDirectory $backend -WindowStyle Hidden
    Write-Log 'started Laravel API on :8001'
}

if (Test-PortListening 5180) {
    Write-Log 'Vite :5180 already listening - skipped'
} else {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm', 'run', 'dev' -WorkingDirectory $frontend -WindowStyle Hidden
    Write-Log 'started Vite dev server on :5180'
}
