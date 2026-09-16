/* 체크리스트 화면 — 하루 할 일 + 요일 루틴 + 최근 기록 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;

  function render(root, ctx) {
    const state = ctx.state;
    if (!state.selected) state.selected = U.today();
    const dateKey = state.selected;

    ctx.setSubtitle(U.fmtDate(dateKey) + ' · ' + U.fmtRelative(dateKey));
    ctx.setActions([
      el('button', {
        class: 'btn',
        text: '지난 미완료 가져오기',
        title: '최근 2주간 못 끝낸 일을 이 날짜로 모읍니다',
        onClick: () => {
          const moved = S.carryOverInto(dateKey);
          ctx.rerender();
          ui.toast(moved ? moved + '건을 가져왔습니다.' : '가져올 미완료 항목이 없습니다.');
        },
      }),
    ]);

    /* --- 날짜 이동 --- */
    root.appendChild(
      el('div', { class: 'cal-toolbar' }, [
        el('button', {
          class: 'btn btn-sm', text: '‹',
          onClick: () => { state.selected = U.addDays(dateKey, -1); ctx.rerender(); },
        }),
        el('button', {
          class: 'btn btn-sm', text: '오늘',
          onClick: () => { state.selected = U.today(); ctx.rerender(); },
        }),
        el('button', {
          class: 'btn btn-sm', text: '›',
          onClick: () => { state.selected = U.addDays(dateKey, 1); ctx.rerender(); },
        }),
        el('span', { class: 'cal-month-label', text: U.fmtDate(dateKey, { year: false }) }),
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn btn-sm',
          text: '루틴 다시 깔기',
          title: '이 날짜 요일에 해당하는 루틴을 체크리스트에 채웁니다',
          onClick: () => {
            const added = S.materializeRoutines(dateKey);
            S.save();
            ctx.rerender();
            ui.toast(added ? added + '개의 루틴을 추가했습니다.' : '추가할 루틴이 없습니다.');
          },
        }),
      ])
    );

    const layout = el('div', { class: 'grid grid-2' });
    root.appendChild(layout);

    /* --- 왼쪽: 그날 체크리스트 --- */
    const progress = ui.taskProgress(dateKey);
    const bar = el('span', { style: { width: progress.pct + '%' } });
    const label = el('span', {
      class: 'hint',
      text: progress.done + ' / ' + progress.total + ' 완료',
    });

    const card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', { text: U.fmtDate(dateKey, { year: false }) + ' 할 일' }), label]),
      el('div', { class: 'progress', style: { marginBottom: '12px' } }, [bar]),
    ]);
    card.appendChild(
      ui.taskList(dateKey, {
        onChanged: () => {
          const p = ui.taskProgress(dateKey);
          bar.style.width = p.pct + '%';
          label.textContent = p.done + ' / ' + p.total + ' 완료';
        },
      })
    );

    /* 그날 일정도 같이 보이면 계획 세우기 편하다 */
    const events = S.eventsOn(dateKey);
    if (events.length) {
      card.appendChild(
        el('div', { class: 'card-head', style: { marginTop: '18px' } }, [
          el('h2', { text: '이 날 일정' }),
          el('span', { class: 'hint', text: events.length + '개' }),
        ])
      );
      const list = el('div', { class: 'event-list' });
      events.forEach((ev) => list.appendChild(ui.eventRow(ev, dateKey, ctx.rerender)));
      card.appendChild(list);
    }
    layout.appendChild(card);

    /* --- 오른쪽 --- */
    const right = el('div', { class: 'grid' });
    layout.appendChild(right);
    right.appendChild(routineCard(ctx));
    right.appendChild(historyCard(dateKey, ctx));
  }

  /* ------------------------------------------------------------------ */
  /* 요일 루틴                                                            */
  /* ------------------------------------------------------------------ */

  function routineCard(ctx) {
    const card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '요일 루틴' }),
        el('span', { class: 'hint', text: '해당 요일에 자동으로 깔립니다' }),
      ]),
    ]);

    if (!S.data.routines.length) {
      card.appendChild(
        el('div', { class: 'empty', text: '예) 월요일 – 주간 제작 현황 정리 / 금요일 – 다음 주 촬영 준비 확인' })
      );
    } else {
      const rows = el('div', { class: 'list-rows' });
      S.data.routines.forEach((routine) => {
        const dayChips = el('div', { class: 'chip-row' });
        for (let d = 0; d < 7; d++) {
          const on = routine.days.includes(d);
          dayChips.appendChild(
            el('button', {
              class: 'chip' + (on ? ' on' : ''),
              type: 'button',
              style: { padding: '2px 8px', fontSize: '11.5px' },
              text: U.WEEKDAYS[d],
              onClick: () => {
                const days = routine.days.slice();
                const idx = days.indexOf(d);
                if (idx >= 0) days.splice(idx, 1);
                else days.push(d);
                days.sort();
                S.updateRoutine(routine.id, { days });
                ctx.rerender();
              },
            })
          );
        }

        rows.appendChild(
          el('div', { class: 'list-row', style: { alignItems: 'flex-start', flexWrap: 'wrap' } }, [
            el('div', { class: 'grow', style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
              el('span', {
                text: routine.text,
                style: routine.active === false ? { opacity: '.5', textDecoration: 'line-through' } : {},
              }),
              dayChips,
            ]),
            el('button', {
              class: 'btn btn-sm btn-ghost',
              text: routine.active === false ? '켜기' : '끄기',
              onClick: () => {
                S.updateRoutine(routine.id, { active: routine.active === false });
                ctx.rerender();
              },
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
          ])
        );
      });
      card.appendChild(rows);
    }

    const input = el('input', { type: 'text', placeholder: '새 루틴 입력 후 Enter (기본: 평일)' });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const value = input.value.trim();
      if (!value) return;
      S.addRoutine(value, [1, 2, 3, 4, 5]);
      ctx.rerender();
    });
    card.appendChild(el('div', { class: 'task-add' }, [el('span', { class: 'faint', text: '+' }), input]));

    return card;
  }

  /* ------------------------------------------------------------------ */
  /* 최근 기록                                                            */
  /* ------------------------------------------------------------------ */

  function historyCard(dateKey, ctx) {
    const card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '최근 2주 기록' }),
        el('span', { class: 'hint', text: '날짜를 누르면 이동' }),
      ]),
    ]);

    const rows = el('div', { class: 'list-rows' });
    for (let i = 0; i < 14; i++) {
      const key = U.addDays(U.today(), -i);
      const tasks = S.tasksFor(key);
      if (!tasks.length) continue;
      const done = tasks.filter((t) => t.done).length;
      const pct = Math.round((done / tasks.length) * 100);

      rows.appendChild(
        el('div', {
          class: 'list-row',
          style: { cursor: 'pointer', background: key === dateKey ? 'var(--panel-hover)' : '' },
          onClick: () => { ctx.state.selected = key; ctx.rerender(); },
        }, [
          el('span', {
            class: 'mono faint',
            style: { minWidth: '84px' },
            text: U.fmtShort(key) + ' ' + U.WEEKDAYS[U.dayOfWeek(key)],
          }),
          el('div', { class: 'grow' }, [
            el('div', { class: 'progress' }, [
              el('span', {
                style: { width: pct + '%', background: pct === 100 ? 'var(--success)' : 'var(--accent)' },
              }),
            ]),
          ]),
          el('span', { class: 'faint mono', style: { minWidth: '54px', textAlign: 'right' }, text: done + '/' + tasks.length }),
        ])
      );
    }

    card.appendChild(
      rows.childElementCount ? rows : el('div', { class: 'empty', text: '아직 기록이 없습니다.' })
    );
    return card;
  }

  A.views = A.views || {};
  A.views.checklist = { title: '체크리스트', render };
})(window);
