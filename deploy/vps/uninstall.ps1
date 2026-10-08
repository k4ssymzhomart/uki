<#
.SYNOPSIS
  Removes the Uki judge simulator from the VPS (docs/runbooks/judge-mode.md).

.DESCRIPTION
  Stops and unregisters the uki-judge-sim and uki-judge-sim-watchdog Scheduled Tasks, stops its node.exe,
  and deletes C:\apps\uki\judge-sim and C:\apps\uki\judge-sim.env. The state (the simulated students'
  stored sign-ins) and the logs stay, so a later install reuses the same anonymous users; -Purge deletes
  them too. Node.js stays installed (the machine is shared).
#>
[CmdletBinding()]
param(
  [string]$InstallRoot = "C:\apps\uki",
  [string]$TaskPrefix = "uki-",
  [switch]$Purge
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run uninstall.ps1 in an elevated PowerShell (Run as administrator)."
}

$appDir = Join-Path $InstallRoot "judge-sim"
foreach ($name in @("${TaskPrefix}judge-sim-watchdog", "${TaskPrefix}judge-sim")) {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "[uki-judge-sim] Removed task $name"
  }
}
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($appDir) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# This script may itself live in judge-sim; PowerShell has read it already, so the folder can go.
foreach ($path in @($appDir, (Join-Path $InstallRoot "judge-sim.env"))) {
  if (Test-Path $path) { Remove-Item -Recurse -Force $path; Write-Host "[uki-judge-sim] Removed $path" }
}
if ($Purge) {
  foreach ($path in @((Join-Path $InstallRoot "state"), (Join-Path $InstallRoot "logs"))) {
    if (Test-Path $path) { Remove-Item -Recurse -Force $path; Write-Host "[uki-judge-sim] Removed $path" }
  }
  if ((Test-Path $InstallRoot) -and -not (Get-ChildItem -Force $InstallRoot)) { Remove-Item -Force $InstallRoot }
}
Write-Host "[uki-judge-sim] Uninstalled. Node.js stays installed."
