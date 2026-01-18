@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Wrapper for running mj-workflow on Windows when the repo is accessed via a WSL UNC path
rem (e.g. \\wsl$\Ubuntu\home\...\mj-workflow). Many tools don't like UNC as CWD.
rem This maps the UNC path to a temporary drive letter via pushd, then calls start.bat from there.
rem Keep this window open while any extra cmd windows (media-backend) are running.

set "SCRIPT_DIR=%~dp0"

if not exist "%SCRIPT_DIR%start.bat" (
  echo [mj-workflow] start.bat not found next to this file: "%SCRIPT_DIR%start.bat" 1>&2
  exit /b 1
)

set "IS_UNC=0"
if "%SCRIPT_DIR:~0,2%"=="\\" set "IS_UNC=1"

if "%IS_UNC%"=="1" (
  echo [mj-workflow] Detected UNC path: !SCRIPT_DIR!
  echo [mj-workflow] Mapping UNC to a drive letter...
  pushd "!SCRIPT_DIR!" >nul || (
    echo [mj-workflow] Failed to map UNC path via pushd: !SCRIPT_DIR! 1>&2
    exit /b 1
  )

  set "MAPPED_DIR=!CD!"
  set "MAPPED_DRIVE=!MAPPED_DIR:~0,2!"
  echo [mj-workflow] Working dir: !MAPPED_DIR!
  echo [mj-workflow] If you need to remove the temp drive mapping later: net use !MAPPED_DRIVE! /delete

  call "!MAPPED_DIR!\start.bat" %*
  set "EC=!errorlevel!"
  if not "!EC!"=="0" (
    echo.
    echo [mj-workflow] start.bat exited with code !EC!. See output above. 1>&2
    echo [mj-workflow] This window is kept open so you can read the error. 1>&2
    pause
  )
  exit /b !EC!
)

call "%SCRIPT_DIR%start.bat" %*
set "EC=%errorlevel%"
if not "%EC%"=="0" (
  echo.
  echo [mj-workflow] start.bat exited with code %EC%. See output above. 1>&2
  echo [mj-workflow] This window is kept open so you can read the error. 1>&2
  pause
)
exit /b %EC%
