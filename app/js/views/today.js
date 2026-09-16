/* TODAY — 아침에 이 화면 하나만 보면 되도록 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;
  const icon = A.icon;

  function greetingText() {
    const hour = new Date().getHours();
    if (hour < 5) return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function render(root, ctx) {
    ctx.fullHeight();
    const todayKey = U.today();
    const weekStart = S.data.settings.weekStart;
    if (!ctx.state.selected) ctx.state.selected = todayKey;

    const todayEvents = S.eventsOn(todayKey);
    const progress = ui.taskProgress(todayKey);
    const remaining = progress.total - progress.done;
    const name = S.data.settings.userName;

    /* --- 인사말 + 한 줄 요약 --- */
    root.appendChild(
      el('div', { class: 'greeting' }, [
        el('h1', { text: greetingText() + (name ? ', ' + name + '님' : '') }),
        el('p', {}, [
          U.fmtDate(todayKey),
          '  ·  ',
          el('span', { class: 'count', text: '일정 ' + todayEvents.length + '개' }),
          ' · ',
          el('span', { class: 'count', text: '할 일 ' + remaining + '개 남음' }),
        ]),
      ])
    );

    /* --- 가운데 주간 시간표 + 오른쪽 TODAY 패널 --- */
    const split = el('div', { class: 'split', style: { flex: '1', minHeight: '0' } });
    root.appendChild(split);

    const days = [];
    const from = U.startOfWeek(todayKey, weekStart);
    for (let i = 0; i < 7; i++) days.push(U.addDays(from, i));

    split.appendChild(
      A.timeGrid({
        days,
        getSelected: () => ctx.state.selected,
        onPickDate: (key) => { ctx.state.selected = key; ctx.go('calendar'); },
        onChanged: ctx.rerender,
      })
    );

    split.appendChild(rail(ctx, todayKey));
  }

  /* ------------------------------------------------------------------ */
  /* 오른쪽 패널 — 이 프로그램의 존재 이유                                */
  /* ------------------------------------------------------------------ */

  function rail(ctx, todayKey) {
    const wrap = el('div', { class: 'rail' });

    /* NEXT — 오늘 남은 일정 */
    const events = S.eventsOn(todayKey);
    const nowMin = U.toMinutes(U.nowHHMM());
    const upcoming = events.filter((ev) => ev.allDay || U.toMinutes(ev.end || ev.start) >= nowMin);

    const todayCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: 'Today' }),
        el('button', {
          class: 'btn btn-sm btn-quiet',
          onClick: () => A.quickAdd({ date: todayKey, onSaved: ctx.rerender }),
        }, [icon('plus', 12), '일정']),
      ]),
      el('div', {
        style: { fontSize: '15px', fontWeight: '650', marginBottom: '2px' },
        text: U.fmtDate(todayKey, { year: false }),
      }),
      el('div', {
        class: 'faint',
        style: { marginBottom: '11px' },
        text: events.length
          ? upcoming.length
            ? upcoming.length + '개가 남아 있어요.'
            : '오늘 일정은 모두 지나갔어요.'
          : '오늘은 잡힌 일정이 없어요.',
      }),
    ]);

    if (events.length) {
      const list = el('div', { class: 'ev-list' });
      events.forEach((ev) => {
        const row = ui.eventRow(ev, todayKey, ctx.rerender);
        // 이미 지난 일정은 살짝 흐리게
        if (!ev.allDay && ev.start && U.toMinutes(ev.end || ev.start) < nowMin) {
          row.style.opacity = '.5';
        }
        list.appendChild(row);
      });
      todayCard.appendChild(list);
    }
    wrap.appendChild(todayCard);

    /* MY CHECKLIST — 팀원에게 안 보이는, 나만의 목록 */
    const progress = ui.taskProgress(todayKey);
    const bar = el('span', { style: { width: progress.pct + '%' } });
    const countLabel = el('span', { class: 'sub', text: progress.done + ' / ' + progress.total });

    const tasksCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', { text: 'My Checklist' }), countLabel]),
      el('div', { class: 'bar', style: { marginBottom: '10px' } }, [bar]),
    ]);

    const list = ui.taskList(todayKey, {
      emptyText: '오늘 챙길 일을 적어두세요.\n이 목록은 나만 봅니다.',
      onChanged: () => {
        const p = ui.taskProgress(todayKey);
        bar.style.width = p.pct + '%';
        countLabel.textContent = p.done + ' / ' + p.total;
      },
    });
    tasksCard.appendChild(list);
    tasksCard.focusAdd = list.focusAdd;
    wrap.appendChild(tasksCard);

    /* 미니 캘린더 */
    const mini = ui.miniCalendar({
      getSelected: () => ctx.state.selected,
      onPick: (key) => { ctx.state.selected = key; ctx.go('calendar'); },
    });
    wrap.appendChild(el('div', { class: 'card' }, [mini]));

    /* 빠른 추가 */
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [el('h2', { text: '빠른 추가' })]),
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
          el('button', {
            class: 'btn btn-block',
            style: { justifyContent: 'space-between' },
            onClick: () => A.quickAdd({ date: todayKey, onSaved: ctx.rerender }),
          }, [
            el('span', { style: { display: 'flex', alignItems: 'center', gap: '7px' } }, [icon('calendar', 14), '일정 추가']),
            el('kbd', { text: 'Ctrl N' }),
          ]),
          el('button', {
            class: 'btn btn-block',
            style: { justifyContent: 'space-between' },
            onClick: () => A.quickAdd({ date: todayKey, mode: 'task', onSaved: ctx.rerender }),
          }, [
            el('span', { style: { display: 'flex', alignItems: 'center', gap: '7px' } }, [icon('tasks', 14), '할 일 추가']),
            el('kbd', { text: 'Ctrl ⇧ N' }),
          ]),
        ]),
      ])
    );

    wrap.focusTaskAdd = () => list.focusAdd();
    return wrap;
  }

  A.views = A.views || {};
  A.views.today = { title: 'Today', render };
})(window);
