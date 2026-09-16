#!/bin/bash
# P2 DESK 실행 — 파인더에서 더블클릭하면 됩니다.
cd "$(dirname "$0")" || exit 1

echo ""
echo "  ==================================="
echo "    P2 DESK - 제작2파트 비서"
echo "  ==================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
    echo "  [!] Node.js 가 설치되어 있지 않습니다."
    echo ""
    echo "      https://nodejs.org 에 접속해서"
    echo "      왼쪽의 LTS 버전을 내려받아 설치한 뒤,"
    echo "      이 파일을 다시 실행해 주세요."
    echo ""
    read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다."
    exit 1
fi

if [ ! -d "node_modules/electron/dist" ]; then
    echo "  처음 실행이라 준비를 좀 합니다."
    echo "  100MB 정도 내려받습니다. 2~5분 걸리고, 다음부터는 바로 켜집니다."
    echo ""
    # --foreground-scripts: 내려받기가 실패하면 조용히 넘어가지 않고 화면에 보인다
    if ! npm install --foreground-scripts; then
        echo ""
        echo "  [!] 준비 중 문제가 생겼습니다. 인터넷 연결을 확인해 주세요."
        read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다."
        exit 1
    fi
    echo ""
fi

# 최신 npm 은 보안상 패키지의 설치 스크립트를 막는다. Electron 은 그 스크립트로
# 본체를 받아오기 때문에, npm install 이 끝나도 본체가 없을 수 있다.
if [ ! -d "node_modules/electron/dist" ]; then
    node scripts/ensure-electron.js
fi

# 그래도 없으면 받다가 끊긴 것이다.
if [ ! -d "node_modules/electron/dist" ]; then
    echo ""
    echo "  [!] 앱 본체를 내려받지 못했습니다."
    echo ""
    echo "      아래를 터미널에 붙여넣어 다시 시도해 주세요."
    echo "      (다른 서버에서 받아옵니다)"
    echo ""
    echo "        cd \"$(pwd)\""
    echo "        rm -rf node_modules/electron"
    echo "        ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install electron --foreground-scripts"
    echo ""
    read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다."
    exit 1
fi

echo "  앱을 켜는 중입니다..."
echo "  (이 터미널 창은 앱이 켜져 있는 동안 같이 떠 있습니다. 닫지 마세요.)"
echo ""
./node_modules/.bin/electron .
