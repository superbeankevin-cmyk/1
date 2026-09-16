/**
 * 앱 실행기.
 *
 * `electron .` 를 그냥 쓰면, 맥에 다른 프로그램(예: DaVinci Resolve)이 자기
 * Electron 을 PATH 에 올려둔 경우 그쪽이 실행돼 버린다. 그러면 우리 앱 대신
 * Electron 기본 안내 화면이 뜬다.
 *
 * require('electron') 은 이 프로젝트에 설치된 Electron 실행파일의 절대 경로를
 * 돌려주므로, 그걸 직접 실행하면 남의 Electron 이 끼어들 수 없다.
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');

// 최신 npm 은 패키지의 설치 스크립트를 막아 두기 때문에, npm install 이 끝나도
// Electron 본체가 없을 수 있다. 그럴 때 직접 받아오게 한다.
const distDir = path.join(projectRoot, 'node_modules', 'electron', 'dist');
if (!fs.existsSync(distDir)) {
  const ensure = spawnSync(
    process.execPath,
    [path.join(__dirname, 'ensure-electron.js')],
    { stdio: 'inherit' }
  );
  if (ensure.status !== 0) process.exit(ensure.status || 1);
}

let electronPath;
try {
  electronPath = require('electron');
} catch (err) {
  electronPath = null;
}

if (typeof electronPath !== 'string' || !fs.existsSync(electronPath)) {
  console.error('');
  console.error('  [!] 앱 실행에 필요한 파일이 아직 준비되지 않았습니다.');
  console.error('');
  console.error('      아래 명령을 먼저 실행해 주세요:');
  console.error('');
  console.error('        npm install');
  console.error('');
  process.exit(1);
}

// 이 변수가 남아 있으면 Electron 이 창 없이 Node 처럼만 돈다
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

// npm start -- --flag 처럼 뒤에 붙인 인자는 그대로 넘겨준다
const extraArgs = process.argv.slice(2);
const child = spawn(electronPath, [projectRoot].concat(extraArgs), { stdio: 'inherit', env });

child.on('close', (code) => process.exit(code === null ? 0 : code));
child.on('error', (err) => {
  console.error('  [!] 앱을 실행하지 못했습니다: ' + err.message);
  process.exit(1);
});
