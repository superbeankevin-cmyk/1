/* 일정 입력 — 빠른 추가(Ctrl+N)와 상세 편집 두 단계로 나눈다.
   빠른 추가는 5초 안에 끝나야 하고, 나머지 항목은 상세에서 만진다. */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;
  const S = A.store;
  const ui = A.ui;
  const el = U.el;
  const icon = A.icon;

  /* ---------------------------------------------------------------- */
  /* 공통 조각                                                         */
  /* ---------------------------------------------------------------- */

  /** 토글 칩 묶음. selected 는 배열(다중) 또는 문자열(단일). */
  function chipGroup(items, selected, opts) {
    const o = opts || {};
    const multi = Array.isArray(selected);
    const chosen = multi ? selected.slice() : selected;
    const row = el('div', { class: 'filter-chips' });
    const state = { value: chosen };

    items.forEach((item) => {
      const isOn = multi ? state.value.includes(item.id) : state.value === item.id;
      const chip = el('button', {
        class: 'filter-chip' + (isOn ? ' on' : ''),
        type: 'button',
        style: isOn ? { borderColor: item.color, background: item.color + '14' } : {},
        onClick: () => {
          if (multi) {
            const i = state.value.indexOf(item.id);
            if (i >= 0) state.value.splice(i, 1);
            else state.value.push(item.id);
            paint();
          } else {
            state.value = state.value === item.id && o.clearable ? '' : item.id;
            paint();
          }
          if (o.onChange) o.onChange(state.value);
        },
      }, [
        item.color ? el('span', { class: 'dot', style: { background: item.color } }) : null,
        item.label,
      ]);
      chip.dataset.id = item.id;
      row.appendChild(chip);
    });

    function paint() {
      U.$$('.filter-chip', row).forEach((chip) => {
        const item = items.find((x) => x.id === chip.dataset.id);
        const on = multi ? state.value.includes(item.id) : state.value === item.id;
        chip.classList.toggle('on', on);
        chip.style.borderColor = on && item.color ? item.color : '';
        chip.style.background = on && item.color ? item.color + '14' : '';
      });
    }

    row.getValue = () => state.value;
    return row;
  }

  const memberItems = () => S.members().map((m) => ({ id: m.id, label: m.name, color: m.color }));
  const projectItems = () => S.projects().map((p) => ({ id: p.id, label: p.name, color: p.color }));
  const statusItems = () => A.STATUSES.map((st) => ({ id: st.id, label: st.label, color: st.color }));
  const categoryItems = () => A.CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color }));

  /* ================================================================ */
  /* 빠른 추가 — Ctrl+N (일정) / Ctrl+Shift+N (할 일)                  */
  /* ================================================================ */

  function quickAdd(opts) {
    const o = opts || {};
    let mode = o.mode === 'task' ? 'task' : 'event';

    const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '13px' } });

    /* 탭 */
    const tabEvent = el('button', { class: mode === 'event' ? 'active' : '', text: '일정' });
    const tabTask = el('button', { class: mode === 'task' ? 'active' : '', text: '할 일' });
    const tabs = el('div', { class: 'tabs' }, [tabEvent, tabTask]);
    body.appendChild(tabs);

    /* 제목 */
    const titleInput = el('input', {
      type: 'text',
      class: 'quick-title',
      placeholder: mode === 'event' ? '무슨 일정인가요?' : '무슨 일을 해야 하나요?',
    });
    body.appendChild(titleInput);

    /* 날짜 · 시간 */
    const dateInput = el('input', { type: 'date', value: o.date || U.today() });
    const timeInput = el('input', { type: 'time', value: o.start || '' });

    const quickDate = (label, key) =>
      el('button', {
        class: 'btn btn-sm btn-quiet', type: 'button', text: label,
        onClick: () => { dateInput.value = key; },
      });

    const whenRow = el('div', {}, [
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('label', { text: '날짜' }), dateInput]),
        el('div', { class: 'field' }, [el('label', { text: '시간 (비우면 종일)' }), timeInput]),
      ]),
      el('div', { style: { display: 'flex', gap: '2px', marginTop: '6px' } }, [
        quickDate('오늘', U.today()),
        quickDate('내일', U.addDays(U.today(), 1)),
        quickDate('모레', U.addDays(U.today(), 2)),
      ]),
    ]);
    body.appendChild(whenRow);

    /* 프로젝트 · 담당 (일정 전용) */
    const projectChips = chipGroup(projectItems(), o.projectId || '', { clearable: true });
    const memberChips = chipGroup(memberItems(), (o.members || []).slice());

    const projectField = el('div', { class: 'field' }, [el('label', { text: '프로젝트' }), projectChips]);
    const memberField = el('div', { class: 'field' }, [el('label', { text: '담당' }), memberChips]);
    body.appendChild(projectField);
    body.appendChild(memberField);

    /* 메모 — 필요할 때만 펼친다 */
    const noteInput = el('textarea', { placeholder: '메모' });
    const noteField = el('div', { class: 'field' }, [el('label', { text: '메모' }), noteInput]);
    noteField.style.display = 'none';
    const noteToggle = el('button', {
      class: 'btn btn-sm btn-quiet', type: 'button',
      onClick: () => {
        noteField.style.display = 'flex';
        noteToggle.style.display = 'none';
        noteInput.focus();
      },
    }, [icon('plus', 12), '메모 추가']);
    body.appendChild(noteToggle);
    body.appendChild(noteField);

    /* 모드 전환 */
    function setMode(next) {
      mode = next;
      tabEvent.classList.toggle('active', mode === 'event');
      tabTask.classList.toggle('active', mode === 'task');
      const isEvent = mode === 'event';
      projectField.style.display = isEvent ? 'flex' : 'none';
      memberField.style.display = isEvent ? 'flex' : 'none';
      timeInput.parentElement.style.display = isEvent ? 'flex' : 'none';
      noteToggle.style.display = isEvent && noteField.style.display === 'none' ? 'inline-flex' : 'none';
      if (!isEvent) noteField.style.display = 'none';
      titleInput.placeholder = isEvent ? '무슨 일정인가요?' : '무슨 일을 해야 하나요?';
      titleInput.focus();
    }
    tabEvent.addEventListener('click', () => setMode('event'));
    tabTask.addEventListener('click', () => setMode('task'));

    const close = ui.modal({
      title: '빠른 추가',
      headRight: el('span', { class: 'quick-hint' }, [el('kbd', { text: 'Ctrl' }), el('kbd', { text: '↵' }), '저장']),
      body,
      footer(foot, closeModal) {
        foot.appendChild(el('button', { class: 'btn', text: '취소', onClick: closeModal }));
        foot.appendChild(el('button', { class: 'btn btn-primary', text: '추가', onClick: () => submit(closeModal) }));
      },
      onOpen: () => setMode(mode),
    });

    function submit(closeModal) {
      const title = titleInput.value.trim();
      if (!title) { titleInput.focus(); ui.toast('내용을 입력해 주세요.', { type: 'error' }); return; }
      const dateKey = dateInput.value || U.today();

      if (mode === 'task') {
        S.addTask(dateKey, title);
        closeModal();
        if (o.onSaved) o.onSaved();
        ui.toast(
          dateKey === U.today() ? '오늘 할 일에 추가했습니다.' : U.fmtShort(dateKey) + ' 할 일에 추가했습니다.'
        );
        return;
      }

      const start = timeInput.value;
      S.addEvent({
        title,
        date: dateKey,
        allDay: !start,
        start: start || '',
        end: start ? addHour(start) : '',
        projectId: projectChips.getValue() || '',
        members: memberChips.getValue(),
        note: noteInput.value.trim(),
        status: 'plan',
      });
      closeModal();
      if (o.onSaved) o.onSaved();
      ui.toast('일정을 추가했습니다.');
    }

    // 제목 칸에서 Enter 만 눌러도 바로 저장 (5초 안에 끝내기)
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(close); }
    });

    return close;
  }

  function addHour(hhmm) {
    const mins = U.toMinutes(hhmm) + 60;
    return U.pad(Math.floor(mins / 60) % 24) + ':' + U.pad(mins % 60);
  }

  /* ================================================================ */
  /* 상세 편집                                                         */
  /* ================================================================ */

  function eventEditor(existing, opts) {
    const o = opts || {};
    const isNew = !existing || !existing.id;
    const draft = Object.assign(
      {
        title: '', date: o.date || U.today(), endDate: '', allDay: true,
        start: '', end: '', members: [], projectId: '', status: 'plan',
        category: 'etc', note: '', place: '', deadline: false, done: false,
        repeat: 'none', repeatUntil: '',
      },
      existing || {}
    );

    const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '13px' } });

    const titleInput = el('input', { type: 'text', class: 'quick-title', placeholder: '일정 이름' });
    titleInput.value = draft.title;
    body.appendChild(titleInput);

    const projectChips = chipGroup(projectItems(), draft.projectId || '', { clearable: true });
    body.appendChild(el('div', { class: 'field' }, [el('label', { text: '프로젝트' }), projectChips]));

    const memberChips = chipGroup(memberItems(), (draft.members || []).slice());
    body.appendChild(el('div', { class: 'field' }, [el('label', { text: '담당' }), memberChips]));

    const statusChips = chipGroup(statusItems(), draft.status || 'plan');
    body.appendChild(el('div', { class: 'field' }, [el('label', { text: '상태' }), statusChips]));

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
    const syncTime = () => { timeFields.style.display = allDayBox.checked ? 'none' : 'grid'; };
    allDayBox.addEventListener('change', syncTime);
    syncTime();

    body.appendChild(el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', { text: '시작 날짜' }), dateInput]),
      el('div', { class: 'field' }, [el('label', { text: '종료 날짜' }), endDateInput]),
    ]));
    body.appendChild(el('label', { class: 'switch' }, [allDayBox, el('span', { text: '종일 일정' })]));
    body.appendChild(timeFields);

    /* 장소 / 종류 / 반복 */
    const placeInput = el('input', { type: 'text', placeholder: '예) 3스튜디오, 클라이언트 사옥' });
    placeInput.value = draft.place || '';
    body.appendChild(el('div', { class: 'field' }, [el('label', { text: '장소' }), placeInput]));

    const categoryChips = chipGroup(categoryItems(), draft.category || 'etc');
    body.appendChild(el('div', { class: 'field' }, [el('label', { text: '종류' }), categoryChips]));

    const repeatSelect = el('select', {}, [
      el('option', { value: 'none', text: '반복 없음' }),
      el('option', { value: 'daily', text: '매일' }),
      el('option', { value: 'weekly', text: '매주' }),
      el('option', { value: 'biweekly', text: '격주' }),
      el('option', { value: 'monthly', text: '매월' }),
    ]);
    repeatSelect.value = draft.repeat || 'none';
    const repeatUntilInput = el('input', { type: 'date', value: draft.repeatUntil || '' });
    const repeatUntilField = el('div', { class: 'field' }, [el('label', { text: '반복 종료일' }), repeatUntilInput]);
    const syncRepeat = () => { repeatUntilField.style.display = repeatSelect.value === 'none' ? 'none' : 'flex'; };
    repeatSelect.addEventListener('change', syncRepeat);
    syncRepeat();
    body.appendChild(el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', { text: '반복' }), repeatSelect]),
      repeatUntilField,
    ]));

    const noteInput = el('textarea', { placeholder: '준비물, 클라이언트 요청사항, 유의점…' });
    noteInput.value = draft.note || '';
    body.appendChild(el('div', { class: 'field' }, [el('label', { text: '메모' }), noteInput]));

    const deadlineBox = el('input', { type: 'checkbox' });
    deadlineBox.checked = Boolean(draft.deadline);
    const doneBox = el('input', { type: 'checkbox' });
    doneBox.checked = Boolean(draft.done);
    body.appendChild(el('div', { style: { display: 'flex', gap: '18px' } }, [
      el('label', { class: 'switch' }, [deadlineBox, el('span', { text: '중요 마감 (빨간색으로 표시)' })]),
      el('label', { class: 'switch' }, [doneBox, el('span', { text: '완료' })]),
    ]));

    function collect() {
      return {
        title: titleInput.value.trim(),
        date: dateInput.value || U.today(),
        endDate: endDateInput.value || '',
        allDay: allDayBox.checked,
        start: allDayBox.checked ? '' : startInput.value,
        end: allDayBox.checked ? '' : endInput.value,
        members: memberChips.getValue(),
        projectId: projectChips.getValue() || '',
        status: statusChips.getValue(),
        category: categoryChips.getValue(),
        note: noteInput.value.trim(),
        place: placeInput.value.trim(),
        deadline: deadlineBox.checked,
        done: doneBox.checked,
        repeat: repeatSelect.value,
        repeatUntil: repeatSelect.value === 'none' ? '' : repeatUntilInput.value,
      };
    }

    ui.modal({
      title: isNew ? '새 일정' : '일정 수정',
      wide: true,
      body,
      footer(foot, closeModal) {
        if (!isNew) {
          foot.appendChild(el('button', {
            class: 'btn btn-danger', text: '삭제',
            onClick: async () => {
              const ok = await ui.confirm('“' + existing.title + '” 일정을 삭제할까요?', {
                danger: true, confirmLabel: '삭제',
              });
              if (!ok) return;
              const snapshot = Object.assign({}, existing);
              S.removeEvent(existing.id);
              closeModal();
              if (o.onSaved) o.onSaved();
              ui.toast('일정을 삭제했습니다.', {
                actionLabel: '되돌리기',
                onAction: () => { S.data.events.push(snapshot); S.save(); if (o.onSaved) o.onSaved(); },
              });
            },
          }));
        }
        foot.appendChild(el('div', { class: 'spacer' }));
        foot.appendChild(el('button', { class: 'btn', text: '취소', onClick: closeModal }));
        foot.appendChild(el('button', {
          class: 'btn btn-primary', text: '저장',
          onClick: () => {
            const values = collect();
            if (!values.title) { titleInput.focus(); ui.toast('일정 이름을 적어주세요.', { type: 'error' }); return; }
            if (values.endDate && values.endDate < values.date) {
              ui.toast('종료 날짜가 시작 날짜보다 빠릅니다.', { type: 'error' }); return;
            }
            if (!values.allDay && values.start && values.end && values.end < values.start
                && (!values.endDate || values.endDate === values.date)) {
              ui.toast('종료 시각이 시작 시각보다 빠릅니다.', { type: 'error' }); return;
            }
            if (isNew) S.addEvent(values);
            else S.updateEvent(existing.id, values);
            closeModal();
            if (o.onSaved) o.onSaved();
            ui.toast(isNew ? '일정을 추가했습니다.' : '수정했습니다.');
          },
        }));
      },
      onOpen: () => titleInput.focus(),
    });
  }

  A.quickAdd = quickAdd;
  A.eventEditor = eventEditor;
  A.chipGroup = chipGroup;
  A.memberItems = memberItems;
  A.projectItems = projectItems;
})(window);
