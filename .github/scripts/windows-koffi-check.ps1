# WP 0.13 (docs/phase-0-plan.md): a Windows build of Üki carries the keyboard hook's Koffi outside the
# asar, where src/main/keyboard-hook-win32.ts loads it in the packaged app: the koffi loader and its
# Windows x64 binary under resources/koffi/node_modules (electron-builder.yml, win.extraResources). Run by
# the CI Windows job on the zip, the lab zip (-Zip) and a current-user install (-Folder).
#
#   pwsh .github/scripts/windows-koffi-check.ps1 -Zip apps/desktop/release/Uki-0.0.0-x64.zip
#   pwsh .github/scripts/windows-koffi-check.ps1 -Folder "$env:LOCALAPPDATA\Programs\Uki"
[CmdletBinding()]
param(
  [string]$Zip = '',
  [string]$Folder = ''
)
$ErrorActionPreference = 'Stop'

if (($Zip -eq '') -eq ($Folder -eq '')) { throw 'koffi check: pass either -Zip or -Folder' }

$files = @(
  'resources/koffi/node_modules/koffi/package.json',
  'resources/koffi/node_modules/koffi/LICENSE.txt',
  'resources/koffi/node_modules/koffi/index.cjs',
  'resources/koffi/node_modules/koffi/src/koffi/index.cjs',
  'resources/koffi/node_modules/koffi/src/koffi/src/static.cjs',
  'resources/koffi/node_modules/@koromix/koffi-win32-x64/package.json',
  'resources/koffi/node_modules/@koromix/koffi-win32-x64/index.js',
  'resources/koffi/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node'
)

if ($Zip -ne '') {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Zip)
  try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  } finally {
    $archive.Dispose()
  }
  $missing = @($files | Where-Object { $entries -notcontains $_ })
  $where = $Zip
} else {
  $missing = @($files | Where-Object { -not (Test-Path -LiteralPath (Join-Path $Folder $_) -PathType Leaf) })
  $where = $Folder
}
if ($missing.Count -gt 0) { throw "koffi check: missing in ${where}: $($missing -join ', ')" }
Write-Host "koffi check: passed, $($files.Count) files in $where"
