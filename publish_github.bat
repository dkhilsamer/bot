@echo off
echo ===================================================
echo   Publishing Discord Bot to GitHub
echo ===================================================
echo.

git init
git add .
git commit -m "Pushing latest bot updates"
git branch -M main

:: Remove incorrect origin if it exists
git remote remove origin 2>nul

:: Add the correct origin
git remote add origin https://github.com/dkhilsamer/bot.git

echo Pushing to GitHub...
git push -u origin main --force

echo.
echo ===================================================
echo   DONE! Check https://github.com/dkhilsamer/bot
echo ===================================================
pause
