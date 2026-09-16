@echo off
chcp 65001 >nul
title P2 DESK 실행
cd /d "%~dp0"

echo.
echo   ===================================
echo     P2 DESK - 제작2파트 비서
echo   ===================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [!] Node.js 가 설치되어 있지 않습니다.
    echo.
    echo       https://nodejs.org 에 접속해서
    echo       왼쪽의 LTS 버전을 내려받아 설치한 뒤,
    echo       이 파일을 다시 실행해 주세요.
    echo.
    echo       설치할 때 옵션은 건드리지 말고
    echo       계속 [Next] 만 누르시면 됩니다.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\electron\dist" (
    echo   처음 실행이라 준비를 좀 합니다.
    echo   100MB 정도 내려받습니다. 2~5분 걸리고, 다음부터는 바로 켜집니다.
    echo.
    rem --foreground-scripts: 내려받기 실패가 조용히 묻히지 않게 한다
    call npm install --foreground-scripts
    if errorlevel 1 (
        echo.
        echo   [!] 준비 중 문제가 생겼습니다.
        echo       인터넷 연결을 확인하고 다시 실행해 주세요.
        echo.
        pause
        exit /b 1
    )
    echo.
)

rem 최신 npm 은 보안상 패키지의 설치 스크립트를 막는다. Electron 은 그 스크립트로
rem 본체를 받아오기 때문에, npm install 이 끝나도 본체가 없을 수 있다.
if not exist "node_modules\electron\dist" (
    call node scripts\ensure-electron.js
)

rem 그래도 없으면 받다가 끊긴 것이다
if not exist "node_modules\electron\dist" (
    echo.
    echo   [!] 앱 본체를 내려받지 못했습니다.
    echo.
    echo       아래를 명령 프롬프트에 붙여넣어 다시 시도해 주세요.
    echo       ^(다른 서버에서 받아옵니다^)
    echo.
    echo         cd /d "%~dp0"
    echo         rmdir /s /q node_modules\electron
    echo         set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    echo         npm install electron --foreground-scripts
    echo.
    pause
    exit /b 1
)

echo   앱을 켜는 중입니다...
echo   (이 검은 창은 앱이 켜져 있는 동안 같이 떠 있습니다. 닫지 마세요.)
echo.
call node_modules\.bin\electron.cmd .
