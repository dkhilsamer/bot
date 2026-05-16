@echo off
title Discord Soundboard Bot
echo Lancement du bot...
node index.js
if %errorlevel% neq 0 (
    echo.
    echo Une erreur est survenue lors du lancement du bot.
    pause
)
pause
