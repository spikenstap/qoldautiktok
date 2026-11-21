@echo off
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" --disable-warning=ExperimentalWarning launcher.mjs
) else (
  node --disable-warning=ExperimentalWarning launcher.mjs
)
if errorlevel 1 pause
