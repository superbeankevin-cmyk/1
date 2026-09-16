/* '오늘' 화면 — 아침에 이거 하나만 보면 되도록 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;

  function statCard(value, label, color) {
    return el('div', { class: 'card stat' }, [
      el('span', { class: 'value', style: color ? { color } : {}, text: String(value) }),
      el('span', { class: 'label', text: label }),
    ]);
  }

  function render(root, ctx) {
    const todayKey = U.today();
    const tomorrowKey = U.addDays(todayKey, 1);
    const weekStart = S.data.settings.weekStart;
    const weekFrom = U.startOfWeek(todayKey, weekStart);
    const weekTo = U.addDays(weekFrom, 6);

    ctx.setSubtitle(U.fmtDate(todayKey));
    ctx.setActions([
      el('button', {
        class: 'btn',
        text: '＋ 할 일',
        onClick: () => {
          const box = root.querySelector('#today-tasks .task-add input');
          if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        },
      }),
      el('button', {
        class: 'btn btn-primary',
        text: '＋ 새 일정',
        onClick: () => ui.eventEditor(null, { date: todayKey, onSaved: ctx.rerender }),
      }),
    ]);

    const todayEvents = S.eventsOn(todayKey);
    const tomorrowEvents = S.eventsOn(tomorrowKey);
    const progress = ui.taskProgress(todayKey);
    const carried = S.tasksFor(todayKey).filter((t) => t.carriedFrom && !t.done).length;
    const weekShoots = S.eventsBetween(weekFrom, weekTo)
      .filter(({ event }) => event.category === 'shoot').length;

    /* --- 요약 --- */
    root.appendChild(
      el('div', { class: 'grid grid-3', style: { marginBottom: '16px' } }, [
        statCard(todayEvents.length, '오늘 일정'),
        statCard(
          progress.total ? progress.done + ' / ' + progress.total : '0',
          '체크리스트',
          progress.total && progress.done === progress.total ? 'var(--success)' : ''
        ),
        statCard(weekShoots, '이번 주 촬영'),
        statCard(carried, '이월된 할 일', carried ? 'var(--warning)' : ''),
      ])
    );

    /* --- 본문 2단 --- */
    const cols = el('div', { class: 'grid grid-2' });
    root.appendChild(cols);

    /* 왼쪽: 일정 */
    const left = el('div', { class: 'grid' });
    cols.appendChild(left);

    const todayCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '오늘 일정' }),
        el('span', { class: 'hint', text: U.fmtDate(todayKey, { year: false }) }),
      ]),
    ]);
    if (!todayEvents.length) {
      todayCard.appendChild(el('div', { class: 'empty', text: '오늘 잡힌 일정이 없습니다.' }));
    } else {
      const list = el('div', { class: 'event-list' });
      todayEvents.forEach((ev) => list.appendChild(ui.eventRow(ev, todayKey, ctx.rerender)));
      todayCard.appendChild(list);
    }
    left.appendChild(todayCard);

    const tomorrowCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '내일 미리보기' }),
        el('span', { class: 'hint', text: U.fmtDate(tomorrowKey, { year: false }) }),
      ]),
    ]);
    if (!tomorrowEvents.length) {
      tomorrowCard.appendChild(el('div', { class: 'empty', text: '내일은 비어 있습니다.' }));
    } else {
      const list = el('div', { class: 'event-list' });
      tomorrowEvents.forEach((ev) => list.appendChild(ui.eventRow(ev, tomorrowKey, ctx.rerender)));
      tomorrowCard.appendChild(list);
    }
    left.appendChild(tomorrowCard);

    /* 오른쪽: 체크리스트 + 메모 */
    const right = el('div', { class: 'grid' });
    cols.appendChild(right);

    const bar = el('span', { style: { width: progress.pct + '%' } });
    const progressLabel = el('span', { class: 'hint', text: progress.pct + '%' });
    const tasksCard = el('div', { id: 'today-tasks', class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '오늘의 체크리스트' }),
        progressLabel,
      ]),
      el('div', { class: 'progress', style: { marginBottom: '12px' } }, [bar]),
    ]);

    const tasks = ui.taskList(todayKey, {
      emptyText: '오늘 챙길 일을 적어두세요. (나만 봅니다)',
      onChanged: () => {
        const p = ui.taskProgress(todayKey);
        bar.style.width = p.pct + '%';
        progressLabel.textContent = p.pct + '%';
      },
    });
    tasksCard.appendChild(tasks);
    right.appendChild(tasksCard);

    /* 하루 메모 */
    const note = el('textarea', {
      class: 'note-area',
      placeholder: '오늘 기억해야 할 것 / 전달받은 내용',
    });
    note.value = S.note(todayKey);
    note.addEventListener('blur', () => S.setNote(todayKey, note.value));
    right.appendChild(
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [el('h2', { text: '오늘 메모' })]),
        note,
      ])
    );

    /* --- 다가오는 일정 --- */
    const upcoming = [];
    for (let i = 2; i <= 9; i++) {
      const key = U.addDays(todayKey, i);
      for (const ev of S.eventsOn(key)) upcoming.push({ date: key, event: ev });
    }

    const upcomingCard = el('div', { class: 'card', style: { marginTop: '16px' } }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '다가오는 일정' }),
        el('span', { class: 'hint', text: '앞으로 9일' }),
      ]),
    ]);
    if (!upcoming.length) {
      upcomingCard.appendChild(el('div', { class: 'empty', text: '예정된 일정이 없습니다.' }));
    } else {
      const list = el('div', { class: 'list-rows' });
      upcoming.slice(0, 12).forEach(({ date, event }) => {
        list.appendChild(
          el('div', {
            class: 'list-row',
            style: { cursor: 'pointer' },
            onClick: () => ui.eventEditor(event, { date, onSaved: ctx.rerender }),
          }, [
            el('span', {
              class: 'mono faint',
              style: { minWidth: '92px' },
              text: U.fmtShort(date) + ' ' + U.WEEKDAYS[U.dayOfWeek(date)],
            }),
            el('span', { class: 'grow', text: event.title }),
            ui.categoryPill(event.category),
            ui.avatarStack(event.members),
            el('span', { class: 'faint', style: { minWidth: '54px', textAlign: 'right' }, text: U.fmtRelative(date) }),
          ])
        );
      });
      upcomingCard.appendChild(list);
    }
    root.appendChild(upcomingCard);

    /* --- 이번 주 팀 부하 --- */
    const workload = S.workloadBetween(weekFrom, weekTo).sort((a, b) => b.count - a.count);
    const max = Math.max(1, ...workload.map((w) => w.count));
    const loadCard = el('div', { class: 'card', style: { marginTop: '16px' } }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '이번 주 팀 부하' }),
        el('span', { class: 'hint', text: U.fmtShort(weekFrom) + ' – ' + U.fmtShort(weekTo) }),
      ]),
    ]);
    const loadRows = el('div', { class: 'list-rows' });
    workload.forEach((w) => {
      loadRows.appendChild(
        el('div', { class: 'list-row' }, [
          ui.avatar(w.member.id),
          el('span', { style: { minWidth: '92px' }, text: w.member.name }),
          el('div', { class: 'grow' }, [
            el('div', { class: 'progress' }, [
              el('span', {
                style: { width: Math.round((w.count / max) * 100) + '%', background: w.member.color },
              }),
            ]),
          ]),
          el('span', { class: 'faint mono', text: w.count + '건' + (w.shoot ? ' · 촬영 ' + w.shoot : '') }),
        ])
      );
    });
    loadCard.appendChild(workload.length ? loadRows : el('div', { class: 'empty', text: '팀원을 추가해 주세요.' }));
    root.appendChild(loadCard);
  }

  A.views = A.views || {};
  A.views.today = { title: '오늘', render };
})(window);
