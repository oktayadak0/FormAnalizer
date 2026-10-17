@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title FormDedektifi
echo FormDedektifi - Canli debug kayitlari aciliyor...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
set "FORMDEDEKTIFI_EXIT=%ERRORLEVEL%"
if not "%FORMDEDEKTIFI_EXIT%"=="0" if not "%FORMDEDEKTIFI_NO_PAUSE%"=="1" pause
exit /b %FORMDEDEKTIFI_EXIT%
