@echo off
rem Restarts the English Quest art worker, after changing config.json or getting a new ZIP.
rem Windows asks for admin permission (to restart the before-login copy too).
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0restart.ps1\"','\"%LOCALAPPDATA%\EnglishQuestWorker\"'"
