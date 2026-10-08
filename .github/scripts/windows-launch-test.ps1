# Launch test of the packaged Windows app (WP 0.12 in docs/phase-0-plan.md), run by the CI Windows job.
# With -Zip it unzips the x64 zip into a new folder first, because that zip must run from any folder
# without an install; with -Exe it starts an installed Uki.exe. Either way it starts Uki.exe, checks that
# the process still runs and shows a window after -Seconds (20), saves a screenshot of the screen when
# -Screenshot names a file, and stops every Uki process again, pass or fail.
#
#   pwsh .github/scripts/windows-launch-test.ps1 -Zip apps/desktop/release/Uki-0.0.0-x64.zip
#   pwsh .github/scripts/windows-launch-test.ps1 -Exe "$env:LOCALAPPDATA\Programs\Uki\Uki.exe"
[CmdletBinding()]
param(
  [string]$Zip = '',
  [string]$Exe = '',
  [int]$Seconds = 20,
  [string]$Screenshot = ''
)
$ErrorActionPreference = 'Stop'

if (($Zip -eq '') -eq ($Exe -eq '')) { throw 'launch test: pass either -Zip or -Exe' }

$folder = $null
if ($Zip -ne '') {
  $folder = Join-Path ([IO.Path]::GetTempPath()) ('uki-launch-' + [Guid]::NewGuid().ToString('N'))
  Expand-Archive -LiteralPath $Zip -DestinationPath $folder
  $Exe = Join-Path $folder 'Uki.exe'
}
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { throw "launch test: no Uki.exe at $Exe" }

function Stop-Uki {
  Get-Process -Name 'Uki' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

function Save-Screen([string]$Path) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Host "launch test: screenshot saved to $Path"
  } catch {
    # Evidence only: a runner without a desktop to copy must not fail the launch test.
    Write-Warning "launch test: no screenshot ($($_.Exception.Message))"
  }
}

Stop-Uki
Write-Host "launch test: starting $Exe"
$app = Start-Process -FilePath $Exe -WorkingDirectory (Split-Path -Parent $Exe) -PassThru
try {
  Start-Sleep -Seconds $Seconds
  $app.Refresh()
  if ($app.HasExited) { throw "launch test: Uki.exe exited with code $($app.ExitCode) within $Seconds s" }
  $windowed = @(Get-Process -Name 'Uki' -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
  if ($windowed.Count -eq 0) { throw "launch test: Uki.exe still runs after $Seconds s but shows no window" }
  $processes = @(Get-Process -Name 'Uki').Count
  Write-Host ("launch test: passed. Uki.exe (pid $($app.Id)) still runs after $Seconds s with a window " +
    "titled '$($windowed[0].MainWindowTitle)' ($processes Uki processes)")
  if ($Screenshot -ne '') { Save-Screen $Screenshot }
} finally {
  Stop-Uki
  if ($null -ne $folder) { Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue }
}
