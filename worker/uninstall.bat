@echo off
rem Removes the English Quest art worker. Windows asks for admin permission (to remove the startup task).
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0uninstall.ps1\"'"
