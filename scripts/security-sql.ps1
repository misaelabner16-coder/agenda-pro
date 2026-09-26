param(
  [Parameter(Mandatory=$true)][string]$SqlFile,
  [string]$CandidateMigration,
  [switch]$EncryptedSnapshot,
  [string]$CliPath = 'C:\Users\misael\AppData\Local\Temp\agenda-pro-supabase-cli-3771594b-4ce3-463b-814b-7c04b50499fb\supabase.exe'
)
$ErrorActionPreference = 'Stop'
$env:NODE_USE_SYSTEM_CA = '1'
$projectRef = 'nuhxuhkunhuzljjjkzbx'
$sql = Get-Content -LiteralPath $SqlFile -Raw
$temporaryQuery = $null
try {
  if ($CandidateMigration) {
    $candidate = Get-Content -LiteralPath $CandidateMigration -Raw
    # Run proposed DDL and regression fixtures in ONE rollback-only transaction.
    $body = [regex]::Replace($candidate, '(?im)^\s*(begin|commit);\s*$', '')
    $testBody = [regex]::Replace($sql, '(?im)^\s*(begin|rollback);\s*$', '')
    $sql = "begin;`nset local lock_timeout = '2s';`n$body`n$testBody`nrollback;"
    $temporaryQuery = Join-Path ([IO.Path]::GetTempPath()) ('agenda-security-' + [guid]::NewGuid() + '.sql')
    [IO.File]::WriteAllText($temporaryQuery, $sql, [Text.UTF8Encoding]::new($false))
    $SqlFile = $temporaryQuery
  }
  $raw = (& $CliPath db query --linked --project-ref $projectRef --file $SqlFile 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) {
    if ($EncryptedSnapshot) { throw 'Snapshot query failed; no backup was saved.' }
    throw $raw
  }
  $jsonStart = $raw.IndexOf('{')
  if ($jsonStart -lt 0) { throw 'SQL tool did not return JSON.' }
  $response = $raw.Substring($jsonStart) | ConvertFrom-Json
  if ($null -eq $response.rows) { throw 'SQL tool did not return rows.' }
  if ($EncryptedSnapshot) {
    $json = $response.rows | ConvertTo-Json -Depth 100 -Compress
    if (-not $response.rows[0].snapshot.data -or $response.rows[0].snapshot.project_ref -ne $projectRef) {
      throw 'Snapshot is incomplete or targets a different project.'
    }
    Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $encrypted = [Convert]::ToBase64String($protected)
    $backupDirectory = Join-Path $env:LOCALAPPDATA 'AgendaPro\SecurityBackups'
    [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
    $destination = Join-Path $backupDirectory ('sao-paulo-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dpapi')
    [IO.File]::WriteAllText($destination, $encrypted, [Text.UTF8Encoding]::new($false))
    # Verify the written artifact can be decrypted by the same Windows account.
    $restored = [Security.Cryptography.ProtectedData]::Unprotect(
      [Convert]::FromBase64String([IO.File]::ReadAllText($destination)), $null,
      [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $plain = [Text.Encoding]::UTF8.GetString($restored)
    if ($plain -cne $json) { throw 'Snapshot round-trip verification failed.' }
    Write-Output "Encrypted snapshot verified: $destination"
    Write-Output 'This is a logical application snapshot, not a full Supabase physical backup.'
  } else {
    $response.rows | ConvertTo-Json -Depth 100
  }
} finally {
  if ($temporaryQuery -and [IO.File]::Exists($temporaryQuery)) {
    # Only the exact file created above; no wildcard/recursive removal.
    Remove-Item -LiteralPath $temporaryQuery
  }
}
