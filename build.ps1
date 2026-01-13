# Decky Clipboard - Build & Package Script for Windows
# Creates a distribution-ready zip file for Decky Loader

param(
    [switch]$SkipBuild,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
# Set console encoding to UTF-8 to fix character display issues
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Configuration
$PluginName = "decky-clipboard"
$Version = (Get-Content "package.json" | ConvertFrom-Json).version
$OutDir = "out"
$DistDir = "dist"
$ZipName = "$PluginName-v$Version.zip"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Decky Clipboard Build Script" -ForegroundColor Cyan
Write-Host "  Version: $Version" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Clean output directory
if ($Clean -or (Test-Path $OutDir)) {
    Write-Host "`n[1/5] Cleaning output directory..." -ForegroundColor Yellow
    if (Test-Path $OutDir) {
        Remove-Item -Recurse -Force $OutDir
    }
}

# Build frontend
if (-not $SkipBuild) {
    Write-Host "`n[2/5] Building frontend..." -ForegroundColor Yellow
    pnpm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed!" -ForegroundColor Red
        exit 1
    }
}

# Create output directory structure
Write-Host "`n[3/5] Creating package structure..." -ForegroundColor Yellow
$PluginDir = Join-Path $OutDir $PluginName
New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $PluginDir "dist") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $PluginDir "py_modules") | Out-Null

# Copy required files
Write-Host "`n[4/5] Copying files..." -ForegroundColor Yellow

# Required files
$RequiredFiles = @(
    @{ Src = "dist\index.js"; Dst = "dist\index.js" },
    @{ Src = "package.json"; Dst = "package.json" },
    @{ Src = "plugin.json"; Dst = "plugin.json" },
    @{ Src = "main.py"; Dst = "main.py" },
    @{ Src = "LICENSE"; Dst = "LICENSE" },
    @{ Src = "README.md"; Dst = "README.md" }
)

# Function to convert CRLF to LF
function Convert-ToUnixLineEndings {
    param([string]$FilePath)
    $content = [System.IO.File]::ReadAllText($FilePath)
    $content = $content -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($FilePath, $content, [System.Text.UTF8Encoding]::new($false))
}

foreach ($file in $RequiredFiles) {
    $srcPath = $file.Src
    $dstPath = Join-Path $PluginDir $file.Dst
    
    if (Test-Path $srcPath) {
        Copy-Item $srcPath $dstPath -Force
        # Convert to Unix line endings for .py, .json, .js files
        if ($file.Src -match '\.(py|json|js)$') {
            Convert-ToUnixLineEndings -FilePath $dstPath
        }
        Write-Host "  + $($file.Src)" -ForegroundColor Green
    } else {
        if ($file.Src -eq "LICENSE") {
            Write-Host "  ! LICENSE file not found (required for plugin store)" -ForegroundColor Yellow
        } else {
            Write-Host "  - $($file.Src) (not found)" -ForegroundColor Gray
        }
    }
}

# Copy py_modules directory and convert line endings
if (Test-Path "py_modules") {
    Copy-Item -Recurse -Force "py_modules\*" (Join-Path $PluginDir "py_modules")
    # Convert all .py files in py_modules to Unix line endings
    Get-ChildItem -Recurse (Join-Path $PluginDir "py_modules") -Filter "*.py" | ForEach-Object {
        Convert-ToUnixLineEndings -FilePath $_.FullName
    }
    Write-Host "  + py_modules/" -ForegroundColor Green
}

# Copy bin directory (bundled binaries like wl-copy, wl-paste)
if (Test-Path "bin") {
    $binFiles = Get-ChildItem "bin" -File
    if ($binFiles.Count -gt 0) {
        New-Item -ItemType Directory -Force -Path (Join-Path $PluginDir "bin") | Out-Null
        Copy-Item -Recurse -Force "bin\*" (Join-Path $PluginDir "bin")
        Write-Host "  + bin/ ($($binFiles.Count) binaries)" -ForegroundColor Green
    } else {
        Write-Host "  ! bin/ directory is empty - add wl-copy and wl-paste binaries!" -ForegroundColor Yellow
    }
}

# Copy defaults directory if exists
# Decky CLI strips the "defaults" prefix when packaging, so defaults/frontend becomes frontend
if (Test-Path "defaults") {
    $defaultsContent = Get-ChildItem "defaults" -Exclude "defaults.txt"
    foreach ($item in $defaultsContent) {
        Copy-Item -Recurse -Force $item.FullName $PluginDir
        Write-Host "  + defaults/$($item.Name) -> $($item.Name)/" -ForegroundColor Green
    }
    # Convert all .js and .html files in copied defaults to Unix line endings
    Get-ChildItem -Recurse $PluginDir -Include "*.js", "*.html" | ForEach-Object {
        Convert-ToUnixLineEndings -FilePath $_.FullName
    }
}

# Create zip file with Unix permissions using Python
Write-Host "`n[5/5] Creating zip package with Unix permissions..." -ForegroundColor Yellow
$ZipPath = Join-Path $OutDir $ZipName

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

# Use Python to create zip with correct Unix permissions (755 for files, 755 for directories)
$PythonScript = @"
import zipfile
import os
import stat

def create_zip_with_permissions(source_dir, zip_path):
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(source_dir):
            for dir_name in dirs:
                dir_path = os.path.join(root, dir_name)
                arc_name = os.path.relpath(dir_path, os.path.dirname(source_dir))
                info = zipfile.ZipInfo(arc_name + '/')
                # Set Unix permissions: drwxr-xr-x (755)
                info.external_attr = (stat.S_IFDIR | 0o755) << 16
                zf.writestr(info, '')
            for file_name in files:
                file_path = os.path.join(root, file_name)
                arc_name = os.path.relpath(file_path, os.path.dirname(source_dir))
                with open(file_path, 'rb') as f:
                    data = f.read()
                info = zipfile.ZipInfo(arc_name)
                # Set Unix permissions: -rwxr-xr-x (755)
                info.external_attr = (stat.S_IFREG | 0o755) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                zf.writestr(info, data)

create_zip_with_permissions(r'$PluginDir', r'$ZipPath')
print('Zip created with Unix permissions (755)')
"@

$PythonScript | python

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create zip with Python, falling back to Compress-Archive" -ForegroundColor Yellow
    Compress-Archive -Path $PluginDir -DestinationPath $ZipPath -CompressionLevel Optimal
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Output: $ZipPath" -ForegroundColor White
Write-Host "Size: $([math]::Round((Get-Item $ZipPath).Length / 1KB, 2)) KB" -ForegroundColor White
Write-Host ""

# List package contents
Write-Host "Package contents:" -ForegroundColor Yellow
Get-ChildItem -Recurse $PluginDir | ForEach-Object {
    $relativePath = $_.FullName.Replace("$PluginDir\", "")
    if ($_.PSIsContainer) {
        Write-Host "  [DIR]  $relativePath/" -ForegroundColor Blue
    } else {
        Write-Host "  [FILE] $relativePath" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Ready for deployment! Copy $ZipName to your Steam Deck." -ForegroundColor Green
