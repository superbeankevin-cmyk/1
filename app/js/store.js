/* 데이터 모델 + 저장소. 데스크톱이면 파일, 브라우저면 localStorage. */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;

  const SCHEMA_VERSION = 1;
  const LS_KEY = 'klkong-part2-assistant';

  /* 제작 파트 일이 실제로 굴러가는 단위들 */
  const CATEGORIES = [
    { id: 'plan', label: '기획/구성', color: '#8b7cf6', icon: '📝' },
    { id: 'shoot', label: '촬영', color: '#f97362', icon: '🎬' },
    { id: 'edit', label: '편집', color: '#3b9df8', icon: '✂️' },
    { id: 'review', label: '시사/피드백', color: '#f0b429', icon: '👀' },
    { id: 'deliver', label: '납품/업로드', color: '#2fb47c', icon: '🚀' },
    { id: 'meeting', label: '회의', color: '#64748b', icon: '💬' },
    { id: 'off', label: '휴가/연차', color: '#94a3b8', icon: '🌴' },
    { id: 'etc', label: '기타', color: '#a1a1aa', icon: '•' },
  ];

  const MEMBER_PALETTE = [
    '#f97362', '#3b9df8', '#2fb47c', '#a855f7',
    '#f0b429', '#14b8a6', '#ec4899', '#8b7cf6',
  ];

  function defaultData() {
    return {
      version: SCHEMA_VERSION,
      members: [
        { id: 'me', name: '나 (파트장)', short: 'ME', color: '#e11d48', active: true, lead: true },
        { id: 'sk', name: '조성경', short: 'SK', color: '#f97362', active: true },
        { id: 'jh', name: '박정현', short: 'JH', color: '#3b9df8', active: true },
        { id: 'sb', name: '임승빈', short: 'SB', color: '#2fb47c', active: true },
        { id: 'jy', name: '권지연', short: 'JY', color: '#a855f7', active: true },
      ],
      events: [],
      checklists: {},
      routines: [],
      notes: {},
      settings: {
        weekStart: 1,          // 월요일 시작
        carryOver: true,       // 못 끝낸 일 오늘로 끌어오기
        defaultView: 'today',
        hiddenMembers: [],
        lastCarryRun: '',
        lastBackup: '',
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* 저장소 어댑터                                                       */
  /* ------------------------------------------------------------------ */

  const desktop = global.desktop && global.desktop.isDesktop ? global.desktop : null;

  const Store = {
    data: defaultData(),
    ready: false,
    location: desktop ? '(불러오는 중)' : '브라우저 저장소 (localStorage)',
    listeners: new Set(),
    lastSaved: null,
    saveError: null,

    /* --- 구독 --- */
    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },
    emit() {
      for (const fn of this.listeners) fn(this.data);
    },

    /* --- 로드 --- */
    async load() {
      let loaded = null;
      if (desktop) {
        const res = await desktop.readData();
        if (res.ok) {
          loaded = res.data;
          this.location = res.path;
        } else {
          this.saveError = res.error;
          this.location = res.path;
        }
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) loaded = JSON.parse(raw);
        } catch (err) {
          this.saveError = '브라우저 저장소를 읽지 못했습니다: ' + err.message;
        }
      }

      this.data = migrate(loaded);
      this.ready = true;
      this.runDailyMaintenance();
      this.emit();
      return this.data;
    },

    /* --- 세이브 (입력 중 과도한 쓰기를 막으려고 살짝 지연) --- */
    save() {
      this.emit();
      this._saveDebounced();
    },

    _saveDebounced: U.debounce(function () {
      Store.flush();
    }, 400),

    async flush() {
      const payload = this.data;
      if (desktop) {
        const res = await desktop.writeData(payload);
        this.saveError = res.ok ? null : res.error;
        if (res.ok) {
          this.lastSaved = res.savedAt;
          this.location = res.path;
          const stamp = U.today();
          if (payload.settings.lastBackup !== stamp) {
            payload.settings.lastBackup = stamp;
            desktop.backupData(payload);
          }
        }
      } else {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(payload));
          this.lastSaved = new Date().toISOString();
          this.saveError = null;
        } catch (err) {
          this.saveError = '저장 실패: ' + err.message;
        }
      }
      this.emit();
    },

    /* ---------------------------------------------------------------- */
    /* 팀원                                                              */
    /* ---------------------------------------------------------------- */

    members() {
      return this.data.members.filter((m) => m.active !== false);
    },

    member(id) {
      return this.data.members.find((m) => m.id === id) || null;
    },

    memberName(id) {
      const m = this.member(id);
      return m ? m.name : '미지정';
    },

    memberColor(id) {
      const m = this.member(id);
      return m ? m.color : '#6b7280';
    },

    addMember(name, short) {
      const used = this.data.members.map((m) => m.color);
      const color =
        MEMBER_PALETTE.find((c) => !used.includes(c)) ||
        MEMBER_PALETTE[this.data.members.length % MEMBER_PALETTE.length];
      const member = {
        id: U.uid(),
        name: name.trim(),
        short: (short || name.trim().slice(0, 2)).toUpperCase(),
        color,
        active: true,
      };
      this.data.members.push(member);
      this.save();
      return member;
    },

    updateMember(id, patch) {
      const m = this.member(id);
      if (!m) return;
      Object.assign(m, patch);
      this.save();
    },

    removeMember(id) {
      const m = this.member(id);
      if (!m || m.lead) return;
      m.active = false;
      this.save();
    },

    /* ---------------------------------------------------------------- */
    /* 일정                                                              */
    /* ---------------------------------------------------------------- */

    addEvent(partial) {
      const ev = Object.assign(
        {
          id: U.uid(),
          title: '',
          date: U.today(),
          endDate: '',
          allDay: true,
          start: '',
          end: '',
          members: [],
          category: 'etc',
          note: '',
          place: '',
          done: false,
          repeat: 'none',     // none | daily | weekly | biweekly | monthly
          repeatUntil: '',
          createdAt: new Date().toISOString(),
        },
        partial
      );
      ev.updatedAt = ev.createdAt;
      this.data.events.push(ev);
      this.save();
      return ev;
    },

    updateEvent(id, patch) {
      const ev = this.data.events.find((e) => e.id === id);
      if (!ev) return null;
      Object.assign(ev, patch, { updatedAt: new Date().toISOString() });
      this.save();
      return ev;
    },

    removeEvent(id) {
      this.data.events = this.data.events.filter((e) => e.id !== id);
      this.save();
    },

    event(id) {
      return this.data.events.find((e) => e.id === id) || null;
    },

    /** 그 날 화면에 떠야 하는 일정들 (기간 일정 · 반복 일정 포함) */
    eventsOn(dateKey) {
      const hidden = this.data.settings.hiddenMembers || [];
      return this.data.events
        .filter((ev) => occursOn(ev, dateKey))
        .filter((ev) => {
          if (!hidden.length) return true;
          if (!ev.members || !ev.members.length) return true;
          return ev.members.some((id) => !hidden.includes(id));
        })
        .sort(compareEvents);
    },

    eventsBetween(fromKey, toKey) {
      const out = [];
      for (let key = fromKey; U.diffDays(key, toKey) >= 0; key = U.addDays(key, 1)) {
        for (const ev of this.eventsOn(key)) out.push({ date: key, event: ev });
      }
      return out;
    },

    /* ---------------------------------------------------------------- */
    /* 체크리스트 (나만 보는 그날의 할 일)                                */
    /* ---------------------------------------------------------------- */

    tasksFor(dateKey) {
      if (!this.data.checklists[dateKey]) this.data.checklists[dateKey] = [];
      return this.data.checklists[dateKey];
    },

    addTask(dateKey, text, extra) {
      const task = Object.assign(
        {
          id: U.uid(),
          text: String(text).trim(),
          done: false,
          starred: false,
          memberId: '',
          createdAt: new Date().toISOString(),
        },
        extra || {}
      );
      if (!task.text) return null;
      this.tasksFor(dateKey).push(task);
      this.save();
      return task;
    },

    updateTask(dateKey, id, patch) {
      const task = this.tasksFor(dateKey).find((t) => t.id === id);
      if (!task) return null;
      Object.assign(task, patch);
      if (patch.done === true) task.doneAt = new Date().toISOString();
      if (patch.done === false) delete task.doneAt;
      this.save();
      return task;
    },

    removeTask(dateKey, id) {
      this.data.checklists[dateKey] = this.tasksFor(dateKey).filter((t) => t.id !== id);
      this.save();
    },

    moveTask(fromKey, id, toKey) {
      const list = this.tasksFor(fromKey);
      const idx = list.findIndex((t) => t.id === id);
      if (idx < 0) return;
      const [task] = list.splice(idx, 1);
      task.movedFrom = fromKey;
      this.tasksFor(toKey).push(task);
      this.save();
    },

    reorderTask(dateKey, id, delta) {
      const list = this.tasksFor(dateKey);
      const idx = list.findIndex((t) => t.id === id);
      const next = idx + delta;
      if (idx < 0 || next < 0 || next >= list.length) return;
      [list[idx], list[next]] = [list[next], list[idx]];
      this.save();
    },

    /* --- 루틴: 요일마다 자동으로 깔리는 고정 업무 --- */

    addRoutine(text, days) {
      const routine = {
        id: U.uid(),
        text: String(text).trim(),
        days: days && days.length ? days.slice() : [1, 2, 3, 4, 5],
        active: true,
      };
      if (!routine.text) return null;
      this.data.routines.push(routine);
      this.save();
      return routine;
    },

    updateRoutine(id, patch) {
      const r = this.data.routines.find((x) => x.id === id);
      if (!r) return;
      Object.assign(r, patch);
      this.save();
    },

    removeRoutine(id) {
      this.data.routines = this.data.routines.filter((r) => r.id !== id);
      this.save();
    },

    /** 그 날짜에 해당하는 루틴을 체크리스트에 한 번만 깔아준다 */
    materializeRoutines(dateKey) {
      const dow = U.dayOfWeek(dateKey);
      const list = this.tasksFor(dateKey);
      let added = 0;
      for (const routine of this.data.routines) {
        if (routine.active === false) continue;
        if (!routine.days.includes(dow)) continue;
        if (list.some((t) => t.routineId === routine.id)) continue;
        list.push({
          id: U.uid(),
          text: routine.text,
          done: false,
          starred: false,
          routineId: routine.id,
          createdAt: new Date().toISOString(),
        });
        added++;
      }
      return added;
    },

    /** 지난 며칠간 못 끝낸 일을 오늘로 끌어온다 */
    carryOverInto(dateKey, lookbackDays) {
      const back = lookbackDays || 14;
      let moved = 0;
      for (let i = 1; i <= back; i++) {
        const prev = U.addDays(dateKey, -i);
        const list = this.data.checklists[prev];
        if (!list || !list.length) continue;
        for (const task of list.slice()) {
          if (task.done) continue;
          if (task.routineId) continue; // 루틴은 그날 것으로 끝
          this.moveTask(prev, task.id, dateKey);
          const carried = this.tasksFor(dateKey).find((t) => t.id === task.id);
          if (carried) carried.carriedFrom = carried.carriedFrom || prev;
          moved++;
        }
      }
      return moved;
    },

    /** 앱을 켤 때 하루에 한 번만 돌리는 정리 작업 */
    runDailyMaintenance() {
      const stamp = U.today();
      if (this.data.settings.lastCarryRun === stamp) {
        this.materializeRoutines(stamp);
        return;
      }
      this.materializeRoutines(stamp);
      if (this.data.settings.carryOver) this.carryOverInto(stamp);
      this.data.settings.lastCarryRun = stamp;
      this.save();
    },

    /* ---------------------------------------------------------------- */
    /* 하루 메모                                                          */
    /* ---------------------------------------------------------------- */

    note(dateKey) {
      return this.data.notes[dateKey] || '';
    },

    setNote(dateKey, text) {
      if (text && text.trim()) this.data.notes[dateKey] = text;
      else delete this.data.notes[dateKey];
      this.save();
    },

    /* ---------------------------------------------------------------- */
    /* 조회 도우미                                                        */
    /* ---------------------------------------------------------------- */

    /** 팀원별 특정 기간 일정 수 — 누가 몰려 있는지 한눈에 */
    workloadBetween(fromKey, toKey) {
      const counts = {};
      for (const m of this.members()) counts[m.id] = { member: m, count: 0, shoot: 0 };
      for (const { event } of this.eventsBetween(fromKey, toKey)) {
        for (const id of event.members || []) {
          if (!counts[id]) continue;
          counts[id].count++;
          if (event.category === 'shoot') counts[id].shoot++;
        }
      }
      return Object.values(counts);
    },

    /** 앞으로 다가오는 마감/납품 */
    upcoming(days) {
      const from = U.today();
      const to = U.addDays(from, days || 14);
      return this.eventsBetween(from, to)
        .filter(({ event }) => !event.done)
        .slice(0, 50);
    },

    search(query) {
      const q = query.trim().toLowerCase();
      if (!q) return { events: [], tasks: [] };

      const events = this.data.events
        .filter((ev) =>
          [ev.title, ev.note, ev.place].some((f) => (f || '').toLowerCase().includes(q))
        )
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 40);

      const tasks = [];
      for (const [dateKey, list] of Object.entries(this.data.checklists)) {
        for (const task of list) {
          if (task.text.toLowerCase().includes(q)) tasks.push({ date: dateKey, task });
        }
      }
      tasks.sort((a, b) => (a.date < b.date ? 1 : -1));

      return { events, tasks: tasks.slice(0, 40) };
    },

    /* ---------------------------------------------------------------- */
    /* 백업 / 복원                                                        */
    /* ---------------------------------------------------------------- */

    exportJson() {
      return JSON.stringify(this.data, null, 2);
    },

    importJson(text, mode) {
      const incoming = JSON.parse(text);
      if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.events)) {
        throw new Error('이 앱의 백업 파일이 아닙니다.');
      }
      if (mode === 'merge') {
        const known = new Set(this.data.events.map((e) => e.id));
        for (const ev of incoming.events) if (!known.has(ev.id)) this.data.events.push(ev);
        for (const [key, list] of Object.entries(incoming.checklists || {})) {
          const mine = this.tasksFor(key);
          const ids = new Set(mine.map((t) => t.id));
          for (const t of list) if (!ids.has(t.id)) mine.push(t);
        }
      } else {
        this.data = migrate(incoming);
      }
      this.save();
      return this.data;
    },
  };

  /* ------------------------------------------------------------------ */
  /* 내부 헬퍼                                                           */
  /* ------------------------------------------------------------------ */

  function migrate(loaded) {
    const base = defaultData();
    if (!loaded || typeof loaded !== 'object') return base;

    const data = {
      version: SCHEMA_VERSION,
      members: Array.isArray(loaded.members) && loaded.members.length ? loaded.members : base.members,
      events: Array.isArray(loaded.events) ? loaded.events : [],
      checklists: loaded.checklists && typeof loaded.checklists === 'object' ? loaded.checklists : {},
      routines: Array.isArray(loaded.routines) ? loaded.routines : [],
      notes: loaded.notes && typeof loaded.notes === 'object' ? loaded.notes : {},
      settings: Object.assign({}, base.settings, loaded.settings || {}),
    };

    // 필드가 빠진 오래된 레코드 보정
    for (const ev of data.events) {
      if (!ev.id) ev.id = U.uid();
      if (!Array.isArray(ev.members)) ev.members = [];
      if (!ev.category) ev.category = 'etc';
      if (!ev.repeat) ev.repeat = 'none';
      if (ev.allDay === undefined) ev.allDay = !ev.start;
    }
    for (const list of Object.values(data.checklists)) {
      for (const t of list) if (!t.id) t.id = U.uid();
    }
    return data;
  }

  /** 반복/기간 규칙까지 따져서 이 일정이 그 날에 걸리는지 판단 */
  function occursOn(ev, dateKey) {
    const spanEnd = ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date;
    const span = U.diffDays(ev.date, spanEnd);

    const hitsSpan = (anchor) =>
      U.diffDays(anchor, dateKey) >= 0 && U.diffDays(dateKey, U.addDays(anchor, span)) >= 0;

    if (!ev.repeat || ev.repeat === 'none') return hitsSpan(ev.date);
    if (dateKey < ev.date) return false;
    if (ev.repeatUntil && dateKey > U.addDays(ev.repeatUntil, span)) return false;

    // 반복은 앵커 날짜를 되짚어 확인한다 (기간 일정도 그대로 따라간다)
    for (let back = 0; back <= span; back++) {
      const probe = U.addDays(dateKey, -back);
      if (probe < ev.date) break;
      const gap = U.diffDays(ev.date, probe);
      let match = false;
      if (ev.repeat === 'daily') match = true;
      else if (ev.repeat === 'weekly') match = gap % 7 === 0;
      else if (ev.repeat === 'biweekly') match = gap % 14 === 0;
      else if (ev.repeat === 'monthly')
        match = U.fromKey(probe).getDate() === U.fromKey(ev.date).getDate();
      if (match && hitsSpan(probe)) return true;
    }
    return false;
  }

  function compareEvents(a, b) {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const at = U.toMinutes(a.start);
    const bt = U.toMinutes(b.start);
    if (at !== bt) return at - bt;
    return (a.title || '').localeCompare(b.title || '', 'ko');
  }

  A.store = Store;
  A.CATEGORIES = CATEGORIES;
  A.MEMBER_PALETTE = MEMBER_PALETTE;
  A.category = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  A.occursOn = occursOn;
})(window);
