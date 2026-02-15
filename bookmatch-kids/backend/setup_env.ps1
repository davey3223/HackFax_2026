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
$geminiModel = Read-Host "GEMINI_MODEL (default gemini-2.5-flash)"
$geminiVersion = Read-Host "GEMINI_API_VERSION (default v1)"
$googleBooks = Read-Host "GOOGLE_BOOKS_API_KEY (optional)"
$googleBooksEnabled = Read-Host "GOOGLE_BOOKS_ENABLED (default true)"
$staffSignup = Read-Host "STAFF_SIGNUP_CODE (optional; required for staff signup)"
$frontendBase = Read-Host "FRONTEND_BASE_URL (default http://localhost:5173)"
$demoLogin = Read-Host "DEMO_LOGIN (default true)"
$demoEmail = Read-Host "DEMO_STAFF_EMAIL (default demo@bookmatch.local)"
$demoPassword = Read-Host "DEMO_STAFF_PASSWORD (default demo1234)"
$adminPin = Read-Host "ADMIN_PIN (optional; protects staff/volunteer)"
$eleven = Read-Host "ELEVENLABS_API_KEY (optional)"
$elevenVoice = Read-Host "ELEVENLABS_VOICE_NAME (default: Nathaniel– Deep, Meditative and Mellow)"
$elevenVoiceId = Read-Host "ELEVENLABS_VOICE_ID (optional)"
$elevenModel = Read-Host "ELEVENLABS_MODEL_ID (default eleven_turbo_v2)"
$apiBase = Read-Host "VITE_API_BASE_URL (default http://localhost:8001)"

if ([string]::IsNullOrWhiteSpace($mongo)) { $mongo = "mongodb://localhost:27017/bookmatch_kids" }
if ([string]::IsNullOrWhiteSpace($geminiModel)) { $geminiModel = "gemini-2.5-flash" }
if ([string]::IsNullOrWhiteSpace($geminiVersion)) { $geminiVersion = "v1" }
if ([string]::IsNullOrWhiteSpace($googleBooksEnabled)) { $googleBooksEnabled = "true" }
if ([string]::IsNullOrWhiteSpace($frontendBase)) { $frontendBase = "http://localhost:5173" }
if ([string]::IsNullOrWhiteSpace($demoLogin)) { $demoLogin = "true" }
if ([string]::IsNullOrWhiteSpace($demoEmail)) { $demoEmail = "demo@bookmatch.local" }
if ([string]::IsNullOrWhiteSpace($demoPassword)) { $demoPassword = "demo1234" }
if ([string]::IsNullOrWhiteSpace($elevenVoice)) { $elevenVoice = "Nathaniel– Deep, Meditative and Mellow" }
if ([string]::IsNullOrWhiteSpace($elevenModel)) { $elevenModel = "eleven_turbo_v2" }
if ([string]::IsNullOrWhiteSpace($apiBase)) { $apiBase = "http://localhost:8001" }

@"
MONGODB_URI=$mongo
GEMINI_API_KEY=$gemini
GEMINI_MODEL=$geminiModel
GEMINI_API_VERSION=$geminiVersion
GOOGLE_BOOKS_API_KEY=$googleBooks
GOOGLE_BOOKS_ENABLED=$googleBooksEnabled
STAFF_SIGNUP_CODE=$staffSignup
FRONTEND_BASE_URL=$frontendBase
DEMO_LOGIN=$demoLogin
DEMO_STAFF_EMAIL=$demoEmail
DEMO_STAFF_PASSWORD=$demoPassword
ADMIN_PIN=$adminPin
ELEVENLABS_API_KEY=$eleven
ELEVENLABS_VOICE_NAME=$elevenVoice
ELEVENLABS_VOICE_ID=$elevenVoiceId
ELEVENLABS_MODEL_ID=$elevenModel
VITE_API_BASE_URL=$apiBase
"@ | Set-Content -Encoding UTF8 $envPath

Write-Host "Done. .env updated." -ForegroundColor Green

$frontendEnv = Join-Path $repoRoot "frontend\.env"
@"
VITE_API_BASE_URL=$apiBase
"@ | Set-Content -Encoding UTF8 $frontendEnv

Write-Host "Done. frontend/.env updated." -ForegroundColor Green
