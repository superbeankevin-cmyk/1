/* SETTINGS — 저장 위치(맥 연동), 표시 설정, 타임트리 연동, 백업 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;

  const desktop = global.desktop && global.desktop.isDesktop ? global.desktop : null;

  function card(title, subtitle, children) {
    return el('div', { class: 'card', style: { marginBottom: '16px' } }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: title }),
        subtitle ? el('span', { class: 'sub', text: subtitle }) : null,
      ]),
      ...[].concat(children),
    ]);
  }

  function render(root, ctx) {
    root.style.maxWidth = '760px';

    /* ---------------------------------------------------------------- */
    /* 내 정보                                                           */
    /* ---------------------------------------------------------------- */

    const nameInput = el('input', { type: 'text', placeholder: '인사말에 쓸 이름' });
    nameInput.value = S.data.settings.userName || '';
    nameInput.addEventListener('blur', () => {
      S.data.settings.userName = nameInput.value.trim();
      S.save();
    });
    root.appendChild(card('내 정보', null, [
      el('div', { class: 'field' }, [
        el('label', { text: '이름' }),
        nameInput,
        el('span', { class: 'faint', text: 'Today 화면 인사말에 쓰입니다.' }),
      ]),
    ]));

    /* ---------------------------------------------------------------- */
    /* 표시                                                              */
    /* ---------------------------------------------------------------- */

    const weekStartSelect = el('select', {}, [
      el('option', { value: '0', text: '일요일' }),
      el('option', { value: '1', text: '월요일' }),
    ]);
    weekStartSelect.value = String(S.data.settings.weekStart);
    weekStartSelect.addEventListener('change', () => {
      S.data.settings.weekStart = Number(weekStartSelect.value);
      S.save();
      ctx.rerender();
    });

    const hourOptions = (selected) => {
      const sel = el('select');
      for (let h = 0; h <= 24; h++) {
        sel.appendChild(el('option', { value: String(h), text: U.pad(h) + ':00' }));
      }
      sel.value = String(selected);
      return sel;
    };
    const startHour = hourOptions(S.data.settings.dayStartHour);
    const endHour = hourOptions(S.data.settings.dayEndHour);
    const syncHours = () => {
      const from = Number(startHour.value);
      const to = Number(endHour.value);
      if (to <= from) {
        ui.toast('끝 시각이 시작 시각보다 빨라요.', { type: 'error' });
        startHour.value = String(S.data.settings.dayStartHour);
        endHour.value = String(S.data.settings.dayEndHour);
        return;
      }
      S.data.settings.dayStartHour = from;
      S.data.settings.dayEndHour = to;
      S.save();
      ctx.rerender();
    };
    startHour.addEventListener('change', syncHours);
    endHour.addEventListener('change', syncHours);

    const carryBox = el('input', { type: 'checkbox' });
    carryBox.checked = S.data.settings.carryOver !== false;
    carryBox.addEventListener('change', () => {
      S.data.settings.carryOver = carryBox.checked;
      S.save();
    });

    root.appendChild(card('표시', null, [
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('label', { text: '한 주의 시작' }), weekStartSelect]),
        el('div', { class: 'field' }, [
          el('label', { text: '시간표 표시 범위' }),
          el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
            startHour, el('span', { class: 'faint', text: '–' }), endHour,
          ]),
        ]),
      ]),
      el('label', { class: 'switch', style: { marginTop: '12px' } }, [
        carryBox,
        el('span', { text: '어제 못 끝낸 할 일을 오늘로 자동으로 가져오기' }),
      ]),
    ]));

    /* ---------------------------------------------------------------- */
    /* 저장 위치 — 맥북 연동의 핵심                                       */
    /* ---------------------------------------------------------------- */

    const locationBox = el('div', {
      class: 'faint wrap-break',
      style: {
        background: 'var(--bg)', padding: '9px 11px', borderRadius: 'var(--radius-sm)',
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '11.5px',
        wordBreak: 'break-all', marginBottom: '11px',
      },
      text: S.location,
    });

    const storageChildren = [
      locationBox,
      el('p', {
        class: 'muted',
        style: { margin: '0 0 12px', fontSize: '12.5px', lineHeight: '1.65' },
        text:
          '모든 데이터는 이 JSON 파일 하나에 들어 있습니다. 이 파일을 구글 드라이브 · iCloud Drive · '
          + 'OneDrive · Dropbox 같은 동기화 폴더에 두고, 맥과 윈도우 양쪽에서 같은 폴더를 가리키면 '
          + '일정과 체크리스트가 그대로 이어집니다.',
      }),
      el('p', {
        class: 'muted',
        style: { margin: '0 0 12px', fontSize: '12.5px', lineHeight: '1.65' },
        text:
          '다른 기기에서 파일이 바뀌면 앱이 알아서 다시 읽어옵니다. 양쪽에서 동시에 고친 경우에는 '
          + '덮어쓰지 않고 항목 단위로 합치며, 같은 항목을 양쪽에서 고쳤을 때만 나중에 고친 쪽이 남습니다.',
      }),
    ];

    if (desktop) {
      // 흔한 동기화 폴더를 찾아 한 번에 고를 수 있게 해 준다
      const cloudRow = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } });
      storageChildren.push(cloudRow);
      desktop.cloudFolders().then((folders) => {
        if (!folders || !folders.length) return;
        cloudRow.appendChild(el('span', {
          class: 'faint', style: { width: '100%', marginBottom: '2px' },
          text: '이 컴퓨터에서 찾은 동기화 폴더 — 누르면 그 안에 P2 DESK 폴더를 만들어 씁니다',
        }));
        folders.forEach((folder) => {
          cloudRow.appendChild(el('button', {
            class: 'btn btn-sm',
            title: folder.path,
            text: folder.label,
            onClick: async () => {
              const target = folder.path.replace(/[\\/]+$/, '')
                + (folder.path.includes('\\') ? '\\' : '/') + 'P2 DESK';
              const res = await desktop.useDataDir(target);
              if (!res.ok) { ui.toast(res.error || '폴더를 바꾸지 못했습니다.', { type: 'error' }); return; }
              await S.load();
              ctx.rerender();
              ui.toast('저장 폴더를 옮겼습니다. 맥에서도 같은 폴더를 고르세요.', { duration: 6000 });
            },
          }));
        });
      });

      storageChildren.push(
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
          el('button', {
            class: 'btn btn-primary',
            text: '직접 고르기',
            onClick: async () => {
              const res = await desktop.chooseDataDir();
              if (res.canceled) return;
              if (!res.ok) { ui.toast(res.error || '폴더를 바꾸지 못했습니다.', { type: 'error' }); return; }
              await S.load();
              ctx.rerender();
              ui.toast('저장 폴더를 옮겼습니다. 이제 맥북에서도 같은 폴더를 지정하세요.');
            },
          }),
          el('button', {
            class: 'btn',
            text: '폴더 열기',
            onClick: () => desktop.openDataDir(),
          }),
          el('button', {
            class: 'btn btn-quiet',
            text: '기본 위치로 되돌리기',
            onClick: async () => {
              const ok = await ui.confirm('저장 위치를 앱 기본 폴더로 되돌릴까요? 기존 파일은 지금 폴더에 그대로 남습니다.');
              if (!ok) return;
              await desktop.resetDataDir();
              await S.load();
              ctx.rerender();
              ui.toast('기본 위치로 되돌렸습니다.');
            },
          }),
        ])
      );
    } else {
      storageChildren.push(
        el('p', {
          class: 'faint',
          style: { margin: '0' },
          text: '지금은 브라우저에서 열려 있어 저장 위치를 바꿀 수 없습니다. 설치된 앱으로 실행하면 폴더를 지정할 수 있습니다.',
        })
      );
    }

    root.appendChild(card('데이터 저장 위치', '맥북 연동', storageChildren));

    /* ---------------------------------------------------------------- */
    /* 타임트리 · 구글 캘린더                                             */
    /* ---------------------------------------------------------------- */

    root.appendChild(card('캘린더 연동', '타임트리 · 구글 캘린더', [
      el('p', {
        class: 'muted',
        style: { margin: '0 0 12px', fontSize: '12.5px', lineHeight: '1.65' },
        text:
          '.ics 는 캘린더 앱들이 공통으로 쓰는 형식입니다. 여기서 내보낸 파일을 타임트리나 구글 '
          + '캘린더에서 가져오면 팀에 공유할 수 있고, 반대로 타임트리에서 내보낸 파일을 여기로 '
          + '가져오면 기존 일정을 그대로 옮길 수 있습니다. (체크리스트는 나만 보는 것이라 포함되지 않습니다.)',
      }),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
        el('button', { class: 'btn', text: '.ics 로 내보내기', onClick: () => exportIcs() }),
        el('button', { class: 'btn', text: '.ics 가져오기', onClick: () => importIcs(ctx) }),
      ]),
    ]));

    /* ---------------------------------------------------------------- */
    /* 백업                                                              */
    /* ---------------------------------------------------------------- */

    root.appendChild(card('백업', desktop ? '하루에 한 번 자동 백업됩니다' : null, [
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
        el('button', {
          class: 'btn',
          text: '전체 백업 내보내기',
          onClick: async () => {
            const res = await A.io.saveText(
              'p2desk-backup-' + U.today() + '.json',
              S.exportJson(),
              [{ name: 'JSON', extensions: ['json'] }]
            );
            if (res.ok) ui.toast('백업 파일을 저장했습니다.');
          },
        }),
        el('button', {
          class: 'btn',
          text: '백업에서 복원',
          onClick: async () => {
            const file = await A.io.openText('.json');
            if (!file.ok) { if (!file.canceled) ui.toast(file.error || '읽지 못했습니다.', { type: 'error' }); return; }
            const ok = await ui.confirm(
              '지금 데이터를 백업 파일 내용으로 덮어씁니다. 계속할까요?',
              { danger: true, confirmLabel: '복원' }
            );
            if (!ok) return;
            try {
              S.importJson(file.contents, 'replace');
              ctx.rerender();
              ui.toast('복원했습니다.');
            } catch (err) {
              ui.toast(err.message, { type: 'error' });
            }
          },
        }),
      ]),
    ]));

    /* ---------------------------------------------------------------- */
    /* 단축키                                                            */
    /* ---------------------------------------------------------------- */

    const shortcuts = [
      ['Ctrl N', '일정 빠르게 추가'],
      ['Ctrl ⇧ N', '할 일 빠르게 추가'],
      ['Ctrl 1 – 5', '화면 이동 (Today · Calendar · Projects · My Tasks · Team)'],
      ['/', '검색'],
      ['T', '오늘로 이동'],
      ['← →', '이전 / 다음 기간'],
      ['Esc', '창 닫기'],
    ];
    const rows = el('div', { class: 'rows' });
    shortcuts.forEach(([key, what]) => {
      rows.appendChild(el('div', { class: 'row' }, [
        el('div', { style: { minWidth: '110px' } },
          key.split(' ').map((k) => el('kbd', { text: k, style: { marginRight: '3px' } }))),
        el('span', { class: 'grow muted', text: what }),
      ]));
    });
    root.appendChild(card('단축키', null, [rows]));

    root.appendChild(el('p', {
      class: 'faint',
      style: { textAlign: 'center', padding: '10px 0 30px' },
      text: 'P2 DESK · Good Plan, Better Contents.',
    }));
  }

  /* ------------------------------------------------------------------ */

  async function exportIcs() {
    const events = S.data.events;
    if (!events.length) { ui.toast('내보낼 일정이 없습니다.', { type: 'error' }); return; }
    const text = A.ics.toIcs(events, { memberName: (id) => S.memberName(id) });
    const res = await A.io.saveText(
      'p2desk-' + U.today() + '.ics',
      text,
      [{ name: '캘린더 파일', extensions: ['ics'] }]
    );
    if (res.ok) ui.toast(events.length + '개 일정을 내보냈습니다.');
  }

  async function importIcs(ctx) {
    const file = await A.io.openText('.ics');
    if (!file.ok) { if (!file.canceled) ui.toast(file.error || '읽지 못했습니다.', { type: 'error' }); return; }

    let parsed;
    try {
      parsed = A.ics.parseIcs(file.contents, { members: S.members() });
    } catch (err) {
      ui.toast('파일을 해석하지 못했습니다: ' + err.message, { type: 'error' });
      return;
    }
    if (!parsed.length) { ui.toast('가져올 일정을 찾지 못했습니다.', { type: 'error' }); return; }

    // 같은 UID 는 이미 가져온 것으로 보고 건너뛴다
    const known = new Set(S.data.events.map((e) => e.importedUid).filter(Boolean));
    const fresh = parsed.filter((ev) => !ev.importedUid || !known.has(ev.importedUid));

    const ok = await ui.confirm(
      fresh.length + '개의 일정을 가져옵니다.'
        + (parsed.length - fresh.length ? ' (이미 가져온 ' + (parsed.length - fresh.length) + '개는 건너뜁니다.)' : '')
        + '\n담당자는 제목·메모에서 이름을 찾아 자동으로 연결합니다.',
      { confirmLabel: '가져오기' }
    );
    if (!ok) return;

    for (const ev of fresh) S.data.events.push(ev);
    S.save();
    ctx.rerender();
    ui.toast(fresh.length + '개를 가져왔습니다.');
  }

  A.views = A.views || {};
  A.views.settings = { title: 'Settings', render };
})(window);
