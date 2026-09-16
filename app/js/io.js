/* 파일 내보내기 / 가져오기 — 데스크톱이면 네이티브 대화상자, 아니면 브라우저 방식 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const desktop = global.desktop && global.desktop.isDesktop ? global.desktop : null;

  async function saveText(defaultName, contents, filters) {
    if (desktop) {
      const res = await desktop.saveFile({ defaultName, contents, filters });
      return res;
    }
    // 브라우저: 임시 링크로 다운로드
    const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true, path: defaultName };
  }

  function openText(accept) {
    if (desktop) {
      const filters = accept === '.ics'
        ? [{ name: '캘린더 파일', extensions: ['ics'] }]
        : [{ name: '백업 파일', extensions: ['json'] }];
      return desktop.openFile({ filters });
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '';
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return resolve({ ok: false, canceled: true });
        const reader = new FileReader();
        reader.onload = () => resolve({ ok: true, path: file.name, contents: String(reader.result) });
        reader.onerror = () => resolve({ ok: false, error: '파일을 읽지 못했습니다.' });
        reader.readAsText(file, 'utf-8');
      });
      input.click();
    });
  }

  A.io = { saveText, openText, isDesktop: Boolean(desktop) };
})(window);
