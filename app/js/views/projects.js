/* PROJECTS — 프로젝트별 촬영 → 편집 → 피드백 → 납품 진행 현황 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;
  const icon = A.icon;

  const FILTERS = [
    { id: 'all', label: '전체' },
    { id: 'active', label: '진행중' },
    { id: 'done', label: '완료' },
  ];

  function render(root, ctx) {
    const state = ctx.state;
    if (!state.projectFilter) state.projectFilter = 'all';

    const chips = el('div', { class: 'filter-chips' });
    FILTERS.forEach((f) => {
      chips.appendChild(el('button', {
        class: 'filter-chip' + (state.projectFilter === f.id ? ' on' : ''),
        text: f.label,
        onClick: () => { state.projectFilter = f.id; ctx.rerender(); },
      }));
    });

    root.appendChild(
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' } }, [
        chips,
        el('div', { style: { flex: '1' } }),
        el('button', {
          class: 'btn btn-primary',
          onClick: () => projectDialog(null, ctx),
        }, [icon('plus', 13), '프로젝트 추가']),
      ])
    );

    const projects = S.projects().filter((p) => {
      if (state.projectFilter === 'all') return true;
      const stats = S.projectStats(p.id);
      const finished = stats.total > 0 && stats.done === stats.total;
      return state.projectFilter === 'done' ? finished : !finished;
    });

    if (!projects.length) {
      root.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'empty', text: '해당하는 프로젝트가 없습니다.' }),
      ]));
      return;
    }

    const grid = el('div', { class: 'proj-grid' });
    projects.forEach((p) => grid.appendChild(projectCard(p, ctx)));
    root.appendChild(grid);
  }

  /* ------------------------------------------------------------------ */

  function projectCard(project, ctx) {
    const stats = S.projectStats(project.id);

    /* 상태별 비중을 한 줄 막대로 */
    const stack = el('div', { class: 'stack-bar' });
    if (stats.total) {
      A.STATUSES.forEach((st) => {
        const n = stats.byStatus[st.id];
        if (!n) return;
        stack.appendChild(el('span', {
          style: { width: (n / stats.total) * 100 + '%', background: st.color },
          title: st.label + ' ' + n + '건',
        }));
      });
    }

    const pipeline = el('div', { class: 'pipeline' });
    A.STATUSES.forEach((st) => {
      const n = stats.byStatus[st.id];
      if (!n) return;
      pipeline.appendChild(el('div', { class: 'pipeline-row' }, [
        el('span', { class: 'dot', style: { background: st.color } }),
        el('span', { class: 'lbl', text: st.label }),
        el('span', { class: 'n', text: String(n) }),
      ]));
    });

    return el('div', {
      class: 'card proj-card',
      onClick: () => projectDetail(project, ctx),
    }, [
      el('div', { class: 'proj-top' }, [
        el('div', {
          class: 'proj-thumb',
          style: { background: project.color },
          text: project.name.slice(0, 2),
        }),
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'proj-name', text: project.name }),
          el('div', { class: 'proj-sub', text: project.subtitle || '' }),
        ]),
        el('div', { style: { textAlign: 'right' } }, [
          el('div', { style: { fontSize: '15px', fontWeight: '700' }, class: 'mono',
            text: stats.done + ' / ' + stats.total }),
          el('div', { class: 'faint', text: '완료' }),
        ]),
      ]),
      stats.total ? stack : el('div', { class: 'bar' }),
      stats.total
        ? el('div', { style: { marginTop: '11px' } }, [pipeline])
        : el('div', { class: 'empty', style: { padding: '14px' }, text: '아직 등록된 일정이 없습니다.' }),
    ]);
  }

  /* ------------------------------------------------------------------ */
  /* 프로젝트 상세 — 상태별로 묶어 보여준다                              */
  /* ------------------------------------------------------------------ */

  function projectDetail(project, ctx) {
    const stats = S.projectStats(project.id);
    const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });

    body.appendChild(el('div', { class: 'proj-top', style: { margin: '0' } }, [
      el('div', { class: 'proj-thumb', style: { background: project.color }, text: project.name.slice(0, 2) }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'proj-name', text: project.name }),
        el('div', { class: 'proj-sub', text: project.subtitle || '' }),
      ]),
      el('button', {
        class: 'btn btn-sm',
        text: '편집',
        onClick: () => projectDialog(project, ctx),
      }),
    ]));

    if (!stats.total) {
      body.appendChild(el('div', { class: 'empty', text: '이 프로젝트에 등록된 일정이 없습니다.' }));
    } else {
      A.STATUSES.forEach((st) => {
        const group = stats.events
          .filter((ev) => (ev.status || 'plan') === st.id)
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        if (!group.length) return;

        const section = el('div');
        section.appendChild(el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px' },
        }, [
          el('span', { class: 'dot', style: { background: st.color } }),
          el('span', { style: { fontSize: '12px', fontWeight: '700' }, text: st.label }),
          el('span', { class: 'faint', text: group.length + '건' }),
        ]));

        // 여기서는 시각보다 날짜가 중요하므로 전용 행을 쓴다
        const list = el('div', { class: 'ev-list' });
        group.forEach((ev) => {
          list.appendChild(
            el('div', {
              class: 'ev' + (ev.done ? ' done' : ''),
              style: { borderLeftColor: A.eventColor(ev) },
              onClick: () => A.eventEditor(ev, { date: ev.date, onSaved: ctx.rerender }),
            }, [
              el('span', { class: 'ev-time', text: U.fmtShort(ev.date) + ' ' + U.WEEKDAYS[U.dayOfWeek(ev.date)] }),
              el('div', { class: 'ev-body' }, [
                el('span', { class: 'ev-title', text: ev.title }),
                ev.allDay ? null : el('span', { class: 'ev-sub', text: U.fmtTimeRange(ev) }),
              ]),
              el('div', { class: 'ev-right' }, [
                ev.deadline ? ui.tag('마감', A.ACCENT_DEADLINE) : null,
                ui.avatarStack(ev.members, 22),
              ]),
            ])
          );
        });
        section.appendChild(list);
        body.appendChild(section);
      });
    }

    ui.modal({
      title: '프로젝트 현황',
      wide: true,
      body,
      footer(foot, close) {
        foot.appendChild(el('button', {
          class: 'btn',
          onClick: () => { close(); A.quickAdd({ projectId: project.id, onSaved: ctx.rerender }); },
        }, [icon('plus', 13), '이 프로젝트에 일정 추가']));
        foot.appendChild(el('div', { class: 'spacer' }));
        foot.appendChild(el('button', { class: 'btn btn-primary', text: '닫기', onClick: close }));
      },
    });
  }

  /* ------------------------------------------------------------------ */

  function projectDialog(existing, ctx) {
    const isNew = !existing;
    const nameInput = el('input', { type: 'text', class: 'quick-title', placeholder: '프로젝트 이름' });
    const subInput = el('input', { type: 'text', placeholder: '예) 청년 인터뷰 시리즈' });
    nameInput.value = existing ? existing.name : '';
    subInput.value = existing ? existing.subtitle || '' : '';

    let color = existing ? existing.color : A.MEMBER_PALETTE[0];
    const colorRow = el('div', { class: 'filter-chips' });
    A.MEMBER_PALETTE.forEach((c) => {
      const swatch = el('button', {
        class: 'filter-chip',
        type: 'button',
        style: {
          width: '26px', height: '26px', padding: '0', borderRadius: '50%',
          background: c,
          borderColor: color === c ? 'var(--text)' : 'transparent',
          borderWidth: color === c ? '2px' : '1px',
        },
        onClick: () => {
          color = c;
          U.$$('.filter-chip', colorRow).forEach((s, i) => {
            s.style.borderColor = A.MEMBER_PALETTE[i] === c ? 'var(--text)' : 'transparent';
            s.style.borderWidth = A.MEMBER_PALETTE[i] === c ? '2px' : '1px';
          });
        },
      });
      colorRow.appendChild(swatch);
    });

    ui.modal({
      title: isNew ? '새 프로젝트' : '프로젝트 편집',
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '13px' } }, [
        nameInput,
        el('div', { class: 'field' }, [el('label', { text: '설명' }), subInput]),
        el('div', { class: 'field' }, [el('label', { text: '색' }), colorRow]),
      ]),
      footer(foot, close) {
        if (!isNew) {
          foot.appendChild(el('button', {
            class: 'btn btn-danger', text: '보관',
            title: '목록에서 숨깁니다. 기존 일정은 그대로 남습니다.',
            onClick: async () => {
              const ok = await ui.confirm(
                '“' + existing.name + '” 을 목록에서 보관할까요? 연결된 일정은 그대로 남습니다.',
                { danger: true, confirmLabel: '보관' }
              );
              if (!ok) return;
              S.removeProject(existing.id);
              close();
              ctx.rerender();
            },
          }));
        }
        foot.appendChild(el('div', { class: 'spacer' }));
        foot.appendChild(el('button', { class: 'btn', text: '취소', onClick: close }));
        foot.appendChild(el('button', {
          class: 'btn btn-primary', text: '저장',
          onClick: () => {
            const name = nameInput.value.trim();
            if (!name) { nameInput.focus(); ui.toast('이름을 입력해 주세요.', { type: 'error' }); return; }
            if (isNew) S.addProject({ name, subtitle: subInput.value.trim(), color });
            else S.updateProject(existing.id, { name, subtitle: subInput.value.trim(), color });
            close();
            ctx.rerender();
          },
        }));
      },
      onOpen: () => nameInput.focus(),
    });
  }

  A.views = A.views || {};
  A.views.projects = { title: 'Projects', render };
})(window);
