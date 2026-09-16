/* 화면 곳곳에서 재사용하는 조각들 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const el = U.el;
  const icon = A.icon;

  /* ================================================================ 토스트 */

  function toast(message, opts) {
    const o = opts || {};
    const node = el('div', { class: 'toast' + (o.type === 'error' ? ' error' : '') }, [
      el('span', { text: message }),
      o.actionLabel
        ? el('button', {
            text: o.actionLabel,
            onClick: () => { node.remove(); if (o.onAction) o.onAction(); },
          })
        : null,
    ]);
    U.$('#toasts').appendChild(node);
    setTimeout(() => node.remove(), o.duration || 4200);
    return node;
  }

  /* ================================================================== 모달 */

  function modal(config) {
    const backdrop = el('div', { class: 'backdrop' });
    const box = el('div', { class: 'modal' + (config.wide ? ' wide' : '') });
    let onClosed = null;

    const close = () => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      if (onClosed) onClosed();
    };

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }

    if (config.title) {
      box.appendChild(
        el('div', { class: 'modal-head' }, [
          el('h2', { text: config.title }),
          config.headRight || null,
        ])
      );
    }

    const body = el('div', { class: 'modal-body' });
    box.appendChild(body);
    if (config.body) body.appendChild(config.body);

    if (config.footer) {
      const foot = el('div', { class: 'modal-foot' });
      box.appendChild(foot);
      config.footer(foot, close);
    }

    backdrop.appendChild(box);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey, true);
    U.$('#modal-root').appendChild(backdrop);

    // 모달 안에서 Cmd/Ctrl+Enter 는 곧 '확인'
    box.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const primary = box.querySelector('.modal-foot .btn-primary');
        if (primary) { e.preventDefault(); primary.click(); }
      }
    });

    if (config.onOpen) config.onOpen(body, close);
    close.onClosed = (fn) => { onClosed = fn; };
    return close;
  }

  function confirm(message, opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      let answered = false;
      const settle = (v) => { if (!answered) { answered = true; resolve(v); } };

      const close = modal({
        title: o.title || '확인',
        body: el('p', { text: message, style: { margin: '0', lineHeight: '1.6' } }),
        footer(foot, closeModal) {
          foot.appendChild(el('button', {
            class: 'btn', text: '취소',
            onClick: () => { settle(false); closeModal(); },
          }));
          foot.appendChild(el('button', {
            class: 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary'),
            text: o.confirmLabel || '확인',
            onClick: () => { settle(true); closeModal(); },
          }));
        },
      });
      // ESC 나 바깥 클릭으로 닫히면 취소로 본다
      close.onClosed(() => settle(false));
    });
  }

  /* ================================================================ 작은 것 */

  function avatar(memberId, size) {
    const m = S.member(memberId);
    const node = el('span', {
      class: 'avatar',
      title: m ? m.name : '미지정',
      text: m ? m.short : '?',
      style: { background: m ? m.color : '#c7c7cc' },
    });
    if (size) {
      node.style.width = size + 'px';
      node.style.height = size + 'px';
      node.style.fontSize = Math.round(size * 0.42) + 'px';
    }
    return node;
  }

  function avatarStack(ids, size) {
    if (!ids || !ids.length) return null;
    return el('span', { class: 'avatar-stack' }, ids.slice(0, 3).map((id) => avatar(id, size)));
  }

  function tag(label, color) {
    return el('span', {
      class: 'tag',
      text: label,
      style: { color, background: color + '1f' },
    });
  }

  function statusTag(statusId) {
    const st = A.status(statusId);
    return tag(st.label, st.color);
  }

  /** 일정 한 줄. 색은 왼쪽 3px 바에만 들어간다. */
  function eventRow(ev, dateKey, onChanged) {
    const color = A.eventColor(ev);
    const project = S.project(ev.projectId);
    const who = (ev.members || []).map((id) => S.member(id)).filter(Boolean);

    const subParts = [];
    if (project) subParts.push(project.name);
    if (who.length) subParts.push(who.map((m) => m.short).join(', '));
    if (ev.place) subParts.push(ev.place);

    return el('div', {
      class: 'ev' + (ev.done ? ' done' : ''),
      style: { borderLeftColor: color },
      onClick: () => A.eventEditor(ev, { date: dateKey, onSaved: onChanged }),
    }, [
      el('span', { class: 'ev-time', text: U.fmtTimeRange(ev) }),
      el('div', { class: 'ev-body' }, [
        el('span', { class: 'ev-title', text: ev.title }),
        subParts.length ? el('span', { class: 'ev-sub', text: subParts.join(' · ') }) : null,
      ]),
      el('div', { class: 'ev-right' }, [
        ev.deadline ? tag('마감', A.ACCENT_DEADLINE) : null,
        ev.status && ev.status !== 'plan' ? statusTag(ev.status) : null,
        avatarStack(ev.members, 22),
      ]),
    ]);
  }

  /** 월간 격자 / 종일 줄에 들어가는 한 줄짜리 */
  function eventChip(ev, className) {
    const color = A.eventColor(ev);
    return el('div', {
      class: (className || 'month-chip') + (ev.done ? ' done' : ''),
      style: { borderLeftColor: color, background: color + '14' },
      title: (ev.allDay ? '' : U.fmtTimeRange(ev) + '  ') + ev.title,
      text: (ev.allDay || !ev.start ? '' : ev.start + ' ') + ev.title,
    });
  }

  /* ============================================================ 체크리스트 */

  /** 하루치 체크리스트 위젯 — 어느 화면에 놓아도 동작한다 */
  function taskList(dateKey, opts) {
    const o = opts || {};
    const wrap = el('div');

    function render() {
      U.clear(wrap);
      const tasks = S.tasksFor(dateKey);

      if (!tasks.length) {
        wrap.appendChild(el('div', { class: 'empty', text: o.emptyText || '오늘 챙길 일을 적어두세요.' }));
      } else {
        const list = el('div');
        tasks.forEach((t, i) => list.appendChild(taskRow(t, i, tasks.length)));
        wrap.appendChild(list);
      }

      if (o.allowAdd !== false) wrap.appendChild(addBox());
      if (o.onChanged) o.onChanged();
    }

    function taskRow(task, index, total) {
      const text = el('textarea', { class: 'task-text', rows: 1 });
      text.value = task.text;

      const autosize = () => {
        text.style.height = 'auto';
        text.style.height = text.scrollHeight + 'px';
      };
      requestAnimationFrame(autosize);
      text.addEventListener('input', autosize);
      text.addEventListener('blur', () => {
        const next = text.value.trim();
        if (!next) { S.removeTask(dateKey, task.id); render(); }
        else if (next !== task.text) S.updateTask(dateKey, task.id, { text: next });
      });
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); text.blur(); }
      });

      const check = el('button', { class: 'task-check', title: '완료' }, [icon('check', 11)]);
      check.addEventListener('click', () => {
        S.updateTask(dateKey, task.id, { done: !task.done });
        render();
      });

      return el('div', { class: 'task' + (task.done ? ' done' : '') }, [
        check,
        text,
        task.routineId ? el('span', { class: 'task-flag routine', text: '루틴' }) : null,
        task.carriedFrom
          ? el('span', {
              class: 'task-flag carried',
              text: U.fmtShort(task.carriedFrom),
              title: task.carriedFrom + ' 에서 넘어온 일',
            })
          : null,
        el('div', { class: 'task-tools' }, [
          index > 0 ? el('button', { text: '↑', title: '위로', onClick: () => { S.reorderTask(dateKey, task.id, -1); render(); } }) : null,
          index < total - 1 ? el('button', { text: '↓', title: '아래로', onClick: () => { S.reorderTask(dateKey, task.id, 1); render(); } }) : null,
          el('button', {
            text: '→', title: '내일로 미루기',
            onClick: () => {
              S.moveTask(dateKey, task.id, U.addDays(dateKey, 1));
              render();
              toast('내일로 넘겼습니다.', {
                actionLabel: '되돌리기',
                onAction: () => { S.moveTask(U.addDays(dateKey, 1), task.id, dateKey); render(); },
              });
            },
          }),
          el('button', {
            text: '✕', title: '삭제',
            onClick: () => {
              const snapshot = Object.assign({}, task);
              S.removeTask(dateKey, task.id);
              render();
              toast('삭제했습니다.', {
                actionLabel: '되돌리기',
                onAction: () => {
                  S.tasksFor(dateKey).splice(index, 0, snapshot);
                  S.save(); render();
                },
              });
            },
          }),
        ]),
      ]);
    }

    function addBox() {
      const input = el('input', { type: 'text', placeholder: o.addPlaceholder || '할 일 추가' });
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const value = input.value.trim();
        if (!value) return;
        S.addTask(dateKey, value);
        render();
        const next = wrap.querySelector('.task-add input');
        if (next) next.focus();   // 연속 입력
      });
      return el('div', { class: 'task-add' }, [icon('plus', 13), input]);
    }

    wrap.focusAdd = () => {
      const input = wrap.querySelector('.task-add input');
      if (input) input.focus();
    };
    wrap.rerender = render;
    render();
    return wrap;
  }

  function taskProgress(dateKey) {
    const tasks = S.tasksFor(dateKey);
    const done = tasks.filter((t) => t.done).length;
    return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  }

  /* ============================================================ 미니 캘린더 */

  function miniCalendar(opts) {
    const o = opts || {};
    const wrap = el('div', { class: 'mini' });
    let cursor = o.selected || U.today();

    function render() {
      U.clear(wrap);
      const weekStart = S.data.settings.weekStart;
      const d = U.fromKey(cursor);
      const firstOfMonth = U.toKey(new Date(d.getFullYear(), d.getMonth(), 1));
      const gridStart = U.startOfWeek(firstOfMonth, weekStart);
      const todayKey = U.today();

      wrap.appendChild(
        el('div', { class: 'mini-head' }, [
          el('span', { class: 'label', text: d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월' }),
          el('div', { style: { display: 'flex', gap: '2px' } }, [
            el('button', { class: 'btn btn-quiet btn-icon', title: '이전 달',
              onClick: () => { cursor = U.addMonths(cursor, -1); render(); } }, [icon('left', 13)]),
            el('button', { class: 'btn btn-quiet btn-icon', title: '다음 달',
              onClick: () => { cursor = U.addMonths(cursor, 1); render(); } }, [icon('right', 13)]),
          ]),
        ])
      );

      const grid = el('div', { class: 'mini-grid' });
      for (let i = 0; i < 7; i++) {
        grid.appendChild(el('div', { class: 'mini-w', text: U.WEEKDAYS[(weekStart + i) % 7] }));
      }
      for (let i = 0; i < 42; i++) {
        const key = U.addDays(gridStart, i);
        const cellDate = U.fromKey(key);
        if (i >= 35 && cellDate.getMonth() !== d.getMonth()) break;
        const outside = cellDate.getMonth() !== d.getMonth();
        const hasEvents = S.eventsOn(key).length > 0;

        grid.appendChild(
          el('button', {
            class: 'mini-d'
              + (outside ? ' outside' : '')
              + (key === todayKey ? ' today' : '')
              + (key === o.getSelected() ? ' selected' : ''),
            onClick: () => { if (o.onPick) o.onPick(key); },
          }, [
            el('span', { text: String(cellDate.getDate()) }),
            hasEvents && !outside ? el('span', { class: 'has' }) : null,
          ])
        );
      }
      wrap.appendChild(grid);
    }

    wrap.rerender = (nextCursor) => {
      if (nextCursor) cursor = nextCursor;
      render();
    };
    render();
    return wrap;
  }

  A.ui = {
    toast, modal, confirm,
    avatar, avatarStack, tag, statusTag,
    eventRow, eventChip,
    taskList, taskProgress,
    miniCalendar,
  };
})(window);
