/* CALENDAR — 월 / 주 / 일 보기와 팀원 필터 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;
  const icon = A.icon;

  const MAX_CHIPS = 3;

  function render(root, ctx) {
    const state = ctx.state;
    if (!state.selected) state.selected = U.today();
    if (!state.calMode) state.calMode = 'month';
    if (!state.cursor) state.cursor = state.selected;

    ctx.fullHeight();

    const mode = state.calMode;
    const weekStart = S.data.settings.weekStart;

    const step = (delta) => {
      if (mode === 'month') state.cursor = U.addMonths(state.cursor, delta);
      else if (mode === 'week') state.cursor = U.addDays(state.cursor, delta * 7);
      else { state.cursor = U.addDays(state.cursor, delta); state.selected = state.cursor; }
      ctx.rerender();
    };

    root.appendChild(toolbar(state, ctx, step));
    root.appendChild(filterBar(ctx));

    const grid = el('div', { style: { flex: '1', minHeight: '0', marginTop: '12px' } });
    root.appendChild(grid);

    if (mode === 'month') {
      // 월간은 한 달이 한눈에 보이는 대신 시간 감각이 약하니, 선택한 날 상세를 옆에 붙인다
      const split = el('div', { class: 'split', style: { height: '100%' } });
      const scroller = el('div', { style: { overflowY: 'auto', minHeight: '0' } });
      scroller.appendChild(monthGrid(state, ctx));
      split.appendChild(scroller);
      split.appendChild(dayRail(state.selected, ctx));
      grid.appendChild(split);
      grid.style.display = 'flex';
      grid.style.flexDirection = 'column';
    } else {
      const days = [];
      if (mode === 'week') {
        const from = U.startOfWeek(state.cursor, weekStart);
        for (let i = 0; i < 7; i++) days.push(U.addDays(from, i));
      } else {
        days.push(state.cursor);
      }
      grid.appendChild(
        A.timeGrid({
          days,
          getSelected: () => state.selected,
          onPickDate: (key) => { state.selected = key; ctx.rerender(); },
          onChanged: ctx.rerender,
        })
      );
      grid.style.display = 'flex';
      grid.style.flexDirection = 'column';
    }
  }

  /* ------------------------------------------------------------------ */

  function toolbar(state, ctx, step) {
    const mode = state.calMode;
    const d = U.fromKey(state.cursor);
    const weekStart = S.data.settings.weekStart;

    let label;
    if (mode === 'month') label = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월';
    else if (mode === 'week') {
      const from = U.startOfWeek(state.cursor, weekStart);
      label = U.fmtShort(from) + ' – ' + U.fmtShort(U.addDays(from, 6));
    } else label = U.fmtDate(state.cursor);

    const seg = el('div', { class: 'seg' });
    [['month', '월'], ['week', '주'], ['day', '일']].forEach(([id, text]) => {
      seg.appendChild(el('button', {
        class: mode === id ? 'active' : '',
        text,
        onClick: () => { state.calMode = id; ctx.rerender(); },
      }));
    });

    return el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' } }, [
      el('button', { class: 'btn btn-icon', title: '이전', onClick: () => step(-1) }, [icon('left', 14)]),
      el('button', {
        class: 'btn btn-sm', text: '오늘',
        onClick: () => { state.cursor = U.today(); state.selected = U.today(); ctx.rerender(); },
      }),
      el('button', { class: 'btn btn-icon', title: '다음', onClick: () => step(1) }, [icon('right', 14)]),
      el('span', { style: { fontSize: '16px', fontWeight: '650', letterSpacing: '-0.02em' }, text: label }),
      el('div', { style: { flex: '1' } }),
      seg,
      el('button', {
        class: 'btn btn-primary',
        onClick: () => A.quickAdd({ date: state.selected, onSaved: ctx.rerender }),
      }, [icon('plus', 13), '새 일정']),
    ]);
  }

  /** 팀원 필터 — 누구 일정만 볼지 고른다 */
  function filterBar(ctx) {
    const hidden = S.data.settings.hiddenMembers || [];
    const row = el('div', { class: 'filter-chips' });

    row.appendChild(el('button', {
      class: 'filter-chip' + (hidden.length === 0 ? ' on' : ''),
      text: '전체',
      onClick: () => { S.data.settings.hiddenMembers = []; S.save(); ctx.rerender(); },
    }));

    S.members().forEach((m) => {
      const on = !hidden.includes(m.id);
      row.appendChild(el('button', {
        class: 'filter-chip' + (on ? ' on' : ''),
        style: on ? { borderColor: m.color, background: m.color + '14' } : {},
        onClick: () => {
          const next = (S.data.settings.hiddenMembers || []).slice();
          const i = next.indexOf(m.id);
          if (i >= 0) next.splice(i, 1);
          else next.push(m.id);
          S.data.settings.hiddenMembers = next;
          S.save();
          ctx.rerender();
        },
      }, [el('span', { class: 'dot', style: { background: m.color } }), m.name]));
    });

    return row;
  }

  /* ------------------------------------------------------------------ */

  function monthGrid(state, ctx) {
    const weekStart = S.data.settings.weekStart;
    const cursor = U.fromKey(state.cursor);
    const firstOfMonth = U.toKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    const gridStart = U.startOfWeek(firstOfMonth, weekStart);
    const monthIndex = cursor.getMonth();
    const todayKey = U.today();

    const wrap = el('div', { class: 'month' });

    const head = el('div', { class: 'month-head' });
    for (let i = 0; i < 7; i++) {
      const dow = (weekStart + i) % 7;
      head.appendChild(el('div', {
        class: dow === 0 ? 'sun' : dow === 6 ? 'sat' : '',
        text: U.WEEKDAYS[dow],
      }));
    }
    wrap.appendChild(head);

    const grid = el('div', { class: 'month-grid' });
    for (let i = 0; i < 42; i++) {
      const key = U.addDays(gridStart, i);
      const date = U.fromKey(key);
      if (i >= 35 && date.getMonth() !== monthIndex) break;

      const dow = date.getDay();
      const outside = date.getMonth() !== monthIndex;
      const events = S.eventsOn(key);
      const openTasks = S.tasksFor(key).filter((t) => !t.done).length;

      const cell = el('div', {
        class: 'month-cell'
          + (outside ? ' outside' : '')
          + (key === todayKey ? ' today' : '')
          + (key === state.selected ? ' selected' : '')
          + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''),
        onClick: () => { state.selected = key; ctx.rerender(); },
        onDblclick: () => A.quickAdd({ date: key, onSaved: ctx.rerender }),
      }, [
        el('div', { class: 'month-daterow' }, [
          el('span', { class: 'month-num', text: String(date.getDate()) }),
          openTasks ? el('span', { class: 'month-task', text: '☑ ' + openTasks }) : null,
        ]),
      ]);

      events.slice(0, MAX_CHIPS).forEach((ev) => cell.appendChild(ui.eventChip(ev)));
      if (events.length > MAX_CHIPS) {
        cell.appendChild(el('div', { class: 'month-more', text: '+' + (events.length - MAX_CHIPS) }));
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  /* ------------------------------------------------------------------ */

  function dayRail(dateKey, ctx) {
    const wrap = el('div', { class: 'rail' });
    const events = S.eventsOn(dateKey);

    const card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '선택한 날' }),
        el('span', { class: 'sub', text: U.fmtRelative(dateKey) }),
      ]),
      el('div', {
        style: { fontSize: '15px', fontWeight: '650', marginBottom: '11px' },
        text: U.fmtDate(dateKey, { year: false }),
      }),
    ]);

    if (!events.length) {
      card.appendChild(el('div', { class: 'empty', text: '이 날은 비어 있습니다.' }));
    } else {
      const list = el('div', { class: 'ev-list' });
      events.forEach((ev) => list.appendChild(ui.eventRow(ev, dateKey, ctx.rerender)));
      card.appendChild(list);
    }
    card.appendChild(el('button', {
      class: 'btn btn-block',
      style: { marginTop: '9px' },
      onClick: () => A.quickAdd({ date: dateKey, onSaved: ctx.rerender }),
    }, [icon('plus', 13), '일정 추가']));
    wrap.appendChild(card);

    /* 그날 체크리스트 */
    const progress = ui.taskProgress(dateKey);
    const label = el('span', { class: 'sub', text: progress.done + ' / ' + progress.total });
    const taskCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', { text: '체크리스트' }), label]),
    ]);
    taskCard.appendChild(ui.taskList(dateKey, {
      emptyText: '이 날 챙길 일을 적어두세요.',
      onChanged: () => {
        const p = ui.taskProgress(dateKey);
        label.textContent = p.done + ' / ' + p.total;
      },
    }));
    wrap.appendChild(taskCard);

    /* 메모 */
    const note = el('textarea', {
      placeholder: '이 날의 메모',
      style: {
        width: '100%', minHeight: '68px', resize: 'vertical',
        border: '1px solid var(--line-2)', borderRadius: 'var(--radius-sm)',
        padding: '8px 10px', outline: 'none', fontSize: '13px', lineHeight: '1.55',
      },
    });
    note.value = S.note(dateKey);
    note.addEventListener('blur', () => S.setNote(dateKey, note.value));
    wrap.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', { text: '메모' })]),
      note,
    ]));

    return wrap;
  }

  A.views = A.views || {};
  A.views.calendar = { title: 'Calendar', render };
})(window);
