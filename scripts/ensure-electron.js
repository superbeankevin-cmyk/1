/**
 * Electron 본체(약 100MB)가 실제로 있는지 확인하고, 없으면 직접 받아온다.
 *
 * 최신 npm 은 보안을 위해 패키지의 설치 스크립트를 기본적으로 막는다.
 * 그런데 Electron 은 바로 그 설치 스크립트로 본체를 내려받기 때문에,
 * npm install 이 "성공" 했는데도 정작 실행 파일이 없는 상태가 된다.
 * (npm 은 경고만 남기고 넘어가므로 실패로 보이지도 않는다.)
 *
 * 여기서는 그 스크립트를 직접 실행해 준다. npm 버전이나 설정과 무관하게 동작한다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const packageDir = path.join(root, 'node_modules', 'electron');
const distDir = path.join(packageDir, 'dist');
const installScript = path.join(packageDir, 'install.js');

function ready() {
  try {
    return fs.statSync(distDir).isDirectory() && fs.readdirSync(distDir).length > 0;
  } catch (err) {
    return false;
  }
}

if (ready()) process.exit(0);

if (!fs.existsSync(installScript)) {
  console.error('');
  console.error('  [!] 설치가 덜 되었습니다. 먼저 npm install 을 실행해 주세요.');
  console.error('');
  process.exit(1);
}

console.log('');
console.log('  앱 본체를 내려받습니다. 100MB 정도라 몇 분 걸립니다.');
console.log('');

// 기본 경로(GitHub)가 막히거나 느리면 미러에서 한 번 더 시도한다
const attempts = [
  { label: '기본 서버', env: {} },
  { label: '미러 서버', env: { ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' } },
];

for (const attempt of attempts) {
  if (attempt.label !== '기본 서버') {
    console.log('');
    console.log('  ' + attempt.label + '에서 다시 시도합니다.');
    console.log('');
  }
  spawnSync(process.execPath, [installScript], {
    cwd: packageDir,
    stdio: 'inherit',
    env: Object.assign({}, process.env, attempt.env),
  });
  if (ready()) {
    console.log('');
    console.log('  준비가 끝났습니다.');
    process.exit(0);
  }
}

console.error('');
console.error('  [!] 앱 본체를 내려받지 못했습니다. 인터넷 연결을 확인해 주세요.');
console.error('');
process.exit(1);
