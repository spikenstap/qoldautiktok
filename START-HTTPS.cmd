@echo off
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" --disable-warning=ExperimentalWarning https-launcher.mjs
) else (
  node --disable-warning=ExperimentalWarning https-launcher.mjs
)
if errorlevel 1 pause
