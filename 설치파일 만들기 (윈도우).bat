@echo off
chcp 65001 >nul
title P2 DESK 설치파일 만들기
cd /d "%~dp0"

echo.
echo   ===================================
echo     P2 DESK 설치파일 만들기
echo   ===================================
echo.
echo   이 작업이 끝나면 release 폴더에
echo   설치파일과 무설치 버전이 생깁니다.
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [!] Node.js 가 설치되어 있지 않습니다.
    echo       https://nodejs.org 에서 LTS 버전을 먼저 설치해 주세요.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\electron" (
    echo   준비 중입니다. 2~5분 걸립니다.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo   [!] 준비 중 문제가 생겼습니다. 인터넷 연결을 확인해 주세요.
        pause
        exit /b 1
    )
    echo.
)

echo   설치파일을 만드는 중입니다. 5~10분 걸립니다.
echo.
call npm run dist:win
if errorlevel 1 (
    echo.
    echo   [!] 만드는 중 문제가 생겼습니다.
    pause
    exit /b 1
)

echo.
echo   ===================================
echo     완료되었습니다
echo   ===================================
echo.
echo   release 폴더를 열어보세요.
echo.
echo     * P2 DESK Setup 1.0.0.exe   - 설치해서 쓰는 버전
echo     * P2 DESK 1.0.0.exe         - 설치 없이 바로 쓰는 버전
echo.
explorer "%~dp0release"
pause
