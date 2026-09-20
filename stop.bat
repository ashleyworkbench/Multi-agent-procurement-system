@echo off
REM ============================================================================
REM PROCUREFLOW - WINDOWS STOP SCRIPT (Command Prompt)
REM Stops all ProcureFlow containers cleanly
REM ============================================================================

echo Stopping all ProcureFlow services...
docker compose down
echo All containers stopped cleanly.
