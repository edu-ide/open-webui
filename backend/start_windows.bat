:: This method is not recommended, and we recommend you use the `start.sh` file with WSL instead.
@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

:: Get the directory of the current script
SET "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%" || exit /b

:: Load .env file variables
SET "ENV_FILE=.env"
IF EXIST "%ENV_FILE%" (
    echo Loading environment variables from %ENV_FILE%
    FOR /F "usebackq tokens=1,* delims==" %%A IN ("%ENV_FILE%") DO (
        SET "%%A=%%B"
        echo Set %%A=%%B
    )
) ELSE (
    echo %ENV_FILE% not found.
)

:: Add conditional Playwright browser installation
IF /I "%WEB_LOADER_ENGINE%" == "playwright" (
    IF "%PLAYWRIGHT_WS_URL%" == "" (
        echo Installing Playwright browsers...
        playwright install chromium
        playwright install-deps chromium
    )

    python -c "import nltk; nltk.download('punkt_tab')"
)

SET "KEY_FILE=.webui_secret_key"
IF "%PORT%"=="" SET PORT=8082
IF "%HOST%"=="" SET HOST=0.0.0.0
SET "WEBUI_SECRET_KEY=%WEBUI_SECRET_KEY%"
SET "WEBUI_JWT_SECRET_KEY=%WEBUI_JWT_SECRET_KEY%"

:: Check if WEBUI_SECRET_KEY and WEBUI_JWT_SECRET_KEY are not set
IF "%WEBUI_SECRET_KEY%%WEBUI_JWT_SECRET_KEY%" == " " (
    echo Loading WEBUI_SECRET_KEY from file, not provided as an environment variable.

    IF NOT EXIST "%KEY_FILE%" (
        echo Generating WEBUI_SECRET_KEY
        :: Generate a random value to use as a WEBUI_SECRET_KEY in case the user didn't provide one
        SET /p WEBUI_SECRET_KEY=<nul
        FOR /L %%i IN (1,1,12) DO SET /p WEBUI_SECRET_KEY=<!random!>>%KEY_FILE%
        echo WEBUI_SECRET_KEY generated
    )

    echo Loading WEBUI_SECRET_KEY from %KEY_FILE%
    SET /p WEBUI_SECRET_KEY=<%KEY_FILE%
)

:: Execute uvicorn
SET "WEBUI_SECRET_KEY=%WEBUI_SECRET_KEY%"
IF "%UVICORN_WORKERS%"=="" SET UVICORN_WORKERS=1

:: Add src and generated client paths to PYTHONPATH
SET "PYTHONPATH=%SCRIPT_DIR%src;%SCRIPT_DIR%src\\generated_internal_client;%PYTHONPATH%"

uvicorn open_webui.main:app --host "%HOST%" --port "%PORT%" --forwarded-allow-ips '*' --workers %UVICORN_WORKERS% --ws auto --reload
:: For ssl user uvicorn open_webui.main:app --host "%HOST%" --port "%PORT%" --forwarded-allow-ips '*' --ssl-keyfile "key.pem" --ssl-certfile "cert.pem" --ws auto
