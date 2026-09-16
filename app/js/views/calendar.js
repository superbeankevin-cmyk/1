/* 캘린더 — 월/주 보기 + 오른쪽 하루 상세 패널 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;

  const MAX_CHIPS = 3;

  function render(root, ctx) {
    const state = ctx.state;
    if (!state.cursor) state.cursor = U.today();
    if (!state.selected) state.selected = U.today();
    if (!state.calMode) state.calMode = 'month';

    const cursorDate = U.fromKey(state.cursor);
    ctx.setSubtitle(
      state.calMode === 'month'
        ? cursorDate.getFullYear() + '년 ' + (cursorDate.getMonth() + 1) + '월'
        : U.fmtShort(U.startOfWeek(state.cursor, S.data.settings.weekStart)) +
          ' – ' +
          U.fmtShort(U.addDays(U.startOfWeek(state.cursor, S.data.settings.weekStart), 6))
    );

    const step = (delta) => {
      state.cursor =
        state.calMode === 'month'
          ? U.addMonths(state.cursor, delta)
          : U.addDays(state.cursor, delta * 7);
      ctx.rerender();
    };

    ctx.setActions([
      el('button', {
        class: 'btn btn-primary',
        text: '＋ 새 일정',
        onClick: () => ui.eventEditor(null, { date: state.selected, onSaved: ctx.rerender }),
      }),
    ]);

    /* --- 툴바 --- */
    const toolbar = el('div', { class: 'cal-toolbar' }, [
      el('button', { class: 'btn btn-sm', text: '‹', title: '이전', onClick: () => step(-1) }),
      el('button', {
        class: 'btn btn-sm',
        text: '오늘',
        onClick: () => {
          state.cursor = U.today();
          state.selected = U.today();
          ctx.rerender();
        },
      }),
      el('button', { class: 'btn btn-sm', text: '›', title: '다음', onClick: () => step(1) }),
      el('span', {
        class: 'cal-month-label',
        text:
          state.calMode === 'month'
            ? cursorDate.getFullYear() + '. ' + (cursorDate.getMonth() + 1)
            : U.fmtDate(U.startOfWeek(state.cursor, S.data.settings.weekStart), { weekday: false }) + ' 주',
      }),
      el('div', { class: 'spacer' }),
      el('div', { class: 'seg' }, [
        el('button', {
          class: state.calMode === 'month' ? 'active' : '',
          text: '월',
          onClick: () => { state.calMode = 'month'; ctx.rerender(); },
        }),
        el('button', {
          class: state.calMode === 'week' ? 'active' : '',
          text: '주',
          onClick: () => { state.calMode = 'week'; ctx.rerender(); },
        }),
      ]),
    ]);
    root.appendChild(toolbar);

    /* --- 본문 --- */
    const layout = el('div', { class: 'grid grid-2' });
    root.appendChild(layout);

    const calWrap = el('div');
    layout.appendChild(calWrap);
    calWrap.appendChild(state.calMode === 'month' ? monthGrid(state, ctx) : weekList(state, ctx));

    const panel = el('div', { class: 'card day-panel' });
    layout.appendChild(panel);
    renderDayPanel(panel, state.selected, ctx);
  }

  /* ------------------------------------------------------------------ */
  /* 월 보기                                                             */
  /* ------------------------------------------------------------------ */

  function monthGrid(state, ctx) {
    const weekStart = S.data.settings.weekStart;
    const cursor = U.fromKey(state.cursor);
    const firstOfMonth = U.toKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    const gridStart = U.startOfWeek(firstOfMonth, weekStart);
    const monthIndex = cursor.getMonth();
    const todayKey = U.today();

    const grid = el('div', { class: 'cal-grid' });

    for (let i = 0; i < 7; i++) {
      const dow = (weekStart + i) % 7;
      grid.appendChild(
        el('div', {
          class: 'cal-head' + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''),
          text: U.WEEKDAYS[dow],
        })
      );
    }

    // 6주치를 그리되, 마지막 줄이 통째로 다음 달이면 생략
    const totalCells = 42;
    for (let i = 0; i < totalCells; i++) {
      const key = U.addDays(gridStart, i);
      if (i >= 35 && U.fromKey(key).getMonth() !== monthIndex) break;

      const date = U.fromKey(key);
      const dow = date.getDay();
      const outside = date.getMonth() !== monthIndex;
      const events = S.eventsOn(key);
      const tasks = S.tasksFor(key);
      const openTasks = tasks.filter((t) => !t.done).length;

      const cell = el('div', {
        class:
          'cal-cell' +
          (outside ? ' outside' : '') +
          (key === todayKey ? ' today' : '') +
          (key === state.selected ? ' selected' : '') +
          (dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''),
        onClick: () => {
          state.selected = key;
          ctx.rerender();
        },
        onDblclick: () => ui.eventEditor(null, { date: key, onSaved: ctx.rerender }),
      });

      cell.appendChild(
        el('div', { class: 'cal-date' }, [
          el('span', { class: 'num', text: String(date.getDate()) }),
          openTasks
            ? el('span', { class: 'cal-task-dot', title: '할 일 ' + openTasks + '개', text: '☑' + openTasks })
            : null,
        ])
      );

      events.slice(0, MAX_CHIPS).forEach((ev) => cell.appendChild(ui.eventChip(ev)));
      if (events.length > MAX_CHIPS) {
        cell.appendChild(el('div', { class: 'cal-more', text: '+' + (events.length - MAX_CHIPS) + '개 더' }));
      }

      grid.appendChild(cell);
    }

    return grid;
  }

  /* ------------------------------------------------------------------ */
  /* 주 보기                                                             */
  /* ------------------------------------------------------------------ */

  function weekList(state, ctx) {
    const weekStart = S.data.settings.weekStart;
    const start = U.startOfWeek(state.cursor, weekStart);
    const todayKey = U.today();
    const wrap = el('div', { class: 'week-grid' });

    for (let i = 0; i < 7; i++) {
      const key = U.addDays(start, i);
      const date = U.fromKey(key);
      const events = S.eventsOn(key);
      const tasks = S.tasksFor(key);
      const openTasks = tasks.filter((t) => !t.done).length;

      const body = el('div');
      if (!events.length) {
        body.appendChild(el('div', { class: 'faint', style: { padding: '6px 2px' }, text: '일정 없음' }));
      } else {
        const list = el('div', { class: 'event-list' });
        events.forEach((ev) => list.appendChild(ui.eventRow(ev, key, ctx.rerender)));
        body.appendChild(list);
      }

      wrap.appendChild(
        el('div', {
          class: 'week-day' + (key === todayKey ? ' today' : ''),
          onClick: (e) => {
            if (e.target.closest('.event-row')) return;
            state.selected = key;
            ctx.rerender();
          },
        }, [
          el('div', { class: 'week-day-label' }, [
            el('span', { class: 'd', text: (date.getMonth() + 1) + '/' + date.getDate() }),
            el('span', { class: 'w', text: U.WEEKDAYS[date.getDay()] + '요일' }),
            openTasks ? el('span', { class: 'faint', text: '할 일 ' + openTasks + '개' }) : null,
          ]),
          body,
        ])
      );
    }

    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* 하루 상세 패널                                                       */
  /* ------------------------------------------------------------------ */

  function renderDayPanel(panel, dateKey, ctx) {
    U.clear(panel);

    panel.appendChild(
      el('div', { class: 'day-panel-head' }, [
        el('h2', { text: U.fmtDate(dateKey) }),
        el('span', { class: 'rel', text: U.fmtRelative(dateKey) }),
      ])
    );

    /* 일정 */
    const events = S.eventsOn(dateKey);
    const eventsBlock = el('div');
    eventsBlock.appendChild(
      el('div', { class: 'card-head' }, [
        el('h2', { text: '일정 ' + (events.length ? events.length + '개' : '') }),
        el('button', {
          class: 'btn btn-sm',
          text: '＋ 추가',
          onClick: () => ui.eventEditor(null, { date: dateKey, onSaved: ctx.rerender }),
        }),
      ])
    );
    if (!events.length) {
      eventsBlock.appendChild(el('div', { class: 'empty', text: '이 날은 비어 있습니다.' }));
    } else {
      const list = el('div', { class: 'event-list' });
      events.forEach((ev) => list.appendChild(ui.eventRow(ev, dateKey, ctx.rerender)));
      eventsBlock.appendChild(list);
    }
    panel.appendChild(eventsBlock);

    /* 체크리스트 */
    const tasksBlock = el('div');
    const progress = ui.taskProgress(dateKey);
    const label = el('span', { class: 'hint', text: progress.done + '/' + progress.total });
    tasksBlock.appendChild(
      el('div', { class: 'card-head' }, [el('h2', { text: '이 날 체크리스트' }), label])
    );
    tasksBlock.appendChild(
      ui.taskList(dateKey, {
        emptyText: '이 날 챙길 일을 적어두세요.',
        onChanged: () => {
          const p = ui.taskProgress(dateKey);
          label.textContent = p.done + '/' + p.total;
        },
      })
    );
    panel.appendChild(tasksBlock);

    /* 메모 */
    const note = el('textarea', { class: 'note-area', placeholder: '이 날의 메모' });
    note.value = S.note(dateKey);
    note.addEventListener('blur', () => S.setNote(dateKey, note.value));
    panel.appendChild(
      el('div', {}, [el('div', { class: 'card-head' }, [el('h2', { text: '메모' })]), note])
    );
  }

  A.views = A.views || {};
  A.views.calendar = { title: '캘린더', render };
})(window);
