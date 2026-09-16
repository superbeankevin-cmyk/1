'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');

const CONFIG_NAME = 'assistant-config.json';
const DATA_NAME = 'part2-data.json';

let mainWindow = null;

/* ------------------------------------------------------------------ */
/* 설정 (데이터 폴더 위치 등)                                          */
/* ------------------------------------------------------------------ */

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_NAME);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch (err) {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

/**
 * 데이터 폴더. 기본값은 userData 이지만 설정에서 클라우드 동기화 폴더
 * (Google Drive / iCloud / OneDrive / Dropbox)로 바꿀 수 있고,
 * 그렇게 하면 맥북에서 같은 폴더를 가리키는 것만으로 데이터가 공유된다.
 */
function dataDir() {
  const cfg = readConfig();
  return cfg.dataDir && typeof cfg.dataDir === 'string'
    ? cfg.dataDir
    : app.getPath('userData');
}

function dataPath() {
  return path.join(dataDir(), DATA_NAME);
}

/* ------------------------------------------------------------------ */
/* 저장 / 불러오기                                                      */
/* ------------------------------------------------------------------ */

/**
 * 파일 내용의 지문.
 *
 * 시각(mtime)으로 판단하면 두 가지가 어긋난다. 클라우드 동기화 앱이 내용은
 * 그대로 두고 시각만 건드리기도 하고, 반대로 1초 안에 들어온 진짜 변경을
 * 자기가 쓴 것으로 오인하기도 한다. 내용을 직접 보면 그런 착각이 없다.
 */
function hashOf(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

async function readFileHash(file) {
  try {
    return hashOf(await fsp.readFile(file, 'utf8'));
  } catch (err) {
    return '';
  }
}

async function readData() {
  const file = dataPath();
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return { ok: true, path: file, data: JSON.parse(raw), hash: hashOf(raw) };
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: true, path: file, data: null, hash: '' };
    return { ok: false, path: file, error: err.message, hash: '' };
  }
}

// 우리가 방금 쓴 내용. 감시기가 이걸 보면 남의 변경이 아니라고 판단한다.
let selfWriteHash = '';

/**
 * 저장. 임시 파일에 쓰고 교체하므로 도중에 앱이 죽어도 원본이 깨지지 않는다.
 *
 * expectedHash 를 넘기면, 그 사이 다른 기기가 파일을 고쳤는지 확인한다.
 * 고쳤다면 덮어쓰지 않고 상대쪽 내용을 돌려준다 — 합치는 건 화면 쪽 몫.
 */
async function writeData(payload, expectedHash) {
  const file = dataPath();
  const tmp = file + '.tmp';
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });

    if (expectedHash) {
      const current = await readFileHash(file);
      if (current && current !== expectedHash) {
        let theirs = null;
        try {
          theirs = JSON.parse(await fsp.readFile(file, 'utf8'));
        } catch (err) {
          theirs = null;   // 읽을 수 없으면 그냥 덮어쓰는 편이 낫다
        }
        if (theirs) {
          return { ok: false, conflict: true, path: file, theirs, hash: current };
        }
      }
    }

    const text = JSON.stringify(payload, null, 2);
    await fsp.writeFile(tmp, text, 'utf8');
    await fsp.rename(tmp, file);
    selfWriteHash = hashOf(text);
    return { ok: true, path: file, savedAt: new Date().toISOString(), hash: selfWriteHash };
  } catch (err) {
    return { ok: false, path: file, error: err.message };
  }
}

/* ------------------------------------------------------------------ */
/* 데이터 파일 감시 — 다른 기기가 고치면 바로 알아챈다                   */
/* ------------------------------------------------------------------ */

let watcher = null;
let watchTimer = null;

/**
 * 파일이 아니라 폴더를 감시한다. 클라우드 동기화 앱들은 파일을 고치는 대신
 * 새로 받아서 갈아끼우는데, 그러면 파일 감시는 끊겨 버리기 때문이다.
 */
function startWatching() {
  stopWatching();
  const dir = dataDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    watcher = fs.watch(dir, (eventType, filename) => {
      if (filename && filename !== DATA_NAME) return;
      clearTimeout(watchTimer);
      // 동기화 중에는 여러 번 울리므로 잠잠해질 때까지 기다린다
      watchTimer = setTimeout(async () => {
        const hash = await readFileHash(dataPath());
        if (!hash || hash === selfWriteHash) return;   // 우리가 쓴 그 내용
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('data:changed', { hash });
        }
      }, 400);
    });
  } catch (err) {
    // 감시가 안 되는 환경(일부 네트워크 드라이브)이어도 앱은 그대로 동작한다
    watcher = null;
  }
}

function stopWatching() {
  clearTimeout(watchTimer);
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

/* ------------------------------------------------------------------ */
/* 클라우드 폴더 찾기                                                   */
/* ------------------------------------------------------------------ */

/** 흔히 쓰는 동기화 폴더 중 실제로 있는 것만 골라 돌려준다 */
function findCloudFolders() {
  const home = app.getPath('home');
  const candidates = [
    ['iCloud Drive', path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')],
    ['Google Drive', path.join(home, 'Google Drive')],
    ['Google Drive', path.join(home, 'Library', 'CloudStorage')],
    ['Dropbox', path.join(home, 'Dropbox')],
    ['OneDrive', path.join(home, 'OneDrive')],
  ];
  if (process.platform === 'win32') {
    candidates.push(['Google Drive', 'G:\\내 드라이브']);
    candidates.push(['Google Drive', 'G:\\My Drive']);
  }

  const found = [];
  const seen = new Set();
  for (const [label, dir] of candidates) {
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
      // Library/CloudStorage 아래에는 계정별 폴더가 한 겹 더 있다
      if (dir.endsWith('CloudStorage')) {
        for (const sub of fs.readdirSync(dir)) {
          const full = path.join(dir, sub);
          if (fs.statSync(full).isDirectory() && !seen.has(full)) {
            seen.add(full);
            found.push({ label: sub.split('-')[0].trim() || label, path: full });
          }
        }
        continue;
      }
      if (seen.has(dir)) continue;
      seen.add(dir);
      found.push({ label, path: dir });
    } catch (err) {
      /* 접근할 수 없는 후보는 건너뛴다 */
    }
  }
  return found;
}

// 하루에 한 번, 최근 14개까지 자동 백업
async function autoBackup(payload) {
  try {
    const dir = path.join(dataDir(), 'backups');
    await fsp.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `part2-data-${stamp}.json`);
    await fsp.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');

    const files = (await fsp.readdir(dir))
      .filter((f) => f.startsWith('part2-data-') && f.endsWith('.json'))
      .sort();
    for (const stale of files.slice(0, Math.max(0, files.length - 14))) {
      await fsp.unlink(path.join(dir, stale)).catch(() => {});
    }
    return { ok: true, path: file };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function registerIpc() {
  ipcMain.handle('data:read', () => readData());
  ipcMain.handle('data:write', (_e, payload, expectedHash) => writeData(payload, expectedHash));
  ipcMain.handle('cloud:folders', () => findCloudFolders());
  ipcMain.handle('data:backup', (_e, payload) => autoBackup(payload));

  ipcMain.handle('config:get', () => ({
    dataDir: dataDir(),
    dataPath: dataPath(),
    isCustomDir: Boolean(readConfig().dataDir),
    platform: process.platform,
    version: app.getVersion(),
  }));

  ipcMain.handle('config:chooseDataDir', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '데이터를 보관할 폴더 선택 (클라우드 폴더를 고르면 맥과 공유됩니다)',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: dataDir(),
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };

    const target = res.filePaths[0];
    const current = dataPath();
    const next = path.join(target, DATA_NAME);

    // 기존 데이터가 있고 새 위치가 비어 있으면 옮겨준다.
    try {
      if (fs.existsSync(current) && !fs.existsSync(next)) {
        await fsp.copyFile(current, next);
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }

    const cfg = readConfig();
    cfg.dataDir = target;
    writeConfig(cfg);
    return { ok: true, dataDir: target, dataPath: next };
  });

  ipcMain.handle('config:resetDataDir', () => {
    const cfg = readConfig();
    delete cfg.dataDir;
    writeConfig(cfg);
    startWatching();
    return { ok: true, dataDir: dataDir(), dataPath: dataPath() };
  });

  // 설정에서 폴더를 직접 지정할 때 (클라우드 폴더 추천 목록에서 고른 경우)
  ipcMain.handle('config:useDataDir', async (_e, target) => {
    try {
      const current = dataPath();
      const next = path.join(target, DATA_NAME);
      await fsp.mkdir(target, { recursive: true });
      if (fs.existsSync(current) && !fs.existsSync(next)) {
        await fsp.copyFile(current, next);
      }
      const cfg = readConfig();
      cfg.dataDir = target;
      writeConfig(cfg);
      startWatching();
      return { ok: true, dataDir: target, dataPath: next };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('shell:openDataDir', () => {
    shell.openPath(dataDir());
    return { ok: true };
  });

  ipcMain.handle('file:save', async (_e, { defaultName, contents, filters }) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(app.getPath('downloads'), defaultName || 'export.txt'),
      filters: filters || [{ name: '모든 파일', extensions: ['*'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
      await fsp.writeFile(res.filePath, contents, 'utf8');
      return { ok: true, path: res.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('file:open', async (_e, { filters } = {}) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [{ name: '모든 파일', extensions: ['*'] }],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    try {
      const contents = await fsp.readFile(res.filePaths[0], 'utf8');
      return { ok: true, path: res.filePaths[0], contents };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

/* ------------------------------------------------------------------ */
/* 창                                                                  */
/* ------------------------------------------------------------------ */

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
  } catch (err) {
    return { width: 1280, height: 860 };
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getNormalBounds();
  try {
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }, null, 2),
      'utf8'
    );
  } catch (err) {
    /* 창 크기 저장 실패는 무시 */
  }
}

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width || 1280,
    height: state.height || 860,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#12141a',
    title: 'P2 DESK',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  // 실행기(.app)를 통해 켜면 창이 다른 창 뒤에 숨는 경우가 있다.
  // 앱은 떠 있는데 안 보이면 안 켜진 것으로 오해하기 쉬우므로 앞으로 끌어낸다.
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    if (process.platform === 'darwin') app.focus({ steal: true });
  });
  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', () => {
    stopWatching();
    mainWindow = null;
  });
  mainWindow.webContents.once('did-finish-load', startWatching);

  // 외부 링크는 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu() {
  const send = (channel) => () =>
    mainWindow && mainWindow.webContents.send(channel);

  const template = [
    {
      label: '파일',
      submenu: [
        { label: '새 일정', accelerator: 'CmdOrCtrl+N', click: send('menu:new-event') },
        { label: '새 할 일', accelerator: 'CmdOrCtrl+Shift+N', click: send('menu:new-task') },
        { type: 'separator' },
        { label: '캘린더 내보내기 (.ics)', click: send('menu:export-ics') },
        { label: '캘린더 가져오기 (.ics)', click: send('menu:import-ics') },
        { label: '전체 백업 (.json)', click: send('menu:export-json') },
        { type: 'separator' },
        { role: 'quit', label: '종료' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: 'Today', accelerator: 'CmdOrCtrl+1', click: send('menu:view-today') },
        { label: 'Calendar', accelerator: 'CmdOrCtrl+2', click: send('menu:view-calendar') },
        { label: 'Projects', accelerator: 'CmdOrCtrl+3', click: send('menu:view-projects') },
        { label: 'My Tasks', accelerator: 'CmdOrCtrl+4', click: send('menu:view-tasks') },
        { label: 'Team', accelerator: 'CmdOrCtrl+5', click: send('menu:view-team') },
        { label: '설정', accelerator: 'CmdOrCtrl+,', click: send('menu:view-settings') },
        { type: 'separator' },
        { role: 'reload', label: '새로고침' },
        { role: 'toggleDevTools', label: '개발자 도구' },
        { type: 'separator' },
        { role: 'resetZoom', label: '기본 크기' },
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { role: 'togglefullscreen', label: '전체 화면' },
      ],
    },
    {
      label: '도움말',
      submenu: [
        {
          label: '데이터 폴더 열기',
          click: () => shell.openPath(dataDir()),
        },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({ role: 'appMenu' });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 인스턴스 하나만 뜨게 (같은 파일을 두 창이 동시에 쓰면 데이터가 꼬인다)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpc();
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
