/* TEAM — 팀원별 오늘 / 이번 주 상황. 상태는 손으로 적지 않고 일정에서 뽑는다. */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;
  const icon = A.icon;

  const RANGES = [
    { id: 'today', label: '오늘' },
    { id: 'thisWeek', label: '이번 주' },
    { id: 'nextWeek', label: '다음 주' },
  ];

  function rangeFor(id) {
    const weekStart = S.data.settings.weekStart;
    const today = U.today();
    if (id === 'today') return { from: today, to: today };
    if (id === 'nextWeek') {
      const from = U.addDays(U.startOfWeek(today, weekStart), 7);
      return { from, to: U.addDays(from, 6) };
    }
    const from = U.startOfWeek(today, weekStart);
    return { from, to: U.addDays(from, 6) };
  }

  /**
   * 오늘 일정에서 "지금 뭐 하는 중인지"를 추론한다.
   * 손으로 입력하게 만들면 일주일 안에 아무도 안 쓴다.
   */
  function currentStatus(memberId) {
    const todayKey = U.today();
    const nowMin = U.toMinutes(U.nowHHMM());
    const mine = S.eventsOn(todayKey).filter((ev) => (ev.members || []).includes(memberId));
    if (!mine.length) return { label: '일정 없음', color: 'var(--text-3)' };

    const off = mine.find((ev) => ev.category === 'off');
    if (off) return { label: '휴가', color: '#c7c7cc' };

    // 지금 시각에 걸쳐 있는 일정을 우선 본다
    const live = mine.find((ev) =>
      !ev.allDay && ev.start &&
      U.toMinutes(ev.start) <= nowMin &&
      U.toMinutes(ev.end || ev.start) >= nowMin
    );
    const pick = live || mine.find((ev) => !ev.done) || mine[0];
    const cat = A.category(pick.category);
    const label = (live ? cat.label + ' 중' : cat.label) + (pick.place ? ' · ' + pick.place : '');
    return { label, color: cat.color };
  }

  function render(root, ctx) {
    const state = ctx.state;
    if (!state.teamRange) state.teamRange = 'thisWeek';
    const { from, to } = rangeFor(state.teamRange);

    const seg = el('div', { class: 'seg' });
    RANGES.forEach((r) => {
      seg.appendChild(el('button', {
        class: state.teamRange === r.id ? 'active' : '',
        text: r.label,
        onClick: () => { state.teamRange = r.id; ctx.rerender(); },
      }));
    });

    root.appendChild(
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' } }, [
        seg,
        el('span', { class: 'faint', text: U.fmtDate(from, { weekday: false }) + ' – ' + U.fmtDate(to, { weekday: false }) }),
        el('div', { style: { flex: '1' } }),
        el('button', { class: 'btn', onClick: () => addMemberDialog(ctx) }, [icon('plus', 13), '팀원 추가']),
      ])
    );

    /* --- 오늘 현황 한 줄 요약 --- */
    const statusCard = el('div', { class: 'card', style: { marginBottom: '16px' } }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '지금 팀은' }),
        el('span', { class: 'sub', text: U.fmtDate(U.today(), { year: false }) }),
      ]),
    ]);
    const statusRows = el('div', { class: 'rows' });
    S.members().forEach((m) => {
      const st = currentStatus(m.id);
      const todayCount = S.eventsOn(U.today()).filter((ev) => (ev.members || []).includes(m.id)).length;
      statusRows.appendChild(el('div', { class: 'row' }, [
        ui.avatar(m.id, 28),
        el('span', { style: { minWidth: '72px', fontWeight: '550' }, text: m.name }),
        el('span', { class: 'faint', style: { minWidth: '44px' }, text: m.role || '' }),
        el('span', { class: 'dot', style: { background: st.color } }),
        el('span', { class: 'grow muted', text: st.label }),
        el('span', { class: 'faint mono', text: todayCount + '건' }),
      ]));
    });
    statusCard.appendChild(statusRows);
    root.appendChild(statusCard);

    /* --- 팀원별 일정 --- */
    const entries = S.eventsBetween(from, to);
    const grid = el('div', { class: 'split' });
    root.appendChild(grid);
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(330px, 1fr))';
    grid.style.height = 'auto';

    S.members().forEach((member) => {
      const mine = entries.filter(({ event }) => (event.members || []).includes(member.id));
      const card = el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px' } }, [
            ui.avatar(member.id, 26),
            el('span', { style: { fontSize: '14px', fontWeight: '650' }, text: member.name }),
            member.role ? ui.tag(member.role, 'var(--text-3)') : null,
          ]),
          el('span', { class: 'sub', text: mine.length + '건' }),
        ]),
      ]);

      if (!mine.length) {
        card.appendChild(el('div', { class: 'empty', text: '이 기간에 배정된 일정이 없습니다.' }));
      } else {
        const list = el('div', { class: 'ev-list' });
        mine.slice(0, 12).forEach(({ date, event }) => {
          list.appendChild(el('div', {
            class: 'ev' + (event.done ? ' done' : ''),
            style: { borderLeftColor: A.eventColor(event) },
            onClick: () => A.eventEditor(event, { date, onSaved: ctx.rerender }),
          }, [
            el('span', { class: 'ev-time', style: { minWidth: '72px' },
              text: U.fmtShort(date) + ' ' + U.WEEKDAYS[U.dayOfWeek(date)] }),
            el('div', { class: 'ev-body' }, [
              el('span', { class: 'ev-title', text: event.title }),
              el('span', { class: 'ev-sub', text: [S.projectName(event.projectId), U.fmtTimeRange(event)].filter(Boolean).join(' · ') }),
            ]),
            event.deadline ? ui.tag('마감', A.ACCENT_DEADLINE) : null,
          ]));
        });
        if (mine.length > 12) {
          list.appendChild(el('div', { class: 'faint', style: { padding: '7px 2px' }, text: '외 ' + (mine.length - 12) + '건' }));
        }
        card.appendChild(list);
      }
      grid.appendChild(card);
    });

    /* --- 담당자 없는 일정: 놓치기 쉬운 구멍 --- */
    const orphans = entries.filter(({ event }) => !(event.members || []).length);
    if (orphans.length) {
      const card = el('div', { class: 'card', style: { marginTop: '16px' } }, [
        el('div', { class: 'card-head' }, [
          el('h2', { text: '담당자 미지정' }),
          el('span', { class: 'sub', text: orphans.length + '건' }),
        ]),
      ]);
      const list = el('div', { class: 'ev-list' });
      orphans.forEach(({ date, event }) => {
        list.appendChild(el('div', {
          class: 'ev',
          style: { borderLeftColor: 'var(--line-2)' },
          onClick: () => A.eventEditor(event, { date, onSaved: ctx.rerender }),
        }, [
          el('span', { class: 'ev-time', style: { minWidth: '72px' }, text: U.fmtShort(date) }),
          el('div', { class: 'ev-body' }, [el('span', { class: 'ev-title', text: event.title })]),
        ]));
      });
      card.appendChild(list);
      root.appendChild(card);
    }

    root.appendChild(memberAdminCard(ctx));
  }

  /* ------------------------------------------------------------------ */

  function memberAdminCard(ctx) {
    const card = el('div', { class: 'card', style: { marginTop: '16px' } }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '팀원 관리' }),
        el('span', { class: 'sub', text: '이름 · 이니셜 · 색' }),
      ]),
    ]);

    const rows = el('div', { class: 'rows' });
    S.members().forEach((member) => {
      const nameInput = el('input', { type: 'text', style: { maxWidth: '150px' } });
      nameInput.value = member.name;
      nameInput.addEventListener('blur', () => {
        const next = nameInput.value.trim();
        if (next && next !== member.name) { S.updateMember(member.id, { name: next }); ctx.rerender(); }
      });

      const shortInput = el('input', { type: 'text', maxlength: '3', style: { width: '58px', textAlign: 'center' } });
      shortInput.value = member.short;
      shortInput.addEventListener('blur', () => {
        const next = shortInput.value.trim().toUpperCase();
        if (next && next !== member.short) { S.updateMember(member.id, { short: next }); ctx.rerender(); }
      });

      const roleInput = el('input', { type: 'text', placeholder: '역할', style: { width: '76px' } });
      roleInput.value = member.role || '';
      roleInput.addEventListener('blur', () => {
        const next = roleInput.value.trim();
        if (next !== (member.role || '')) { S.updateMember(member.id, { role: next }); ctx.rerender(); }
      });

      const colors = el('div', { style: { display: 'flex', gap: '4px' } });
      A.MEMBER_PALETTE.forEach((color) => {
        colors.appendChild(el('button', {
          class: 'filter-chip',
          title: color,
          style: {
            width: '20px', height: '20px', padding: '0', borderRadius: '50%',
            background: color,
            borderColor: member.color === color ? 'var(--text)' : 'transparent',
            borderWidth: member.color === color ? '2px' : '1px',
          },
          onClick: () => { S.updateMember(member.id, { color }); ctx.rerender(); },
        }));
      });

      rows.appendChild(el('div', { class: 'row', style: { flexWrap: 'wrap' } }, [
        ui.avatar(member.id),
        nameInput,
        shortInput,
        roleInput,
        el('div', { class: 'grow' }, [colors]),
        member.lead
          ? ui.tag('본인', 'var(--text-3)')
          : el('button', {
              class: 'btn btn-sm btn-danger', text: '제외',
              onClick: async () => {
                const ok = await ui.confirm(
                  member.name + ' 님을 목록에서 제외할까요? 기존 일정 기록은 그대로 남습니다.',
                  { danger: true, confirmLabel: '제외' }
                );
                if (!ok) return;
                S.removeMember(member.id);
                ctx.rerender();
              },
            }),
      ]));
    });

    card.appendChild(rows);
    return card;
  }

  function addMemberDialog(ctx) {
    const nameInput = el('input', { type: 'text', class: 'quick-title', placeholder: '이름' });
    const shortInput = el('input', { type: 'text', placeholder: '이니셜 (예: SK)', maxlength: '3' });

    ui.modal({
      title: '팀원 추가',
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '13px' } }, [
        nameInput,
        el('div', { class: 'field' }, [el('label', { text: '이니셜' }), shortInput]),
      ]),
      footer(foot, close) {
        foot.appendChild(el('button', { class: 'btn', text: '취소', onClick: close }));
        foot.appendChild(el('button', {
          class: 'btn btn-primary', text: '추가',
          onClick: () => {
            const name = nameInput.value.trim();
            if (!name) { nameInput.focus(); return; }
            S.addMember(name, shortInput.value.trim());
            close();
            ctx.rerender();
            ui.toast(name + ' 님을 추가했습니다.');
          },
        }));
      },
      onOpen: () => nameInput.focus(),
    });
  }

  A.views = A.views || {};
  A.views.team = { title: 'Team', render };
})(window);
