$ErrorActionPreference = 'Stop'
$root = 'c:\Users\hasnat\Downloads\CareerPilot'
$excluded = @('node_modules', '.next', '.git')

$files = Get-ChildItem -Path $root -Recurse -File -Force |
  Where-Object { $relative = $_.FullName.Substring($root.Length); -not ($excluded | ForEach-Object { $relative -match [regex]::Escape("\$_\") } | Where-Object { $_ }) }

"=== Project files (first 80) ==="
$files | Select-Object -First 80 | Select-Object FullName

"`n=== dhaka / Dhaka / DHAKA occurrences ==="
$files | Select-String -Pattern 'dhaka' -SimpleMatch -CaseSensitive:$false | Select-Object Path, LineNumber, Line

"`n=== Pricing / about / marketing page references ==="
$files | Select-String -Pattern 'pricing|about' -SimpleMatch -CaseSensitive:$false | Select-Object Path, LineNumber, Line
