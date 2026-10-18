@echo off
chcp 65001 >nul
title LexVault - Gestor Inteligente de Casos
echo ========================================================
echo   Iniciando LexVault (Robot Hibrido IA + Interfaz Web)
echo ========================================================
cd /d "%~dp0"
start "" "http://localhost:5173"
npm run full
pause
