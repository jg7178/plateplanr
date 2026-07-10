@echo off
title WeekPlate Server
echo Starting WeekPlate...
powershell -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 pause