/* 화면 곳곳에서 재사용하는 조각들 — 토스트, 모달, 일정 행, 체크리스트 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const el = U.el;

  /* ------------------------------------------------------------------ */
  /* 토스트                                                              */
  /* ------------------------------------------------------------------ */

  function toast(message, opts) {
    const options = opts || {};
    const root = U.$('#toast-root');
    const node = el('div', { class: 'toast' + (options.type === 'error' ? ' error' : '') }, [
      el('span', { text: message }),
      options.actionLabel
        ? el('button', {
            text: options.actionLabel,
            onClick: () => {
              node.remove();
              if (options.onAction) options.onAction();
            },
          })
        : null,
    ]);
    root.appendChild(node);
    setTimeout(() => node.remove(), options.duration || 4200);
    return node;
  }

  /* ------------------------------------------------------------------ */
  /* 모달                                                                */
  /* ------------------------------------------------------------------ */

  function modal(config) {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const box = el('div', { class: 'modal' });

    const close = () => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    };

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    }

    box.appendChild(
      el('div', { class: 'modal-head' }, [
        el('h2', { text: config.title || '' }),
        el('button', { class: 'btn btn-ghost btn-sm', text: '✕', onClick: close }),
      ])
    );

    const body = el('div', { class: 'modal-body' });
    box.appendChild(body);
    if (config.body) body.appendChild(config.body);

    if (config.footer) {
      const foot = el('div', { class: 'modal-foot' });
      box.appendChild(foot);
      config.footer(foot, close);
    }

    backdrop.appendChild(box);
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey);
    U.$('#modal-root').appendChild(backdrop);

    if (config.onOpen) config.onOpen(body, close);
    return close;
  }

  function confirm(message, opts) {
    const options = opts || {};
    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const close = modal({
        title: options.title || '확인',
        body: el('p', { text: message, style: { margin: '0', lineHeight: '1.6' } }),
        footer(foot, closeModal) {
          foot.appendChild(
            el('button', {
              class: 'btn',
              text: '취소',
              onClick: () => { done(false); closeModal(); },
            })
          );
          foot.appendChild(
            el('button', {
              class: 'btn ' + (options.danger ? 'btn-danger' : 'btn-primary'),
              text: options.confirmLabel || '확인',
              onClick: () => { done(true); closeModal(); },
            })
          );
        },
      });
      // 배경 클릭/ESC 로 닫히면 '취소'
      const observer = new MutationObserver(() => {
        if (!document.querySelector('.modal-backdrop')) {
          observer.disconnect();
          done(false);
        }
      });
      observer.observe(U.$('#modal-root'), { childList: true });
      void close;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 작은 조각들                                                          */
  /* ------------------------------------------------------------------ */

  function avatar(memberId, size) {
    const m = S.member(memberId);
    const node = el('span', {
      class: 'avatar',
      title: m ? m.name : '미지정',
      text: m ? m.short : '?',
      style: { background: m ? m.color : '#6b7280' },
    });
    if (size) {
      node.style.width = size + 'px';
      node.style.height = size + 'px';
      node.style.fontSize = Math.round(size * 0.44) + 'px';
    }
    return node;
  }

  function avatarStack(memberIds) {
    const ids = memberIds || [];
    if (!ids.length) return el('span', { class: 'faint', text: '미지정' });
    return el('span', { class: 'avatar-stack' }, ids.slice(0, 4).map((id) => avatar(id)));
  }

  function categoryPill(categoryId) {
    const cat = A.category(categoryId);
    return el('span', {
      class: 'pill',
      text: cat.label,
      style: {
        color: cat.color,
        borderColor: cat.color + '55',
        background: cat.color + '18',
      },
    });
  }

  /** 캘린더 칸 안에 들어가는 한 줄짜리 일정 */
  function eventChip(ev) {
    const color = ev.members && ev.members.length
      ? S.memberColor(ev.members[0])
      : A.category(ev.category).color;
    return el('div', {
      class: 'cal-chip' + (ev.done ? ' done' : ''),
      style: { borderLeftColor: color },
      title: (ev.allDay ? '' : U.fmtTimeRange(ev) + ' ') + ev.title,
      text: (ev.allDay || !ev.start ? '' : ev.start + ' ') + ev.title,
    });
  }

  /** 목록에 들어가는 한 행 */
  function eventRow(ev, dateKey, onChanged) {
    const cat = A.category(ev.category);
    const color = ev.members && ev.members.length ? S.memberColor(ev.members[0]) : cat.color;

    const row = el(
      'div',
      {
        class: 'event-row' + (ev.done ? ' done' : ''),
        style: { borderLeftColor: color },
        onClick: () => eventEditor(ev, { date: dateKey, onSaved: onChanged }),
      },
      [
        el('span', { class: 'event-time mono', text: U.fmtTimeRange(ev) }),
        el('span', { class: 'event-title', text: (cat.icon ? cat.icon + ' ' : '') + ev.title }),
        el('span', { class: 'event-meta' }, [
          ev.place ? el('span', { class: 'faint', text: '📍' + ev.place }) : null,
          categoryPill(ev.category),
          avatarStack(ev.members),
        ]),
      ]
    );
    return row;
  }

  /* ------------------------------------------------------------------ */
  /* 체크리스트                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * 하루치 체크리스트 위젯. 그날 화면 어디에 놓아도 동작한다.
   * onChanged 는 진행률 같은 바깥 표시를 갱신하라는 신호.
   */
  function taskList(dateKey, opts) {
    const options = opts || {};
    const wrap = el('div');

    function render() {
      U.clear(wrap);
      const tasks = S.tasksFor(dateKey);

      if (!tasks.length) {
        wrap.appendChild(
          el('div', { class: 'empty', text: options.emptyText || '오늘 챙길 일을 적어두세요.' })
        );
      } else {
        const list = el('div', { class: 'task-list' });
        tasks.forEach((task, index) => list.appendChild(taskRow(task, index, tasks.length)));
        wrap.appendChild(list);
      }

      if (options.allowAdd !== false) wrap.appendChild(addBox());
      if (options.onChanged) options.onChanged();
    }

    function taskRow(task, index, total) {
      const text = el('textarea', {
        class: 'task-text',
        rows: 1,
        value: task.text,
      });
      text.value = task.text;

      const autosize = () => {
        text.style.height = 'auto';
        text.style.height = text.scrollHeight + 'px';
      };
      requestAnimationFrame(autosize);
      text.addEventListener('input', autosize);
      text.addEventListener('blur', () => {
        const next = text.value.trim();
        if (!next) {
          S.removeTask(dateKey, task.id);
          render();
        } else if (next !== task.text) {
          S.updateTask(dateKey, task.id, { text: next });
        }
      });
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          text.blur();
        }
      });

      const row = el('div', { class: 'task-row' + (task.done ? ' done' : '') }, [
        el('button', {
          class: 'task-check',
          text: '✓',
          title: '완료 표시',
          onClick: () => {
            S.updateTask(dateKey, task.id, { done: !task.done });
            render();
          },
        }),
        text,
        task.routineId ? el('span', { class: 'task-badge', text: '루틴' }) : null,
        task.carriedFrom
          ? el('span', {
              class: 'task-badge carried',
              text: U.fmtShort(task.carriedFrom) + ' 이월',
              title: task.carriedFrom + ' 에서 넘어온 일',
            })
          : null,
        task.memberId ? avatar(task.memberId, 18) : null,
        el('div', { class: 'task-tools' }, [
          index > 0
            ? el('button', { text: '↑', title: '위로', onClick: () => { S.reorderTask(dateKey, task.id, -1); render(); } })
            : null,
          index < total - 1
            ? el('button', { text: '↓', title: '아래로', onClick: () => { S.reorderTask(dateKey, task.id, 1); render(); } })
            : null,
          el('button', {
            text: '→',
            title: '내일로 미루기',
            onClick: () => {
              S.moveTask(dateKey, task.id, U.addDays(dateKey, 1));
              render();
              toast('내일로 넘겼습니다.', {
                actionLabel: '되돌리기',
                onAction: () => {
                  S.moveTask(U.addDays(dateKey, 1), task.id, dateKey);
                  render();
                },
              });
            },
          }),
          el('button', {
            text: '✕',
            title: '삭제',
            onClick: () => {
              const snapshot = Object.assign({}, task);
              S.removeTask(dateKey, task.id);
              render();
              toast('삭제했습니다.', {
                actionLabel: '되돌리기',
                onAction: () => {
                  S.tasksFor(dateKey).splice(index, 0, snapshot);
                  S.save();
                  render();
                },
              });
            },
          }),
        ]),
      ]);
      return row;
    }

    function addBox() {
      const input = el('input', {
        type: 'text',
        placeholder: '할 일 추가 후 Enter',
      });
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const value = input.value.trim();
        if (!value) return;
        S.addTask(dateKey, value);
        input.value = '';
        render();
        // 연속 입력을 위해 포커스 유지
        requestAnimationFrame(() => {
          const next = wrap.querySelector('.task-add input');
          if (next) next.focus();
        });
      });
      return el('div', { class: 'task-add' }, [el('span', { class: 'faint', text: '+' }), input]);
    }

    wrap.focusAdd = () => {
      const input = wrap.querySelector('.task-add input');
      if (input) input.focus();
    };
    wrap.rerender = render;
    render();
    return wrap;
  }

  function taskProgress(dateKey) {
    const tasks = S.tasksFor(dateKey);
    const done = tasks.filter((t) => t.done).length;
    return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  }

  /* ------------------------------------------------------------------ */
  /* 일정 편집 모달                                                       */
  /* ------------------------------------------------------------------ */

  function eventEditor(existing, opts) {
    const options = opts || {};
    const isNew = !existing || !existing.id;
    const draft = Object.assign(
      {
        title: '',
        date: options.date || U.today(),
        endDate: '',
        allDay: true,
        start: '',
        end: '',
        members: [],
        category: 'shoot',
        note: '',
        place: '',
        done: false,
        repeat: 'none',
        repeatUntil: '',
      },
      existing || {}
    );
    draft.members = (draft.members || []).slice();

    const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });

    /* 제목 */
    const titleInput = el('input', { type: 'text', value: draft.title, placeholder: '예) 브랜드필름 A안 촬영' });
    titleInput.value = draft.title;
    body.appendChild(el('div', { class: 'field' }, [el('label', { text: '일정 이름' }), titleInput]));

    /* 종류 */
    const catRow = el('div', { class: 'chip-row' });
    A.CATEGORIES.forEach((cat) => {
      const chip = el('button', {
        class: 'chip' + (draft.category === cat.id ? ' on' : ''),
        type: 'button',
        onClick: () => {
          draft.category = cat.id;
          U.$$('.chip', catRow).forEach((c) => c.classList.remove('on'));
          chip.classList.add('on');
          chip.style.borderColor = cat.color;
        },
      }, [el('span', { class: 'dot', style: { background: cat.color } }), cat.label]);
      if (draft.category === cat.id) chip.style.borderColor = cat.color;
      catRow.appendChild(chip);
    });
    body.appendChild(el('div', { class: 'field' }, [el('label', { text: '종류' }), catRow]));

    /* 담당 */
    const memberRow = el('div', { class: 'chip-row' });
    S.members().forEach((m) => {
      const on = draft.members.includes(m.id);
      const chip = el('button', {
        class: 'chip' + (on ? ' on' : ''),
        type: 'button',
        style: on ? { borderColor: m.color } : {},
        onClick: () => {
          const idx = draft.members.indexOf(m.id);
          if (idx >= 0) {
            draft.members.splice(idx, 1);
            chip.classList.remove('on');
            chip.style.borderColor = '';
          } else {
            draft.members.push(m.id);
            chip.classList.add('on');
            chip.style.borderColor = m.color;
          }
        },
      }, [el('span', { class: 'dot', style: { background: m.color } }), m.name]);
      memberRow.appendChild(chip);
    });
    body.appendChild(el('div', { class: 'field' }, [el('label', { text: '담당 (여러 명 선택 가능)' }), memberRow]));

    /* 날짜 / 시간 */
    const dateInput = el('input', { type: 'date', value: draft.date });
    const endDateInput = el('input', { type: 'date', value: draft.endDate || '' });
    const startInput = el('input', { type: 'time', value: draft.start || '' });
    const endInput = el('input', { type: 'time', value: draft.end || '' });

    const allDayBox = el('input', { type: 'checkbox' });
    allDayBox.checked = Boolean(draft.allDay);
    const timeFields = el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', { text: '시작 시각' }), startInput]),
      el('div', { class: 'field' }, [el('label', { text: '종료 시각' }), endInput]),
    ]);
    const syncTimeFields = () => {
      timeFields.style.display = allDayBox.checked ? 'none' : 'grid';
    };
    allDayBox.addEventListener('change', syncTimeFields);
    syncTimeFields();

    body.appendChild(
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('label', { text: '시작 날짜' }), dateInput]),
        el('div', { class: 'field' }, [el('label', { text: '종료 날짜 (여러 날이면)' }), endDateInput]),
      ])
    );
    body.appendChild(
      el('label', { class: 'switch' }, [allDayBox, el('span', { text: '종일 일정' })])
    );
    body.appendChild(timeFields);

    /* 장소 / 반복 */
    const placeInput = el('input', { type: 'text', placeholder: '예) 3스튜디오, 클라이언트 사옥' });
    placeInput.value = draft.place || '';

    const repeatSelect = el('select', {}, [
      el('option', { value: 'none', text: '반복 없음' }),
      el('option', { value: 'daily', text: '매일' }),
      el('option', { value: 'weekly', text: '매주' }),
      el('option', { value: 'biweekly', text: '격주' }),
      el('option', { value: 'monthly', text: '매월' }),
    ]);
    repeatSelect.value = draft.repeat || 'none';

    const repeatUntilInput = el('input', { type: 'date', value: draft.repeatUntil || '' });
    const repeatUntilField = el('div', { class: 'field' }, [
      el('label', { text: '반복 종료일' }),
      repeatUntilInput,
    ]);
    const syncRepeat = () => {
      repeatUntilField.style.display = repeatSelect.value === 'none' ? 'none' : 'flex';
    };
    repeatSelect.addEventListener('change', syncRepeat);
    syncRepeat();

    body.appendChild(
      el('div', { class: 'field-row three' }, [
        el('div', { class: 'field' }, [el('label', { text: '장소' }), placeInput]),
        el('div', { class: 'field' }, [el('label', { text: '반복' }), repeatSelect]),
        repeatUntilField,
      ])
    );

    /* 메모 */
    const noteInput = el('textarea', { placeholder: '준비물, 클라이언트 요청사항, 유의점…' });
    noteInput.value = draft.note || '';
    body.appendChild(el('div', { class: 'field' }, [el('label', { text: '메모' }), noteInput]));

    /* 완료 */
    const doneBox = el('input', { type: 'checkbox' });
    doneBox.checked = Boolean(draft.done);
    body.appendChild(el('label', { class: 'switch' }, [doneBox, el('span', { text: '완료된 일정' })]));

    function collect() {
      return {
        title: titleInput.value.trim(),
        date: dateInput.value || U.today(),
        endDate: endDateInput.value || '',
        allDay: allDayBox.checked,
        start: allDayBox.checked ? '' : startInput.value,
        end: allDayBox.checked ? '' : endInput.value,
        members: draft.members.slice(),
        category: draft.category,
        note: noteInput.value.trim(),
        place: placeInput.value.trim(),
        done: doneBox.checked,
        repeat: repeatSelect.value,
        repeatUntil: repeatSelect.value === 'none' ? '' : repeatUntilInput.value,
      };
    }

    const close = modal({
      title: isNew ? '새 일정' : '일정 수정',
      body,
      footer(foot, closeModal) {
        if (!isNew) {
          foot.appendChild(
            el('button', {
              class: 'btn btn-danger',
              text: '삭제',
              onClick: async () => {
                const ok = await confirm('“' + existing.title + '” 일정을 삭제할까요?', {
                  danger: true,
                  confirmLabel: '삭제',
                });
                if (!ok) return;
                const snapshot = Object.assign({}, existing);
                S.removeEvent(existing.id);
                closeModal();
                if (options.onSaved) options.onSaved();
                toast('일정을 삭제했습니다.', {
                  actionLabel: '되돌리기',
                  onAction: () => {
                    S.data.events.push(snapshot);
                    S.save();
                    if (options.onSaved) options.onSaved();
                  },
                });
              },
            })
          );
        }
        foot.appendChild(el('div', { class: 'spacer' }));
        foot.appendChild(el('button', { class: 'btn', text: '취소', onClick: closeModal }));
        foot.appendChild(
          el('button', {
            class: 'btn btn-primary',
            text: '저장',
            onClick: () => {
              const values = collect();
              if (!values.title) {
                titleInput.focus();
                toast('일정 이름을 적어주세요.', { type: 'error' });
                return;
              }
              if (values.endDate && values.endDate < values.date) {
                toast('종료 날짜가 시작 날짜보다 빠릅니다.', { type: 'error' });
                return;
              }
              if (!values.allDay && values.start && values.end && values.end < values.start
                  && (!values.endDate || values.endDate === values.date)) {
                toast('종료 시각이 시작 시각보다 빠릅니다.', { type: 'error' });
                return;
              }
              if (isNew) S.addEvent(values);
              else S.updateEvent(existing.id, values);
              closeModal();
              if (options.onSaved) options.onSaved();
              toast(isNew ? '일정을 추가했습니다.' : '수정했습니다.');
            },
          })
        );
      },
      onOpen() {
        titleInput.focus();
      },
    });

    // Ctrl+Enter 로 빠르게 저장
    body.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const saveBtn = Array.from(document.querySelectorAll('.modal-foot .btn-primary')).pop();
        if (saveBtn) saveBtn.click();
      }
    });

    return close;
  }

  A.ui = {
    toast, modal, confirm,
    avatar, avatarStack, categoryPill,
    eventChip, eventRow,
    taskList, taskProgress,
    eventEditor,
  };
})(window);
