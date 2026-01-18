@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Windows launcher for mj-workflow (and optional media-backend + postgres)
rem Usage: start.bat [--port <port>] [--media-port <port>] [--db-url <url>] [--no-kill] [--no-py] [--no-pg] [--py-reload]

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul

set "DEFAULT_PORT=3000"
set "DEFAULT_MEDIA_PORT=9010"
set "DEFAULT_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/media_backend"
set "DEFAULT_PG_COMPOSE_FILE=docker-compose.pg.yml"

set "PORT_VAL=%PORT%"
if not defined PORT_VAL call :ReadEnvPort "..\.env.local" PORT_VAL
if not defined PORT_VAL call :ReadEnvPort ".\.env.local" PORT_VAL
if not defined PORT_VAL set "PORT_VAL=%DEFAULT_PORT%"

set "MEDIA_PORT_VAL=%MEDIA_PORT%"
if not defined MEDIA_PORT_VAL set "MEDIA_PORT_VAL=%DEFAULT_MEDIA_PORT%"

set "DB_URL_VAL=%DATABASE_URL%"
if not defined DB_URL_VAL set "DB_URL_VAL=%DEFAULT_DATABASE_URL%"

set "PY_ENABLED=1"
set "PG_ENABLED=1"
set "PY_RELOAD=0"
set "NO_KILL=0"

:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--port" (
  if "%~2"=="" goto :arg_missing
  set "PORT_VAL=%~2"
  shift & shift
  goto :parse_args
)
if /I "%~1"=="--media-port" (
  if "%~2"=="" goto :arg_missing
  set "MEDIA_PORT_VAL=%~2"
  shift & shift
  goto :parse_args
)
if /I "%~1"=="--db-url" (
  if "%~2"=="" goto :arg_missing
  set "DB_URL_VAL=%~2"
  shift & shift
  goto :parse_args
)
if /I "%~1"=="--no-kill" (
  set "NO_KILL=1"
  shift
  goto :parse_args
)
if /I "%~1"=="--no-py" (
  set "PY_ENABLED=0"
  shift
  goto :parse_args
)
if /I "%~1"=="--no-pg" (
  set "PG_ENABLED=0"
  shift
  goto :parse_args
)
if /I "%~1"=="--py-reload" (
  set "PY_RELOAD=1"
  shift
  goto :parse_args
)
if /I "%~1"=="-h" goto :usage
if /I "%~1"=="--help" goto :usage

echo Unknown arg: %~1 1>&2
goto :usage

:arg_missing
echo Missing value for %~1 1>&2
goto :usage

:usage
echo Usage: start.bat [--port ^<port^>] [--media-port ^<port^>] [--db-url ^<url^>] [--no-kill] [--no-py] [--no-pg] [--py-reload]
echo.
echo Options:
echo   --port ^<port^>        MJ Workflow server port (default: 3000 or PORT from .env.local)
echo   --media-port ^<port^>  media-backend (FastAPI) port (default: 9010)
echo   --db-url ^<url^>       media-backend DATABASE_URL (default: postgresql://postgres:postgres@localhost:5433/media_backend)
echo   --no-kill              Do not stop existing listeners; pick a free port instead (applies to both)
echo   --no-py                Do not start media-backend (API + worker)
echo   --no-pg                Do not auto-start Postgres via docker compose
echo   --py-reload            Start media-backend with uvicorn --reload
exit /b 2

:args_done

call :ValidatePort PORT_VAL %DEFAULT_PORT% "[mj-workflow]" || exit /b 2
call :ValidatePort MEDIA_PORT_VAL %DEFAULT_MEDIA_PORT% "[media-backend]" || exit /b 2

if "%NO_KILL%"=="0" (
  call :KillPort !PORT_VAL! "[mj-workflow]"
  if "%PY_ENABLED%"=="1" call :KillPort !MEDIA_PORT_VAL! "[media-backend]"
)

call :EnsureFreePort PORT_VAL 50 "[mj-workflow]"
if "%PY_ENABLED%"=="1" call :EnsureFreePort MEDIA_PORT_VAL 50 "[media-backend]"

set "PORT=%PORT_VAL%"
if "%PY_ENABLED%"=="1" (
  set "MEDIA_PORT=%MEDIA_PORT_VAL%"
  if not defined PY_MEDIA_BACKEND_URL set "PY_MEDIA_BACKEND_URL=http://localhost:%MEDIA_PORT_VAL%"
  set "DATABASE_URL=%DB_URL_VAL%"
)

set "REPO_ROOT=%SCRIPT_DIR%.."
for %%I in ("%REPO_ROOT%") do set "REPO_ROOT=%%~fI"
set "MEDIA_DIR=%REPO_ROOT%\media-backend"

if "%PY_ENABLED%"=="1" (
  call :StartMediaBackend || (
    echo [media-backend] failed to start; continuing with mj-workflow only. 1>&2
  )
)

call :ResolveBun BUN_EXE || (
  echo [mj-workflow] bun not found on PATH. 1>&2
  echo [mj-workflow] Install Bun (Windows) then retry: winget install --id Oven-sh.Bun -e 1>&2
  exit /b 9009
)

echo [mj-workflow] web: http://localhost:%PORT%
echo.
echo Tip: close the extra cmd windows to stop media-backend; press Ctrl+C here to stop mj-workflow.
echo.
if /I not "%NO_BROWSER%"=="1" (
  echo [mj-workflow] opening browser: http://localhost:%PORT%
  start "" "http://localhost:%PORT%"
)
"%BUN_EXE%" run dev
exit /b %errorlevel%

rem --- helpers ---

:ResolveBun
set "OUT=%~1"
set "BUN="

for /f "delims=" %%B in ('where bun 2^>nul') do (
  if exist "%%B" set "BUN=%%B"
  if defined BUN goto :ResolveBunDone
)

if not defined BUN if exist "%USERPROFILE%\.bun\bin\bun.exe" set "BUN=%USERPROFILE%\.bun\bin\bun.exe"
if not defined BUN if exist "%USERPROFILE%\scoop\apps\bun\current\bun.exe" set "BUN=%USERPROFILE%\scoop\apps\bun\current\bun.exe"

if not defined BUN (
  for /f "delims=" %%B in ('dir /b /s "%LOCALAPPDATA%\Microsoft\WinGet\Packages\Oven-sh.Bun_*\\bun-windows-*\\bun.exe" 2^>nul') do (
    set "BUN=%%B"
    goto :ResolveBunDone
  )
)

:ResolveBunDone
if not defined BUN exit /b 1
set "%OUT%=%BUN%"
exit /b 0

:ReadEnvPort
set "ENV_FILE=%~1"
set "OUT_VAR=%~2"
if not exist "%ENV_FILE%" exit /b 0
for /f "usebackq tokens=1* delims==" %%A in (`findstr /R /C:"^[ ]*PORT[ ]*=" "%ENV_FILE%" 2^>nul`) do (
  set "RAW=%%B"
  goto :ReadEnvPortFound
)
exit /b 0

:ReadEnvPortFound
call :StripQuotes RAW
if defined RAW set "%OUT_VAR%=%RAW%"
exit /b 0

:StripQuotes
set "V=!%~1!"
if "!V:~0,1!"=="^"" set "V=!V:~1!"
if "!V:~-1!"=="^"" set "V=!V:~0,-1!"
if "!V:~0,1!"=="'" set "V=!V:~1!"
if "!V:~-1!"=="'" set "V=!V:~0,-1!"
set "%~1=%V%"
exit /b 0

:ValidatePort
set "VARNAME=%~1"
set "DEFAULT=%~2"
set "TAG=%~3"
set "P=!%VARNAME%!"
set "P=%P:"=%"
set "P=%P:'=%"
for /f "delims=0123456789" %%X in ("%P%") do (
  echo %TAG% Invalid port "%P%", falling back to %DEFAULT% 1>&2
  set "%VARNAME%=%DEFAULT%"
  exit /b 0
)
if "%P%"=="" (
  set "%VARNAME%=%DEFAULT%"
  exit /b 0
)
set /a "_PORT_NUM=%P%" >nul 2>&1 || (
  echo %TAG% Invalid port "%P%", falling back to %DEFAULT% 1>&2
  set "%VARNAME%=%DEFAULT%"
  exit /b 0
)
if %_PORT_NUM% LSS 1 (
  echo %TAG% Invalid port "%P%", falling back to %DEFAULT% 1>&2
  set "%VARNAME%=%DEFAULT%"
  exit /b 0
)
if %_PORT_NUM% GTR 65535 (
  echo %TAG% Invalid port "%P%", falling back to %DEFAULT% 1>&2
  set "%VARNAME%=%DEFAULT%"
  exit /b 0
)
exit /b 0

:IsPortInUse
set "P=%~1"
set "_INUSE=0"
for /f "tokens=1,2,3,4,5" %%A in ('netstat -ano ^| findstr /R /C:":%P% .*LISTENING" 2^>nul') do (
  set "_INUSE=1"
)
exit /b %_INUSE%

:KillPort
set "P=%~1"
set "TAG=%~2"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%P% .*LISTENING" 2^>nul') do (
  if not "%%P"=="0" (
    echo %TAG% Port %P% in use ^(pid: %%P^), stopping...
    taskkill /F /PID %%P >nul 2>&1
  )
)
exit /b 0

:EnsureFreePort
set "VARNAME=%~1"
set "MAX_TRIES=%~2"
set "TAG=%~3"
set "START=!%VARNAME%!"
call :IsPortInUse !START!
if errorlevel 1 (
  call :PickFreePort !START! !MAX_TRIES! FREE
  if defined FREE (
    echo %TAG% Port !START! still in use, switching to !FREE!
    set "%VARNAME%=!FREE!"
  )
)
exit /b 0

:PickFreePort
set "START=%~1"
set "MAX=%~2"
set "OUT=%~3"
set "FOUND="
set /a "I=0"
:PickFreePortLoop
if %I% GTR %MAX% goto :PickFreePortDone
set /a "CAND=%START%+%I%"
call :IsPortInUse %CAND%
if errorlevel 1 (
  set "FOUND=%CAND%"
  goto :PickFreePortDone
)
set /a "I=%I%+1"
goto :PickFreePortLoop

:PickFreePortDone
if defined FOUND set "%OUT%=%FOUND%"
exit /b 0

:DockerComposeCmd
set "OUT=%~1"
docker compose version >nul 2>&1 && (set "%OUT%=docker compose" & exit /b 0)
where docker-compose >nul 2>&1 && (set "%OUT%=docker-compose" & exit /b 0)
exit /b 1

:StartPostgresIfNeeded
if "%PG_ENABLED%" NEQ "1" exit /b 0
if not defined DATABASE_URL exit /b 0

set "DB_HOST="
set "DB_PORT="
for /f "usebackq tokens=1,2" %%H in (`powershell -NoProfile -Command "$u=$env:DATABASE_URL; $p=[System.Uri]::new($u); $host=$p.Host; $port=if($p.Port -gt 0){$p.Port}else{5432}; Write-Output \"$host $port\""` ) do (
  set "DB_HOST=%%H"
  set "DB_PORT=%%I"
)
if not defined DB_HOST exit /b 0
if /I NOT "%DB_HOST%"=="localhost" if /I NOT "%DB_HOST%"=="127.0.0.1" exit /b 0
if not defined DB_PORT exit /b 0

call :DockerComposeCmd COMPOSE || (
  echo [media-backend] docker compose not found; start Postgres manually or pass --no-pg. 1>&2
  exit /b 1
)

set "COMPOSE_FILE=%REPO_ROOT%\%DEFAULT_PG_COMPOSE_FILE%"
if not exist "%COMPOSE_FILE%" (
  echo [media-backend] compose file not found: %COMPOSE_FILE% 1>&2
  exit /b 1
)

	call :IsPortInUse %DB_PORT%
	if not errorlevel 1 (
	  echo [media-backend] Postgres port :%DB_PORT% already open ^(skip docker compose^)
	  exit /b 0
	)

echo [media-backend] starting Postgres via docker compose (%COMPOSE_FILE%) on host port :%DB_PORT%
cmd /c "set PG_PORT=%DB_PORT%&& %COMPOSE% -f \"%COMPOSE_FILE%\" up -d" || exit /b 1

set /a "WAIT=0"
:WaitPgLoop
call :IsPortInUse %DB_PORT%
if not errorlevel 1 exit /b 0
set /a "WAIT=%WAIT%+1"
if %WAIT% GEQ 60 (
  echo [media-backend] Postgres still not listening on :%DB_PORT% after waiting. 1>&2
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :WaitPgLoop

:StartMediaBackend
if not exist "%MEDIA_DIR%\" (
  echo [media-backend] directory not found: %MEDIA_DIR% 1>&2
  exit /b 1
)
where uv >nul 2>&1 || (
  echo [media-backend] uv not found. Install uv, or run with --no-py. 1>&2
  exit /b 1
)

if not defined DATABASE_URL (
  echo [media-backend] DATABASE_URL is empty; pass --db-url or set DATABASE_URL. 1>&2
  exit /b 1
)

call :StartPostgresIfNeeded || exit /b 1

	if not exist "%MEDIA_DIR%\.venv\Scripts\python.exe" (
	  echo [media-backend] creating venv + installing deps ^(first run^)
	  pushd "%MEDIA_DIR%" >nul
	  uv venv || (popd >nul & exit /b 1)
	  popd >nul
	)

echo [media-backend] ensuring python deps
pushd "%MEDIA_DIR%" >nul
uv pip install -r requirements.txt || (popd >nul & exit /b 1)
popd >nul

set "RELOAD_ARG="
if "%PY_RELOAD%"=="1" set "RELOAD_ARG=--reload"

echo [media-backend] api: http://localhost:%MEDIA_PORT_VAL%  (DATABASE_URL configured)
start "media-backend api" cmd /k "cd /d \"%MEDIA_DIR%\" && set DATABASE_URL=%DATABASE_URL%&& .venv\\Scripts\\python -m uvicorn media_backend.main:app --host 0.0.0.0 --port %MEDIA_PORT_VAL% %RELOAD_ARG%"
start "media-backend worker" cmd /k "cd /d \"%MEDIA_DIR%\" && set DATABASE_URL=%DATABASE_URL%&& .venv\\Scripts\\python worker.py"
exit /b 0
