/* 주간 / 일간 시간표 — 이 프로그램에서 가장 많이 보게 될 화면 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;

  const HOUR_H = 52;        // styles.css 의 --hour-h 와 맞춰둘 것
  const MIN_BLOCK = 22;     // 짧은 일정도 글자가 보이도록 하는 최소 높이

  /**
   * 겹치는 일정을 나란히 놓기 위해 각 일정의 (열 번호, 전체 열 수)를 구한다.
   * 시작 시각 순으로 훑으면서, 앞 일정과 시간이 겹치면 같은 무리로 묶는다.
   */
  function layoutOverlaps(events) {
    const sorted = events
      .map((ev) => ({
        ev,
        from: U.toMinutes(ev.start),
        to: Math.max(U.toMinutes(ev.start) + 30, U.toMinutes(ev.end || ev.start) || 0),
      }))
      .sort((a, b) => a.from - b.from || a.to - b.to);

    const placed = [];
    let cluster = [];
    let clusterEnd = -1;

    const flush = () => {
      if (!cluster.length) return;
      const columns = [];   // 각 열의 마지막 종료 시각
      for (const item of cluster) {
        let col = columns.findIndex((endsAt) => endsAt <= item.from);
        if (col < 0) { col = columns.length; columns.push(0); }
        columns[col] = item.to;
        item.col = col;
      }
      for (const item of cluster) item.cols = columns.length;
      placed.push(...cluster);
      cluster = [];
      clusterEnd = -1;
    };

    for (const item of sorted) {
      if (cluster.length && item.from >= clusterEnd) flush();
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.to);
    }
    flush();
    return placed;
  }

  /**
   * @param {object} opts
   * @param {string[]} opts.days       그릴 날짜들 ('YYYY-MM-DD')
   * @param {function} opts.getSelected 선택된 날짜를 돌려주는 함수
   * @param {function} opts.onPickDate  날짜 머리글을 눌렀을 때
   * @param {function} opts.onChanged   일정이 바뀌었을 때
   */
  function timeGrid(opts) {
    const o = opts || {};
    const days = o.days || [U.today()];
    const startHour = S.data.settings.dayStartHour;
    const endHour = S.data.settings.dayEndHour;
    const hours = Math.max(1, endHour - startHour);
    const todayKey = U.today();
    const template = '54px repeat(' + days.length + ', minmax(0, 1fr))';

    const wrap = el('div', { class: 'tg' });

    /* --- 날짜 머리글 --- */
    const head = el('div', { class: 'tg-head', style: { gridTemplateColumns: template } });
    head.appendChild(el('div', { class: 'corner' }));
    days.forEach((key) => {
      const d = U.fromKey(key);
      const dow = d.getDay();
      head.appendChild(
        el('div', {
          class: 'tg-daycol'
            + (key === todayKey ? ' today' : '')
            + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '')
            + (o.getSelected && key === o.getSelected() ? ' selected' : ''),
          style: { cursor: 'pointer' },
          onClick: () => { if (o.onPickDate) o.onPickDate(key); },
        }, [
          el('div', { class: 'w', text: U.WEEKDAYS[dow] }),
          el('div', { class: 'd', text: String(d.getDate()) }),
        ])
      );
    });
    wrap.appendChild(head);

    /* --- 종일 일정 줄 --- */
    const allDayByDay = days.map((key) => S.eventsOn(key).filter((ev) => ev.allDay || !ev.start));
    if (allDayByDay.some((list) => list.length)) {
      const allDay = el('div', { class: 'tg-allday', style: { gridTemplateColumns: template } });
      allDay.appendChild(el('div', { class: 'corner', text: '종일' }));
      days.forEach((key, i) => {
        const col = el('div', { class: 'tg-allday-col' });
        allDayByDay[i].forEach((ev) => {
          const chip = ui.eventChip(ev, 'month-chip');
          chip.style.cursor = 'pointer';
          chip.addEventListener('click', () =>
            A.eventEditor(ev, { date: key, onSaved: o.onChanged })
          );
          col.appendChild(chip);
        });
        allDay.appendChild(col);
      });
      wrap.appendChild(allDay);
    }

    /* --- 시간 격자 --- */
    const scroll = el('div', { class: 'tg-scroll' });
    const body = el('div', { class: 'tg-body', style: { gridTemplateColumns: template } });

    const hourCol = el('div', { class: 'tg-hours' });
    for (let h = startHour; h < endHour; h++) {
      hourCol.appendChild(
        el('div', { class: 'tg-hour-label', text: h === startHour ? '' : U.pad(h) + ':00' })
      );
    }
    body.appendChild(hourCol);

    days.forEach((key) => {
      const d = U.fromKey(key);
      const dow = d.getDay();
      const col = el('div', {
        class: 'tg-col'
          + (key === todayKey ? ' today' : '')
          + (dow === 0 || dow === 6 ? ' weekend' : ''),
      });

      // 빈 칸을 누르면 그 시각으로 새 일정
      for (let h = startHour; h < endHour; h++) {
        col.appendChild(
          el('div', {
            class: 'tg-slot',
            title: U.pad(h) + ':00 에 일정 추가',
            onClick: () => A.quickAdd({
              date: key,
              start: U.pad(h) + ':00',
              onSaved: o.onChanged,
            }),
          })
        );
      }

      const timed = S.eventsOn(key).filter((ev) => !ev.allDay && ev.start);
      layoutOverlaps(timed).forEach(({ ev, from, to, col: column, cols }) => {
        const top = ((from - startHour * 60) / 60) * HOUR_H;
        const rawHeight = ((to - from) / 60) * HOUR_H;
        const gridHeight = hours * HOUR_H;

        // 표시 범위 밖으로 삐져나가는 부분은 잘라낸다
        const clampedTop = Math.max(0, top);
        const height = Math.max(MIN_BLOCK, Math.min(rawHeight + Math.min(0, top), gridHeight - clampedTop));
        if (clampedTop >= gridHeight) return;

        const color = A.eventColor(ev);
        const widthPct = 100 / cols;
        const who = (ev.members || []).map((id) => S.memberName(id)).filter(Boolean);
        const project = S.project(ev.projectId);

        const block = el('div', {
          class: 'tg-ev' + (ev.done ? ' done' : ''),
          style: {
            top: clampedTop + 'px',
            height: height + 'px',
            left: 'calc(' + column * widthPct + '% + 3px)',
            width: 'calc(' + widthPct + '% - 6px)',
            borderLeftColor: color,
            background: color + '1a',
          },
          title: U.fmtTimeRange(ev) + '  ' + ev.title
            + (project ? '\n' + project.name : '')
            + (who.length ? '\n담당: ' + who.join(', ') : ''),
          onClick: (e) => {
            e.stopPropagation();
            A.eventEditor(ev, { date: key, onSaved: o.onChanged });
          },
        });

        // 블록이 높으면 목업처럼 시각을 윗줄로 분리하고, 낮으면 한 줄에 붙인다
        const roomy = height >= 40;
        if (roomy) block.appendChild(el('div', { class: 'h', text: ev.start }));
        block.appendChild(el('div', {
          class: 't',
          text: roomy ? ev.title : (ev.start ? ev.start + ' ' : '') + ev.title,
        }));
        if (height >= 58 && (project || who.length)) {
          block.appendChild(el('div', {
            class: 'm',
            text: [project ? project.name : '', who.join(', ')].filter(Boolean).join(' · '),
          }));
        }
        col.appendChild(block);
      });

      // 오늘 열에는 현재 시각 선
      if (key === todayKey) {
        const nowMin = U.toMinutes(U.nowHHMM());
        if (nowMin >= startHour * 60 && nowMin <= endHour * 60) {
          col.appendChild(
            el('div', {
              class: 'tg-now',
              style: { top: ((nowMin - startHour * 60) / 60) * HOUR_H + 'px' },
            })
          );
        }
      }

      body.appendChild(col);
    });

    scroll.appendChild(body);
    wrap.appendChild(scroll);

    // 지금 시각(또는 업무 시작 시각)이 보이도록 스크롤을 맞춰둔다
    requestAnimationFrame(() => {
      const nowMin = U.toMinutes(U.nowHHMM());
      const focusMin = nowMin > startHour * 60 ? nowMin - 60 : 9 * 60 - startHour * 60;
      scroll.scrollTop = Math.max(0, ((focusMin - startHour * 60) / 60) * HOUR_H);
    });

    return wrap;
  }

  A.timeGrid = timeGrid;
})(window);
