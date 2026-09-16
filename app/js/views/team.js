/* 팀 화면 — 팀원별로 뭘 얼마나 들고 있는지 + 팀원 관리 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;

  const RANGES = [
    { id: 'thisWeek', label: '이번 주' },
    { id: 'nextWeek', label: '다음 주' },
    { id: 'thisMonth', label: '이번 달' },
  ];

  function rangeFor(id) {
    const weekStart = S.data.settings.weekStart;
    const today = U.today();
    if (id === 'nextWeek') {
      const from = U.addDays(U.startOfWeek(today, weekStart), 7);
      return { from, to: U.addDays(from, 6) };
    }
    if (id === 'thisMonth') {
      const d = U.fromKey(today);
      const from = U.toKey(new Date(d.getFullYear(), d.getMonth(), 1));
      const to = U.toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      return { from, to };
    }
    const from = U.startOfWeek(today, weekStart);
    return { from, to: U.addDays(from, 6) };
  }

  function render(root, ctx) {
    const state = ctx.state;
    if (!state.teamRange) state.teamRange = 'thisWeek';
    const { from, to } = rangeFor(state.teamRange);

    ctx.setSubtitle(U.fmtDate(from, { weekday: false }) + ' – ' + U.fmtDate(to, { weekday: false }));
    ctx.setActions([
      el('button', {
        class: 'btn',
        text: '＋ 팀원 추가',
        onClick: () => addMemberDialog(ctx),
      }),
    ]);

    /* 기간 선택 */
    const seg = el('div', { class: 'seg' });
    RANGES.forEach((r) => {
      seg.appendChild(
        el('button', {
          class: state.teamRange === r.id ? 'active' : '',
          text: r.label,
          onClick: () => { state.teamRange = r.id; ctx.rerender(); },
        })
      );
    });
    root.appendChild(el('div', { class: 'cal-toolbar' }, [seg, el('div', { class: 'spacer' })]));

    /* 팀원 카드 */
    const entries = S.eventsBetween(from, to);
    const grid = el('div', { class: 'grid grid-2' });
    root.appendChild(grid);

    S.members().forEach((member) => {
      const mine = entries.filter(({ event }) => (event.members || []).includes(member.id));
      const byCategory = {};
      mine.forEach(({ event }) => {
        byCategory[event.category] = (byCategory[event.category] || 0) + 1;
      });

      const card = el('div', { class: 'card' });
      card.appendChild(
        el('div', { class: 'card-head' }, [
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px' } }, [
            ui.avatar(member.id, 26),
            el('h2', { text: member.name }),
          ]),
          el('span', { class: 'hint', text: mine.length + '건' }),
        ])
      );

      if (Object.keys(byCategory).length) {
        const pills = el('div', { class: 'chip-row', style: { marginBottom: '10px' } });
        A.CATEGORIES.forEach((cat) => {
          if (!byCategory[cat.id]) return;
          pills.appendChild(
            el('span', {
              class: 'pill',
              text: cat.label + ' ' + byCategory[cat.id],
              style: { color: cat.color, borderColor: cat.color + '55', background: cat.color + '18' },
            })
          );
        });
        card.appendChild(pills);
      }

      if (!mine.length) {
        card.appendChild(el('div', { class: 'empty', text: '이 기간에 배정된 일정이 없습니다.' }));
      } else {
        const list = el('div', { class: 'list-rows' });
        mine.slice(0, 14).forEach(({ date, event }) => {
          list.appendChild(
            el('div', {
              class: 'list-row',
              style: { cursor: 'pointer' },
              onClick: () => ui.eventEditor(event, { date, onSaved: ctx.rerender }),
            }, [
              el('span', {
                class: 'mono faint',
                style: { minWidth: '76px' },
                text: U.fmtShort(date) + ' ' + U.WEEKDAYS[U.dayOfWeek(date)],
              }),
              el('span', { class: 'grow', text: event.title }),
              el('span', { class: 'faint', text: U.fmtTimeRange(event) }),
            ])
          );
        });
        if (mine.length > 14) {
          list.appendChild(el('div', { class: 'faint', style: { padding: '8px 2px' }, text: '외 ' + (mine.length - 14) + '건' }));
        }
        card.appendChild(list);
      }

      grid.appendChild(card);
    });

    /* 담당자 없는 일정 — 놓치기 쉬운 구멍 */
    const orphans = entries.filter(({ event }) => !(event.members || []).length);
    if (orphans.length) {
      const card = el('div', { class: 'card', style: { marginTop: '16px' } }, [
        el('div', { class: 'card-head' }, [
          el('h2', { text: '담당자 미지정' }),
          el('span', { class: 'hint', text: orphans.length + '건' }),
        ]),
      ]);
      const list = el('div', { class: 'list-rows' });
      orphans.forEach(({ date, event }) => {
        list.appendChild(
          el('div', {
            class: 'list-row',
            style: { cursor: 'pointer' },
            onClick: () => ui.eventEditor(event, { date, onSaved: ctx.rerender }),
          }, [
            el('span', { class: 'mono faint', style: { minWidth: '76px' }, text: U.fmtShort(date) }),
            el('span', { class: 'grow', text: event.title }),
            ui.categoryPill(event.category),
          ])
        );
      });
      card.appendChild(list);
      root.appendChild(card);
    }

    /* 팀원 관리 */
    root.appendChild(memberAdminCard(ctx));
  }

  function memberAdminCard(ctx) {
    const card = el('div', { class: 'card', style: { marginTop: '16px' } }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '팀원 관리' }),
        el('span', { class: 'hint', text: '이름과 색을 바꿀 수 있습니다' }),
      ]),
    ]);

    const rows = el('div', { class: 'list-rows' });
    S.data.members.filter((m) => m.active !== false).forEach((member) => {
      const nameInput = el('input', { type: 'text', style: { maxWidth: '180px' } });
      nameInput.value = member.name;
      nameInput.addEventListener('blur', () => {
        const next = nameInput.value.trim();
        if (next && next !== member.name) {
          S.updateMember(member.id, { name: next });
          ctx.rerender();
        }
      });

      const shortInput = el('input', { type: 'text', maxlength: '3', style: { width: '62px', textAlign: 'center' } });
      shortInput.value = member.short;
      shortInput.addEventListener('blur', () => {
        const next = shortInput.value.trim().toUpperCase();
        if (next && next !== member.short) S.updateMember(member.id, { short: next });
      });

      const colorRow = el('div', { class: 'chip-row' });
      A.MEMBER_PALETTE.forEach((color) => {
        colorRow.appendChild(
          el('button', {
            class: 'chip',
            type: 'button',
            title: color,
            style: {
              padding: '0', width: '20px', height: '20px', borderRadius: '50%',
              background: color,
              borderColor: member.color === color ? 'var(--text)' : 'transparent',
              borderWidth: member.color === color ? '2px' : '1px',
            },
            onClick: () => { S.updateMember(member.id, { color }); ctx.rerender(); },
          })
        );
      });

      rows.appendChild(
        el('div', { class: 'list-row', style: { flexWrap: 'wrap' } }, [
          ui.avatar(member.id),
          nameInput,
          shortInput,
          el('div', { class: 'grow' }, [colorRow]),
          member.lead
            ? el('span', { class: 'pill', text: '본인' })
            : el('button', {
                class: 'btn btn-sm btn-danger',
                text: '제외',
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
        ])
      );
    });

    card.appendChild(rows);
    return card;
  }

  function addMemberDialog(ctx) {
    const nameInput = el('input', { type: 'text', placeholder: '이름' });
    const shortInput = el('input', { type: 'text', placeholder: '이니셜 (예: SK)', maxlength: '3' });

    ui.modal({
      title: '팀원 추가',
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        el('div', { class: 'field' }, [el('label', { text: '이름' }), nameInput]),
        el('div', { class: 'field' }, [el('label', { text: '이니셜' }), shortInput]),
      ]),
      footer(foot, close) {
        foot.appendChild(el('button', { class: 'btn', text: '취소', onClick: close }));
        foot.appendChild(
          el('button', {
            class: 'btn btn-primary',
            text: '추가',
            onClick: () => {
              const name = nameInput.value.trim();
              if (!name) { nameInput.focus(); return; }
              S.addMember(name, shortInput.value.trim());
              close();
              ctx.rerender();
              ui.toast(name + ' 님을 추가했습니다.');
            },
          })
        );
      },
      onOpen: () => nameInput.focus(),
    });
  }

  A.views = A.views || {};
  A.views.team = { title: '팀', render };
})(window);
