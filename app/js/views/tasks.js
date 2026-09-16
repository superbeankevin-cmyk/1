/* MY TASKS — 나만 보는 체크리스트. 팀원에게는 공유되지 않는다. */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;
  const icon = A.icon;

  function render(root, ctx) {
    const state = ctx.state;
    if (!state.selected) state.selected = U.today();
    const dateKey = state.selected;

    /* --- 날짜 이동 --- */
    root.appendChild(
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' } }, [
        el('button', { class: 'btn btn-icon', title: '어제',
          onClick: () => { state.selected = U.addDays(dateKey, -1); ctx.rerender(); } }, [icon('left', 14)]),
        el('button', { class: 'btn btn-sm', text: '오늘',
          onClick: () => { state.selected = U.today(); ctx.rerender(); } }),
        el('button', { class: 'btn btn-icon', title: '내일',
          onClick: () => { state.selected = U.addDays(dateKey, 1); ctx.rerender(); } }, [icon('right', 14)]),
        el('span', { style: { fontSize: '16px', fontWeight: '650' }, text: U.fmtDate(dateKey, { year: false }) }),
        el('span', { class: 'faint', text: U.fmtRelative(dateKey) }),
        el('div', { style: { flex: '1' } }),
        el('button', {
          class: 'btn btn-sm',
          title: '최근 2주간 못 끝낸 일을 이 날짜로 모읍니다',
          text: '지난 미완료 가져오기',
          onClick: () => {
            const moved = S.carryOverInto(dateKey);
            ctx.rerender();
            ui.toast(moved ? moved + '건을 가져왔습니다.' : '가져올 미완료 항목이 없습니다.');
          },
        }),
        el('button', {
          class: 'btn btn-primary',
          onClick: () => A.quickAdd({ date: dateKey, mode: 'task', onSaved: ctx.rerender }),
        }, [icon('plus', 13), '할 일']),
      ])
    );

    const split = el('div', { class: 'split' });
    root.appendChild(split);

    /* --- 왼쪽: 그날 할 일 + 그날 일정 --- */
    const left = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    split.appendChild(left);

    const progress = ui.taskProgress(dateKey);
    const bar = el('span', { style: { width: progress.pct + '%' } });
    const label = el('span', { class: 'sub', text: progress.done + ' / ' + progress.total + ' 완료' });

    const card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', { text: 'My Checklist' }), label]),
      el('div', { class: 'bar', style: { marginBottom: '11px' } }, [bar]),
    ]);
    card.appendChild(ui.taskList(dateKey, {
      onChanged: () => {
        const p = ui.taskProgress(dateKey);
        bar.style.width = p.pct + '%';
        label.textContent = p.done + ' / ' + p.total + ' 완료';
      },
    }));
    left.appendChild(card);

    const events = S.eventsOn(dateKey);
    if (events.length) {
      const evCard = el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [
          el('h2', { text: '이 날 일정' }),
          el('span', { class: 'sub', text: events.length + '개' }),
        ]),
      ]);
      const list = el('div', { class: 'ev-list' });
      events.forEach((ev) => list.appendChild(ui.eventRow(ev, dateKey, ctx.rerender)));
      evCard.appendChild(list);
      left.appendChild(evCard);
    }

    /* --- 오른쪽: 루틴 + 최근 기록 --- */
    const rail = el('div', { class: 'rail' });
    split.appendChild(rail);
    rail.appendChild(routineCard(ctx, dateKey));
    rail.appendChild(historyCard(dateKey, ctx));
  }

  /* ------------------------------------------------------------------ */
  /* 요일 루틴 — 해당 요일이 되면 체크리스트에 자동으로 깔린다            */
  /* ------------------------------------------------------------------ */

  function routineCard(ctx, dateKey) {
    const card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '요일 루틴' }),
        el('button', {
          class: 'btn btn-sm btn-quiet',
          text: '이 날에 깔기',
          title: '이 날짜 요일에 해당하는 루틴을 체크리스트에 채웁니다',
          onClick: () => {
            const added = S.materializeRoutines(dateKey);
            S.save();
            ctx.rerender();
            ui.toast(added ? added + '개를 추가했습니다.' : '추가할 루틴이 없습니다.');
          },
        }),
      ]),
    ]);

    if (!S.data.routines.length) {
      card.appendChild(el('div', {
        class: 'empty',
        text: '예) 월요일 – 주간 제작 현황 정리\n금요일 – 다음 주 촬영 준비 확인',
        style: { whiteSpace: 'pre-line' },
      }));
    } else {
      const rows = el('div', { class: 'rows' });
      S.data.routines.forEach((routine) => {
        const dayRow = el('div', { style: { display: 'flex', gap: '3px' } });
        for (let d = 0; d < 7; d++) {
          const on = routine.days.includes(d);
          dayRow.appendChild(el('button', {
            class: 'filter-chip' + (on ? ' on' : ''),
            style: { padding: '1px 7px', fontSize: '11px' },
            text: U.WEEKDAYS[d],
            onClick: () => {
              const days = routine.days.slice();
              const i = days.indexOf(d);
              if (i >= 0) days.splice(i, 1); else days.push(d);
              days.sort();
              S.updateRoutine(routine.id, { days });
              ctx.rerender();
            },
          }));
        }

        rows.appendChild(el('div', {
          class: 'row',
          style: { alignItems: 'flex-start', flexWrap: 'wrap', gap: '7px' },
        }, [
          el('div', { style: { flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '6px' } }, [
            el('span', {
              text: routine.text,
              style: routine.active === false
                ? { opacity: '.45', textDecoration: 'line-through' }
                : {},
            }),
            dayRow,
          ]),
          el('button', {
            class: 'btn btn-sm btn-quiet',
            text: routine.active === false ? '켜기' : '끄기',
            onClick: () => { S.updateRoutine(routine.id, { active: routine.active === false }); ctx.rerender(); },
          }),
          el('button', {
            class: 'btn btn-sm btn-danger',
            text: '삭제',
            onClick: async () => {
              const ok = await ui.confirm('“' + routine.text + '” 루틴을 삭제할까요?', {
                danger: true, confirmLabel: '삭제',
              });
              if (!ok) return;
              S.removeRoutine(routine.id);
              ctx.rerender();
            },
          }),
        ]));
      });
      card.appendChild(rows);
    }

    const input = el('input', { type: 'text', placeholder: '새 루틴 (기본: 평일)' });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (!input.value.trim()) return;
      S.addRoutine(input.value.trim(), [1, 2, 3, 4, 5]);
      ctx.rerender();
    });
    card.appendChild(el('div', { class: 'task-add' }, [icon('plus', 13), input]));

    return card;
  }

  /* ------------------------------------------------------------------ */

  function historyCard(dateKey, ctx) {
    const card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '최근 2주' }),
        el('span', { class: 'sub', text: '눌러서 이동' }),
      ]),
    ]);

    const rows = el('div', { class: 'rows' });
    for (let i = 0; i < 14; i++) {
      const key = U.addDays(U.today(), -i);
      const tasks = S.tasksFor(key);
      if (!tasks.length) continue;
      const done = tasks.filter((t) => t.done).length;
      const pct = Math.round((done / tasks.length) * 100);

      rows.appendChild(el('div', {
        class: 'row',
        style: {
          cursor: 'pointer',
          background: key === dateKey ? 'var(--hover)' : '',
          borderRadius: key === dateKey ? '6px' : '',
        },
        onClick: () => { ctx.state.selected = key; ctx.rerender(); },
      }, [
        el('span', {
          class: 'faint mono', style: { minWidth: '74px' },
          text: U.fmtShort(key) + ' ' + U.WEEKDAYS[U.dayOfWeek(key)],
        }),
        el('div', { class: 'grow' }, [
          el('div', { class: 'bar' }, [
            el('span', {
              style: { width: pct + '%', background: pct === 100 ? 'var(--green)' : 'var(--accent)' },
            }),
          ]),
        ]),
        el('span', { class: 'faint mono', style: { minWidth: '44px', textAlign: 'right' },
          text: done + '/' + tasks.length }),
      ]));
    }

    card.appendChild(rows.childElementCount ? rows : el('div', { class: 'empty', text: '아직 기록이 없습니다.' }));
    return card;
  }

  A.views = A.views || {};
  A.views.tasks = { title: 'My Tasks', render };
})(window);
