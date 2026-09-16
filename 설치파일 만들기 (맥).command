#!/bin/bash
# P2 DESK 맥용 설치파일(.dmg) 만들기 — 파인더에서 더블클릭하면 됩니다.
cd "$(dirname "$0")" || exit 1

echo ""
echo "  ==================================="
echo "    P2 DESK 맥용 설치파일 만들기"
echo "  ==================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
    echo "  [!] Node.js 가 필요합니다. https://nodejs.org 에서 LTS 버전을 먼저 설치해 주세요."
    read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다."
    exit 1
fi

if [ ! -d "node_modules/electron" ]; then
    echo "  준비 중입니다. 2~5분 걸립니다."
    echo ""
    npm install || { echo "  [!] 인터넷 연결을 확인해 주세요."; read -n 1 -s -r -p ""; exit 1; }
    echo ""
fi

echo "  설치파일을 만드는 중입니다. 5~10분 걸립니다."
echo ""
npm run dist:mac || { echo ""; echo "  [!] 만드는 중 문제가 생겼습니다."; read -n 1 -s -r -p ""; exit 1; }

echo ""
echo "  ==================================="
echo "    완료되었습니다"
echo "  ==================================="
echo ""
echo "  release 폴더의 .dmg 를 열어 P2 DESK 를 응용 프로그램으로 옮기세요."
echo ""
echo "  처음 열 때 \"확인되지 않은 개발자\" 경고가 뜨면"
echo "  앱을 마우스 오른쪽 클릭 → [열기] 를 누르시면 됩니다."
echo ""
open release 2>/dev/null
read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다."
