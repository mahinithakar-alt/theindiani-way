$ErrorActionPreference = 'Stop'
$Root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$RootPrefix = $Root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$Port = 8765
$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

function Get-MimeType([string]$Path) {
    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.htm'  { return 'text/html; charset=utf-8' }
        '.css'  { return 'text/css; charset=utf-8' }
        '.js'   { return 'text/javascript; charset=utf-8' }
        '.mjs'  { return 'text/javascript; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.png'  { return 'image/png' }
        '.jpg'  { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.gif'  { return 'image/gif' }
        '.webp' { return 'image/webp' }
        '.svg'  { return 'image/svg+xml' }
        '.ico'  { return 'image/x-icon' }
        '.txt'  { return 'text/plain; charset=utf-8' }
        '.pdf'  { return 'application/pdf' }
        default { return 'application/octet-stream' }
    }
}

try {
    $Listener.Start()
    Write-Host "The Indiani Way is running at http://127.0.0.1:$Port/index.html" -ForegroundColor Green
    Write-Host 'Keep this window open. Close it to stop the website.'
    Start-Process "http://127.0.0.1:$Port/index.html"

    while ($true) {
        $Client = $Listener.AcceptTcpClient()
        try {
            $Stream = $Client.GetStream()
            $Stream.ReadTimeout = 5000
            $Reader = [System.IO.StreamReader]::new($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $RequestLine = $Reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($RequestLine)) { continue }
            $Parts = $RequestLine.Split(' ')
            $Method = $Parts[0]
            $Target = $Parts[1]
            while ($true) { $Header = $Reader.ReadLine(); if ([string]::IsNullOrEmpty($Header)) { break } }

            if ($Method -ne 'GET' -and $Method -ne 'HEAD') {
                $Status = '405 Method Not Allowed'; $Body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed'); $Mime = 'text/plain; charset=utf-8'
            } else {
                $PathPart = ($Target -split '\?', 2)[0]
                $Decoded = [Uri]::UnescapeDataString($PathPart)
                if ($Decoded -eq '/') { $Decoded = '/index.html' }
                $Relative = $Decoded.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
                $FullPath = [System.IO.Path]::GetFullPath((Join-Path $Root $Relative))
                if ($FullPath -ne $Root -and -not $FullPath.StartsWith($RootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $Status = '403 Forbidden'; $Body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden'); $Mime = 'text/plain; charset=utf-8'
                } elseif (Test-Path -LiteralPath $FullPath -PathType Container) {
                    $FullPath = Join-Path $FullPath 'index.html'
                    if (Test-Path -LiteralPath $FullPath -PathType Leaf) {
                        $Status = '200 OK'; $Body = [System.IO.File]::ReadAllBytes($FullPath); $Mime = Get-MimeType $FullPath
                    } else {
                        $Status = '404 Not Found'; $Body = [System.Text.Encoding]::UTF8.GetBytes('Not Found'); $Mime = 'text/plain; charset=utf-8'
                    }
                } elseif (Test-Path -LiteralPath $FullPath -PathType Leaf) {
                    $Status = '200 OK'; $Body = [System.IO.File]::ReadAllBytes($FullPath); $Mime = Get-MimeType $FullPath
                } else {
                    $Status = '404 Not Found'; $Body = [System.Text.Encoding]::UTF8.GetBytes('Not Found'); $Mime = 'text/plain; charset=utf-8'
                }
            }

            $Length = if ($Method -eq 'HEAD') { 0 } else { $Body.Length }
            $HeaderText = "HTTP/1.1 $Status`r`nContent-Type: $Mime`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
            $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($HeaderText)
            $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
            if ($Method -ne 'HEAD' -and $Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
            $Stream.Flush()
        } catch {
            # Ignore an individual malformed or interrupted browser request.
        } finally {
            if ($Reader) { $Reader.Dispose(); $Reader = $null }
            $Client.Close()
        }
    }
} finally {
    if ($Listener) { $Listener.Stop() }
}
