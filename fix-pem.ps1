# Fix PEM key formatting
$raw = Get-Content "C:\Users\DELL\Downloads\aset-key.pem" -Raw
# The key is on one line - need to add newlines every 64 chars between headers
$raw = $raw.Trim()
# Extract just the base64 content
$base64 = $raw -replace "-----BEGIN RSA PRIVATE KEY-----", "" -replace "-----END RSA PRIVATE KEY-----", "" -replace "\s", ""
# Split into 64-char lines
$lines = @("-----BEGIN RSA PRIVATE KEY-----")
for ($i = 0; $i -lt $base64.Length; $i += 64) {
    $lines += $base64.Substring($i, [Math]::Min(64, $base64.Length - $i))
}
$lines += "-----END RSA PRIVATE KEY-----"
$lines | Set-Content "C:\Users\DELL\Downloads\aset-key-fixed.pem" -Encoding ascii
Write-Host "Fixed PEM saved to aset-key-fixed.pem"
