#!/usr/bin/env bash
# ProcureFlow - Documentation Live Preview Server
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".venv-docs" ]; then
    echo "Creating .venv-docs virtual environment..."
    python3 -m venv .venv-docs
    .venv-docs/bin/pip install --upgrade pip
    .venv-docs/bin/pip install mkdocs mkdocs-material pymdown-extensions
fi

echo "Starting MkDocs Documentation Server at http://127.0.0.1:8000 (or next free port)..."
.venv-docs/bin/mkdocs serve -a 127.0.0.1:8008
