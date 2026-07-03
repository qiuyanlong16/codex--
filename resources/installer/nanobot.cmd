@echo off
REM Wrapper to run nanobot from the installed Python venv
set "VENV_DIR=%USERPROFILE%\.by-claw-nanobot\resources\python-venv"
if exist "%VENV_DIR%\Scripts\python.exe" (
    "%VENV_DIR%\Scripts\python.exe" -m nanobot %*
) else (
    echo Error: Python venv not found at %VENV_DIR%
    echo Please run by-claw-nanobot first to initialize.
    exit /b 1
)
