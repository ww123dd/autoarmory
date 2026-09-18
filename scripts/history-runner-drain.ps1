$ErrorActionPreference = 'SilentlyContinue'
$repo = Split-Path -Parent $PSScriptRoot
$state = Join-Path $env:USERPROFILE '.codex\autoarmory\stop-shadow'
& node (Join-Path $PSScriptRoot 'history-runner.js') --drain --state $state --repo $repo --json | Out-Null