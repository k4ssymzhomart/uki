<#
.SYNOPSIS
  Watchdog for the Uki judge simulator (Scheduled Task "uki-judge-sim-watchdog", every 5 minutes, as SYSTEM).

.DESCRIPTION
  Restarts the simulator's task when it is not running, when state\alive.json (written every 30 s by the
  simulator) is missing or older than 3 minutes, or when its node.exe works with more than
  -MemoryLimitMb. Logs to logs\watchdog.log, rotated at 1 MB into watchdog.1.log.
#>
[CmdletBinding()]
param(
  [string]$InstallRoot = "C:\apps\uki",
  [string]$TaskName = "uki-judge-sim",
  [int]$MemoryLimitMb = 250
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$logDir = Join-Path $InstallRoot "logs"
$log = Join-Path $logDir "watchdog.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log([string]$Text) {
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) { Move-Item -Force $log (Join-Path $logDir "watchdog.1.log") }
  Add-Content -Path $log -Value "$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')) $Text"
}

function Restart-Simulator([string]$Reason) {
  Write-Log "restarting ${TaskName}: $Reason"
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
  $appDir = Join-Path $InstallRoot "judge-sim"
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($appDir) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-ScheduledTask -TaskName $TaskName
}

try {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) { Write-Log "$TaskName is not registered; nothing to watch"; exit 0 }
  if ($task.State -eq "Disabled") { exit 0 }
  if ($task.State -ne "Running") { Restart-Simulator "the task was $($task.State)"; exit 0 }

  $alive = Join-Path $InstallRoot "state\alive.json"
  if (-not (Test-Path $alive)) {
    $started = (Get-ScheduledTaskInfo -TaskName $TaskName).LastRunTime
    if ($started -lt (Get-Date).AddMinutes(-3)) { Restart-Simulator "no state\alive.json 3 minutes after the start" }
    exit 0
  }
  $age = (Get-Date) - (Get-Item $alive).LastWriteTime
  if ($age.TotalMinutes -gt 3) { Restart-Simulator "state\alive.json is $([int]$age.TotalSeconds) s old"; exit 0 }

  $appDir = Join-Path $InstallRoot "judge-sim"
  $proc = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($appDir) } | Select-Object -First 1
  if ($proc) {
    $mb = [int]($proc.WorkingSetSize / 1MB)
    if ($mb -gt $MemoryLimitMb) { Restart-Simulator "node.exe works with $mb MB (limit $MemoryLimitMb)"; exit 0 }
  }
} catch {
  Write-Log "watchdog error: $($_.Exception.Message)"
  exit 1
}
