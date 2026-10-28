@echo off
REM ProcureFlow - Documentation Live Preview Server (Windows)
cd /d "%~dp0"

if not exist ".venv-docs" (
    echo Creating .venv-docs virtual environment...
    python -m venv .venv-docs
    call .venv-docs\Scripts\activate.bat
    pip install --upgrade pip
    pip install mkdocs mkdocs-material pymdown-extensions
) else (
    call .venv-docs\Scripts\activate.bat
)

echo Starting MkDocs Documentation Server...
mkdocs serve -a 127.0.0.1:8008
pause
