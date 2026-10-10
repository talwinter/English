@echo off
rem Plays the English Quest prologue.
rem Needs Godot 4.7.2:  winget install GodotEngine.GodotEngine
rem Extra options (all optional):
rem   play.bat --episode=s1e1            play another episode
rem   play.bat --server=http://HOST:8080 use the server (voices, episodes, progress)
rem   play.bat --pixel                   the retro low-resolution look
setlocal
set "GODOT=%LOCALAPPDATA%\Microsoft\WinGet\Packages\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe\Godot_v4.7.2-stable_win64.exe"
if not exist "%GODOT%" (
  echo Godot was not found at:
  echo   %GODOT%
  echo Install it with:  winget install GodotEngine.GodotEngine
  pause
  exit /b 1
)
rem %~dp0 ends with a backslash, which would swallow the closing quote: add a dot.
"%GODOT%" --path "%~dp0." %EQ_ENGINE_ARGS% -- %*
endlocal
