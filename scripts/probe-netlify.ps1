$ErrorActionPreference = "Continue"
$u = "https://careerpilot49.netlify.app"

function Probe {
  param([string]$label, [string]$method, [string]$path)
  $url = $u + $path
  Write-Host ("=== " + $label + " [" + $method + " " + $url + "] ===")
  $params = @{
    Uri = $url
    Method = $method
    TimeoutSec = 25
    UseBasicParsing = $true
    Headers = @{ "Accept" = "application/json" }
    ErrorAction = "SilentlyContinue"
  }
  try {
    $r = Invoke-WebRequest @params
    $code = [int]$r.StatusCode
    $ct = $r.ContentType
    $body = ""
    if ($r.Content -and $r.Content.Length -gt 0) {
      $body = [System.Text.Encoding]::UTF8.GetString($r.Content)
    }
    Write-Host ("  STATUS=" + $code + "  CT=" + $ct + "  BYTES=" + $r.Content.Length)
    Write-Host "  BODY[:500]:"
    $n = [Math]::Min(500, $body.Length)
    Write-Host ("  " + $body.Substring(0, $n))
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $code = [int]$resp.StatusCode
      $ct = $resp.ContentType
      $stream = $resp.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $body = $reader.ReadToEnd()
      Write-Host ("  STATUS=" + $code + "  CT=" + $ct)
      Write-Host "  BODY[:500]:"
      $n = [Math]::Min(500, $body.Length)
      Write-Host ("  " + $body.Substring(0, $n))
    } else {
      Write-Host ("  ERROR: " + $_.Exception.Message)
    }
  }
  Write-Host ""
}

Probe "homepage"            "Head" "/"
Probe "static-test"         "Get"  "/_next/static/chunks/main-app.js"
Probe "cv-page"             "Get"  "/cv"
Probe "cv-api-list-noauth"  "Get"  "/api/cv"
Probe "cv-upload-empty"     "Post" "/api/cv/upload"
Probe "wrong-path-probe"    "Get"  "/api/__no-such-route"
