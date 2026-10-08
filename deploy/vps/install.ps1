<#
.SYNOPSIS
  Installs the Uki judge simulator on the Windows VPS (docs/runbooks/judge-mode.md).

.DESCRIPTION
  Run from the unpacked judge-sim folder (apps/judge-sim/dist/judge-sim), in an elevated Windows PowerShell:

    .\install.ps1 -SupabaseUrl https://<ref>.supabase.co -PublishableKey sb_publishable_...

  - Installs Node.js 24 LTS from nodejs.org (the MSI, checked against SHASUMS256.txt) only when no
    Node.js 24 or later is on the machine.
  - Copies judge-sim.mjs, its stills and the watchdog to C:\apps\uki\judge-sim, and writes
    C:\apps\uki\judge-sim.env with the public values given here. State (the simulated students' stored
    sign-ins) goes to C:\apps\uki\state, logs to C:\apps\uki\logs; only LOCAL SERVICE, SYSTEM and
    Administrators can read the state.
  - Registers the Scheduled Task "uki-judge-sim": at startup, as LOCAL SERVICE (no logon needed), restarted
    a minute after any failure, no time limit; and "uki-judge-sim-watchdog" every 5 minutes, as SYSTEM,
    which restarts the simulator when it stopped, stopped writing state\alive.json, or grew past 250 MB.
  Run it again to upgrade: the tasks stop, the files are replaced, the state stays. Everything is named
  uki-* and lives under C:\apps\uki, beside the other project on the machine. No secret key: the
  simulator refuses one.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SupabaseUrl,
  [Parameter(Mandatory = $true)][string]$PublishableKey,
  [string]$ExamCode = "DEMO-LIVE",
  [string]$Students = "20249001-20249024",
  [string]$InstallRoot = "C:\apps\uki",
  [string]$TaskPrefix = "uki-",
  [int]$MemoryLimitMb = 250,
  [switch]$NoStart,
  [switch]$SkipNodeInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$NodeMajor = 24

function Write-Step([string]$Text) { Write-Host "[uki-judge-sim] $Text" }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run install.ps1 in an elevated PowerShell (Run as administrator)."
}
if ($PublishableKey.StartsWith("sb_secret_")) { throw "That is a secret key. The simulator takes the publishable key only." }
if (-not $PublishableKey.StartsWith("sb_publishable_")) { throw "PublishableKey must start with sb_publishable_." }
if ($SupabaseUrl -notmatch '^https?://[^\s/]+/?$') { throw "SupabaseUrl must look like https://<ref>.supabase.co" }
if ($ExamCode -notmatch '^[A-Z0-9]+(-[A-Z0-9]+)*$') { throw "ExamCode must look like DEMO-LIVE" }
if ($Students -notmatch '^[0-9,\- ]+$') { throw "Students must be 8-digit numbers and ranges, like 20249001-20249024" }

$source = $PSScriptRoot
if (-not (Test-Path (Join-Path $source "judge-sim.mjs"))) { throw "Run install.ps1 from the built judge-sim folder (judge-sim.mjs is missing)." }

# ---------------------------------------------------------------------------------------------------
# Node.js 24 LTS, only when missing
# ---------------------------------------------------------------------------------------------------
function Find-Node {
  $candidates = @()
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { $candidates += $cmd.Source }
  $candidates += (Join-Path $env:ProgramFiles "nodejs\node.exe")
  foreach ($path in $candidates) {
    if (-not (Test-Path $path)) { continue }
    $version = (& $path --version) 2>$null
    if ($version -match '^v(\d+)\.' -and [int]$Matches[1] -ge $NodeMajor) { return (Resolve-Path $path).Path }
  }
  return $null
}

$node = Find-Node
if (-not $node) {
  if ($SkipNodeInstall) { throw "Node.js $NodeMajor or later is missing and -SkipNodeInstall was given." }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Write-Step "Node.js $NodeMajor is missing: downloading the LTS MSI from nodejs.org"
  $index = Invoke-RestMethod -UseBasicParsing "https://nodejs.org/dist/index.json"
  $release = $index | Where-Object { $_.version -like "v$NodeMajor.*" -and $_.lts } | Select-Object -First 1
  if (-not $release) { throw "nodejs.org lists no Node.js $NodeMajor LTS release." }
  $version = $release.version
  $msi = "node-$version-x64.msi"
  $temp = Join-Path $env:TEMP "uki-node-$version"
  New-Item -ItemType Directory -Force -Path $temp | Out-Null
  $msiPath = Join-Path $temp $msi
  Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$version/$msi" -OutFile $msiPath
  $sums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$version/SHASUMS256.txt").Content
  $expected = ($sums -split "`n" | Where-Object { $_ -match "\s$([regex]::Escape($msi))$" } | ForEach-Object { ($_ -split '\s+')[0] }) | Select-Object -First 1
  $actual = (Get-FileHash -Algorithm SHA256 $msiPath).Hash.ToLowerInvariant()
  if (-not $expected -or $actual -ne $expected.ToLowerInvariant()) { throw "The Node.js MSI does not match SHASUMS256.txt; not installing it." }
  Write-Step "Installing Node.js $version"
  $run = Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait -PassThru
  if ($run.ExitCode -ne 0 -and $run.ExitCode -ne 3010) { throw "msiexec exited with $($run.ExitCode)" }
  Remove-Item -Recurse -Force $temp
  $node = Find-Node
  if (-not $node) { throw "Node.js was installed but node.exe was not found." }
}
Write-Step "Node.js: $node ($(& $node --version))"

# ---------------------------------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------------------------------
$simTask = "${TaskPrefix}judge-sim"
$watchTask = "${TaskPrefix}judge-sim-watchdog"
$appDir = Join-Path $InstallRoot "judge-sim"
$stateDir = Join-Path $InstallRoot "state"
$logDir = Join-Path $InstallRoot "logs"
$envFile = Join-Path $InstallRoot "judge-sim.env"

foreach ($name in @($simTask, $watchTask)) {
  $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($task) { Write-Step "Stopping $name"; Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue }
}
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($appDir) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

foreach ($dir in @($InstallRoot, $appDir, $stateDir, $logDir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
if ((Resolve-Path $source).Path.TrimEnd('\') -ne (Resolve-Path $appDir).Path.TrimEnd('\')) {
  Copy-Item -Force (Join-Path $source "judge-sim.mjs") $appDir
  Copy-Item -Force (Join-Path $source "watchdog.ps1") $appDir
  Copy-Item -Force (Join-Path $source "uninstall.ps1") $appDir
  Copy-Item -Force (Join-Path $source "install.ps1") $appDir
  New-Item -ItemType Directory -Force -Path (Join-Path $appDir "stills") | Out-Null
  Copy-Item -Force (Join-Path $source "stills\*.jpg") (Join-Path $appDir "stills")
}

# UTF-8 without a byte order mark: Node reads the file with util.parseEnv.
$envText = @(
  "# Written by install.ps1. Public values only; the simulator refuses a secret key.",
  "UKI_SUPABASE_URL=$($SupabaseUrl.TrimEnd('/'))",
  "UKI_PUBLISHABLE_KEY=$PublishableKey",
  "UKI_EXAM_CODE=$ExamCode",
  "UKI_STUDENTS=$Students",
  "UKI_STATE_DIR=$stateDir",
  "UKI_LOG_DIR=$logDir"
) -join "`r`n"
[IO.File]::WriteAllText($envFile, "$envText`r`n", (New-Object Text.UTF8Encoding $false))

# LOCAL SERVICE (S-1-5-19) runs the simulator: it reads the app and the env file and writes state and
# logs. The state holds the simulated students' refresh tokens, so nobody else reads it.
& icacls.exe $stateDir /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-19:(OI)(CI)M" | Out-Null
& icacls.exe $logDir /grant "*S-1-5-19:(OI)(CI)M" | Out-Null
& icacls.exe $envFile /inheritance:r /grant:r "*S-1-5-18:F" "*S-1-5-32-544:F" "*S-1-5-19:R" | Out-Null
& icacls.exe $appDir /grant "*S-1-5-19:(OI)(CI)RX" | Out-Null

# The bundle answers --dry-run without the network: a broken copy fails here, not at boot.
$check = & $node (Join-Path $appDir "judge-sim.mjs") --dry-run --env-file $envFile --plan-minutes 1 2>&1
if ($LASTEXITCODE -ne 0) { $check | Write-Host; throw "judge-sim.mjs --dry-run failed." }
Write-Step "Dry run passed"

# ---------------------------------------------------------------------------------------------------
# Scheduled Tasks
# ---------------------------------------------------------------------------------------------------
$simArgs = "--max-old-space-size=96 `"$(Join-Path $appDir 'judge-sim.mjs')`" --env-file `"$envFile`""
$action = New-ScheduledTaskAction -Execute $node -Argument $simArgs -WorkingDirectory $appDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\LOCAL SERVICE" -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $simTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description "Uki judge mode: simulated students for DEMO-LIVE (C:\apps\uki). docs/runbooks/judge-mode.md" -Force | Out-Null
Write-Step "Registered $simTask"

$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$watchArgs = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$(Join-Path $appDir 'watchdog.ps1')`" -InstallRoot `"$InstallRoot`" -TaskName `"$simTask`" -MemoryLimitMb $MemoryLimitMb"
$watchAction = New-ScheduledTaskAction -Execute $powershell -Argument $watchArgs
$watchTriggers = @(
  (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5)),
  (New-ScheduledTaskTrigger -AtStartup)
)
$watchPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount
$watchSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $watchTask -Action $watchAction -Trigger $watchTriggers -Principal $watchPrincipal `
  -Settings $watchSettings -Description "Uki judge mode: restarts $simTask when it stops or hangs." -Force | Out-Null
Write-Step "Registered $watchTask"

if (-not $NoStart) {
  Start-ScheduledTask -TaskName $simTask
  Write-Step "Started $simTask; log: $(Join-Path $logDir 'judge-sim.log')"
}
Write-Step "Done. Uninstall: $(Join-Path $appDir 'uninstall.ps1')"
