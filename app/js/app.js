/* 앱 셸 — 사이드바, 상단바, 화면 전환, 단축키 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;
  const icon = A.icon;

  const NAV = [
    { id: 'today', label: 'Today', icon: 'today', key: '1' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar', key: '2' },
    { id: 'projects', label: 'Projects', icon: 'projects', key: '3' },
    { id: 'tasks', label: 'My Tasks', icon: 'tasks', key: '4' },
    { id: 'team', label: 'Team', icon: 'team', key: '5' },
  ];

  /* 화면끼리 공유하는 가벼운 상태 (선택한 날짜, 보기 모드 등) */
  const state = {
    view: 'today',
    selected: U.today(),
    cursor: U.today(),
    calMode: 'month',
    teamRange: 'thisWeek',
    projectFilter: 'all',
  };

  let contentScroll = null;

  /* ================================================================ */
  /* 화면 전환                                                         */
  /* ================================================================ */

  function go(viewId) {
    if (!A.views[viewId]) return;
    state.view = viewId;
    render();
  }

  function render() {
    renderSidebar();
    renderTitlebar();
    renderView();
  }

  function renderView() {
    const root = U.clear(U.$('#view'));
    root.removeAttribute('style');
    contentScroll.classList.remove('fixed');

    const view = A.views[state.view];
    if (!view) return;

    const ctx = {
      state,
      go,
      rerender: render,
      /** 이 화면은 페이지 스크롤 없이 화면 높이에 맞춘다 (시간표가 있는 화면) */
      fullHeight() {
        contentScroll.classList.add('fixed');
        root.style.display = 'flex';
        root.style.flexDirection = 'column';
        root.style.flex = '1';
        root.style.minHeight = '0';
      },
    };

    view.render(root, ctx);
  }

  /* ================================================================ */
  /* 사이드바                                                          */
  /* ================================================================ */

  function renderSidebar() {
    const bar = U.clear(U.$('#sidebar'));

    bar.appendChild(el('div', { class: 'brand' }, [
      el('div', { class: 'brand-mark', text: 'P2' }),
      el('span', { class: 'brand-name', text: 'P2 DESK' }),
    ]));

    const nav = el('div', { class: 'nav' });
    NAV.forEach((item) => {
      nav.appendChild(el('button', {
        class: 'nav-item' + (state.view === item.id ? ' active' : ''),
        onClick: () => go(item.id),
      }, [
        el('span', { class: 'ico' }, [icon(item.icon, 16)]),
        el('span', { style: { flex: '1' }, text: item.label }),
        el('kbd', { text: item.key }),
      ]));
    });
    bar.appendChild(nav);

    bar.appendChild(el('div', { class: 'sidebar-divider' }));

    /* 팀원 — 눌러서 해당 팀원 일정만 보기 */
    const hidden = S.data.settings.hiddenMembers || [];
    const todayKey = U.today();
    const scroll = el('div', { class: 'sidebar-scroll' }, [
      el('div', { class: 'sidebar-label', text: '팀원' }),
    ]);

    S.members().forEach((m) => {
      const visible = !hidden.includes(m.id);
      const count = S.eventsOn(todayKey).filter((ev) => (ev.members || []).includes(m.id)).length;
      scroll.appendChild(el('button', {
        class: 'member-row' + (visible ? '' : ' off'),
        title: visible ? m.name + ' 일정 숨기기' : m.name + ' 일정 보기',
        onClick: () => {
          const next = (S.data.settings.hiddenMembers || []).slice();
          const i = next.indexOf(m.id);
          if (i >= 0) next.splice(i, 1);
          else next.push(m.id);
          S.data.settings.hiddenMembers = next;
          S.save();
          render();
        },
      }, [
        ui.avatar(m.id, 22),
        el('span', { class: 'who', text: m.name }),
        count ? el('span', { class: 'n', text: String(count) }) : null,
      ]));
    });
    bar.appendChild(scroll);

    bar.appendChild(el('div', { class: 'sidebar-foot' }, [
      el('button', {
        class: 'nav-item' + (state.view === 'settings' ? ' active' : ''),
        onClick: () => go('settings'),
      }, [
        el('span', { class: 'ico' }, [icon('settings', 16)]),
        el('span', { style: { flex: '1' }, text: '설정' }),
      ]),
    ]));
  }

  /* ================================================================ */
  /* 상단바                                                            */
  /* ================================================================ */

  function renderTitlebar() {
    const bar = U.clear(U.$('#titlebar'));
    const view = A.views[state.view];

    bar.appendChild(el('h1', { text: view ? view.title : '' }));
    bar.appendChild(el('span', { class: 'today-date', text: U.fmtDate(U.today()) }));
    bar.appendChild(el('div', { class: 'spacer' }));
    bar.appendChild(searchBox());
    bar.appendChild(el('button', {
      class: 'btn btn-primary',
      title: '빠른 추가 (Ctrl+N)',
      onClick: () => A.quickAdd({ date: state.selected, onSaved: render }),
    }, [icon('plus', 14), '추가']));
  }

  function searchBox() {
    const input = el('input', { type: 'search', id: 'search-input', placeholder: '일정 · 할 일 검색', autocomplete: 'off' });
    const results = el('div', { class: 'search-results' });
    results.style.display = 'none';

    const box = el('div', { class: 'search' }, [
      el('span', { class: 'glass' }, [icon('search', 14)]),
      input,
      results,
    ]);

    const runSearch = U.debounce(() => {
      const query = input.value.trim();
      U.clear(results);
      if (!query) { results.style.display = 'none'; return; }

      const { events, tasks } = S.search(query);
      if (!events.length && !tasks.length) {
        results.appendChild(el('div', { class: 'empty', text: '결과가 없습니다.' }));
        results.style.display = 'block';
        return;
      }

      if (events.length) {
        results.appendChild(el('div', { class: 'search-group', text: '일정' }));
        events.slice(0, 12).forEach((ev) => {
          results.appendChild(el('div', {
            class: 'search-hit',
            onClick: () => {
              close();
              A.eventEditor(ev, { date: ev.date, onSaved: render });
            },
          }, [
            el('span', { class: 'dot', style: { background: A.eventColor(ev) } }),
            el('span', { class: 'what', text: ev.title }),
            el('span', { class: 'when', text: U.fmtShort(ev.date) }),
          ]));
        });
      }

      if (tasks.length) {
        results.appendChild(el('div', { class: 'search-group', text: '할 일' }));
        tasks.slice(0, 12).forEach(({ date, task }) => {
          results.appendChild(el('div', {
            class: 'search-hit',
            onClick: () => {
              close();
              state.selected = date;
              go('tasks');
            },
          }, [
            el('span', { class: 'dot', style: { background: task.done ? 'var(--green)' : 'var(--text-3)' } }),
            el('span', { class: 'what', text: task.text }),
            el('span', { class: 'when', text: U.fmtShort(date) }),
          ]));
        });
      }

      results.style.display = 'block';
    }, 140);

    function close() {
      results.style.display = 'none';
      input.value = '';
      input.blur();
    }

    input.addEventListener('input', runSearch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    document.addEventListener('mousedown', (e) => {
      if (!box.contains(e.target)) results.style.display = 'none';
    });

    return box;
  }

  /* ================================================================ */
  /* 단축키                                                            */
  /* ================================================================ */

  function isTyping(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const inModal = Boolean(document.querySelector('.backdrop'));

      /* 조합키는 입력 중에도 동작한다 */
      if (mod && !e.altKey) {
        if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          A.quickAdd({ date: state.selected, mode: e.shiftKey ? 'task' : 'event', onSaved: render });
          return;
        }
        const navItem = NAV.find((item) => item.key === e.key);
        if (navItem && !inModal) { e.preventDefault(); go(navItem.id); return; }
        if (e.key === ',' && !inModal) { e.preventDefault(); go('settings'); return; }
      }

      if (inModal || isTyping(e.target)) return;

      if (e.key === '/') {
        e.preventDefault();
        const input = U.$('#search-input');
        if (input) input.focus();
        return;
      }
      if (e.key.toLowerCase() === 't') {
        state.selected = U.today();
        state.cursor = U.today();
        render();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const delta = e.key === 'ArrowLeft' ? -1 : 1;
        if (state.view === 'calendar') {
          if (state.calMode === 'month') state.cursor = U.addMonths(state.cursor, delta);
          else if (state.calMode === 'week') state.cursor = U.addDays(state.cursor, delta * 7);
          else { state.cursor = U.addDays(state.cursor, delta); state.selected = state.cursor; }
          render();
        } else if (state.view === 'tasks') {
          state.selected = U.addDays(state.selected, delta);
          render();
        }
      }
    });
  }

  /* ================================================================ */
  /* 메뉴 (데스크톱)                                                   */
  /* ================================================================ */

  function bindMenu() {
    const desktop = global.desktop;
    if (!desktop || !desktop.onMenu) return;
    desktop.onMenu('menu:new-event', () => A.quickAdd({ date: state.selected, onSaved: render }));
    desktop.onMenu('menu:new-task', () => A.quickAdd({ date: state.selected, mode: 'task', onSaved: render }));
    desktop.onMenu('menu:view-today', () => go('today'));
    desktop.onMenu('menu:view-calendar', () => go('calendar'));
    desktop.onMenu('menu:view-projects', () => go('projects'));
    desktop.onMenu('menu:view-tasks', () => go('tasks'));
    desktop.onMenu('menu:view-team', () => go('team'));
    desktop.onMenu('menu:view-settings', () => go('settings'));
    desktop.onMenu('menu:export-ics', () => go('settings'));
    desktop.onMenu('menu:import-ics', () => go('settings'));
    desktop.onMenu('menu:export-json', () => go('settings'));
  }

  /* ================================================================ */
  /* 기기 간 동기화                                                    */
  /* ================================================================ */

  function bindSync() {
    const desktop = global.desktop;
    if (!desktop || !desktop.onDataChanged) return;

    // 다른 기기가 파일을 고치면 (클라우드 폴더를 통해) 알려온다
    desktop.onDataChanged(() => S.pullExternalChange());

    A.onDataReloaded = () => {
      render();
      ui.toast('다른 기기의 변경사항을 불러왔습니다.');
    };
    A.onDataMerged = () => {
      render();
      ui.toast('다른 기기에서도 수정이 있어 양쪽을 합쳤습니다.', { duration: 6000 });
    };
  }

  /* ================================================================ */
  /* 시작                                                              */
  /* ================================================================ */

  async function start() {
    contentScroll = U.$('#content-scroll');

    await S.load();
    if (S.saveError) {
      ui.toast('데이터를 읽는 중 문제가 있었습니다: ' + S.saveError, { type: 'error', duration: 8000 });
    }

    state.view = S.data.settings.defaultView || 'today';
    render();
    bindKeys();
    bindMenu();
    bindSync();

    // 자정을 넘기면 '오늘'이 바뀌므로 날짜가 바뀌는 순간 화면을 새로 그린다
    let lastDay = U.today();
    setInterval(() => {
      const now = U.today();
      if (now !== lastDay) {
        lastDay = now;
        S.runDailyMaintenance();
        render();
      } else if (state.view === 'today' || state.view === 'calendar') {
        // 현재 시각 선이 흐르도록 1분마다 살짝 갱신
        const line = document.querySelector('.tg-now');
        if (line) {
          const startHour = S.data.settings.dayStartHour;
          const nowMin = U.toMinutes(U.nowHHMM());
          line.style.top = ((nowMin - startHour * 60) / 60) * 52 + 'px';
        }
      }
    }, 60000);

    // 창을 닫기 전에 아직 저장 안 된 변경이 있으면 밀어넣는다
    global.addEventListener('beforeunload', () => S.flush());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
