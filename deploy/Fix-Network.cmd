@echo off
title RGS ProcureHub - Fix network access
setlocal
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"
net session >nul 2>&1
if not errorlevel 1 goto admin
echo Asking Windows for administrator permission. Click YES.
set "SELF=%~f0"
powershell -NoProfile -Command "Start-Process -FilePath $env:SELF -ArgumentList $env:PORT -Verb RunAs"
exit /b
:admin
set "EXE=%~dp0RGS-ProcureHub.exe"
echo.
echo  Allowing RGS ProcureHub through Windows Firewall (port %PORT%)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$e=$env:EXE; Get-NetFirewallApplicationFilter -Program $e -EA 0 | Get-NetFirewallRule | Remove-NetFirewallRule; netsh advfirewall firewall delete rule name=all program=$e | Out-Null; Get-NetFirewallRule -DisplayName 'RGS ProcureHub' -EA 0 | Remove-NetFirewallRule; $a = New-NetFirewallRule -DisplayName 'RGS ProcureHub' -Direction Inbound -Action Allow -Program $e -Profile Any; $b = New-NetFirewallRule -DisplayName 'RGS ProcureHub' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $env:PORT -Profile Any; if ($a -and $b) { Write-Host '  Done. Other computers can now connect.' -ForegroundColor Green } else { Write-Host '  Could not change the firewall. Is another antivirus firewall installed?' -ForegroundColor Red }"
echo.
echo  Sites in the office should open one of these addresses:
echo     http://%COMPUTERNAME%:%PORT%
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=*" %%b in ("%%a") do echo     http://%%b:%PORT%
echo.
echo  Now start RGS-ProcureHub.exe again (if it is not already running).
echo  If a separate antivirus with its own firewall is installed (Quick Heal, K7,
echo  Norton, ESET...), allow RGS-ProcureHub.exe there too.
echo.
pause
