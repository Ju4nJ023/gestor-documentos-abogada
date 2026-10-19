@echo off
chcp 65001 >nul
title LexVault - Sistema Multi-Agente 100%% Local (RGPD)
echo ==================================================================
echo   Iniciando LexVault (4 Agentes IA en Localhost + Interfaz Web)
echo   Privacidad RGPD: Ningun documento ni prueba sale de este PC
echo ==================================================================
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    start "" /B "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve >nul 2>&1
)
start "" "http://localhost:5173"
npm run full
pause
