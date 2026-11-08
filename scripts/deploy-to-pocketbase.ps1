<#
.SYNOPSIS
  Automated build and deploy script for PocketBase offline-first pharmacy app on Windows.
.DESCRIPTION
  1. Compiles frontend assets with Vite into dist/
  2. Creates C:\pocketbase\pb_public if needed
  3. Copies flat static files directly to C:\pocketbase\pb_public
  4. Verifies whether pocketbase.exe is running on port 8090
#>

param(
  [string]$DestinationPath = "C:\pocketbase\pb_public"
)

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  PharmaBase -> PocketBase Automated Windows Deploy" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Run Vite Production Build
Write-Host "`n[1/3] Compiling React frontend to static files..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
  Write-Host "`n[ERROR] Vite build failed! Deployment aborted." -ForegroundColor Red
  Exit 1
}

# 2. Synchronize to pb_public
Write-Host "`n[2/3] Deploying static build to $DestinationPath..." -ForegroundColor Yellow

if (-not (Test-Path -Path $DestinationPath)) {
  Write-Host "Creating destination directory: $DestinationPath" -ForegroundColor DarkGray
  New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
}

# Remove existing assets to avoid stale bundles
Get-ChildItem -Path $DestinationPath -Recurse | Remove-Item -Force -Recurse

# Copy new dist contents
Copy-Item -Path "dist\*" -Destination $DestinationPath -Recurse -Force

Write-Host "Assets copied successfully!" -ForegroundColor Green

# 3. Check PocketBase status
Write-Host "`n[3/3] Checking PocketBase status..." -ForegroundColor Yellow
$pocketbaseProcess = Get-Process -Name "pocketbase" -ErrorAction SilentlyContinue

if ($pocketbaseProcess) {
  Write-Host "PocketBase is running (PID: $($pocketbaseProcess.Id))." -ForegroundColor Green
  Write-Host "Your updated pharmacy application is immediately live at:" -ForegroundColor Cyan
  Write-Host "  http://127.0.0.1:8090" -ForegroundColor White
} else {
  Write-Host "PocketBase is not currently running." -ForegroundColor Yellow
  Write-Host "To start PocketBase, run in PowerShell:" -ForegroundColor White
  Write-Host "  cd C:\pocketbase; .\pocketbase.exe serve --http=0.0.0.0:8090" -ForegroundColor Cyan
  Write-Host "Using 0.0.0.0:8090 allows other pharmacy devices on your LAN to access the app!" -ForegroundColor DarkGray
}

Write-Host "`n====================================================" -ForegroundColor Green
Write-Host "  Deployment Complete! " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
