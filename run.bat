@echo off
setlocal
cd /d "%~dp0"
title FormDedektifi
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
set "FORMDEDEKTIFI_EXIT=%ERRORLEVEL%"
if not "%FORMDEDEKTIFI_EXIT%"=="0" if not "%FORMDEDEKTIFI_NO_PAUSE%"=="1" pause
exit /b %FORMDEDEKTIFI_EXIT%
