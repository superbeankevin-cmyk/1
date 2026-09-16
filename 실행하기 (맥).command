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

if [ ! -d "node_modules/electron" ]; then
    echo "  처음 실행이라 준비를 좀 합니다."
    echo "  2~5분 정도 걸리고, 다음부터는 바로 켜집니다."
    echo ""
    if ! npm install; then
        echo ""
        echo "  [!] 준비 중 문제가 생겼습니다. 인터넷 연결을 확인해 주세요."
        read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다."
        exit 1
    fi
    echo ""
fi

echo "  앱을 켜는 중입니다..."
echo "  (이 터미널 창은 앱이 켜져 있는 동안 같이 떠 있습니다. 닫지 마세요.)"
echo ""
npm start
