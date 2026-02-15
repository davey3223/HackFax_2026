param(
  [string]$Path = ""
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..") -ErrorAction Stop
if ([string]::IsNullOrWhiteSpace($Path)) {
  $envPath = Join-Path $repoRoot ".env"
} else {
  $resolved = Resolve-Path $Path -ErrorAction SilentlyContinue
  if ($resolved) {
    $envPath = $resolved.Path
  } else {
    $envPath = $Path
  }
}

Write-Host "Writing .env at $envPath" -ForegroundColor Cyan

$mongo = Read-Host "MONGODB_URI (leave blank for local default)"
$gemini = Read-Host "GEMINI_API_KEY (optional)"
$eleven = Read-Host "ELEVENLABS_API_KEY (optional)"
$apiBase = Read-Host "VITE_API_BASE_URL (default http://localhost:8000)"

if ([string]::IsNullOrWhiteSpace($mongo)) { $mongo = "mongodb://localhost:27017/bookmatch_kids" }
if ([string]::IsNullOrWhiteSpace($apiBase)) { $apiBase = "http://localhost:8000" }

@"
MONGODB_URI=$mongo
GEMINI_API_KEY=$gemini
ELEVENLABS_API_KEY=$eleven
VITE_API_BASE_URL=$apiBase
"@ | Set-Content -Encoding UTF8 $envPath

Write-Host "Done. .env updated." -ForegroundColor Green
