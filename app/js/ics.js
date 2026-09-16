/* ICS(iCalendar) 입출력 — 타임트리 / 구글 캘린더와 주고받는 통로 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});
  const U = A.util;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function escapeText(str) {
    return String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function unescapeText(str) {
    return String(str || '')
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  // iCalendar 는 75옥텟에서 줄을 접는다
  function fold(line) {
    if (line.length <= 73) return line;
    const parts = [];
    let rest = line;
    while (rest.length > 73) {
      parts.push(rest.slice(0, 73));
      rest = ' ' + rest.slice(73);
    }
    parts.push(rest);
    return parts.join('\r\n');
  }

  function stampUtc(date) {
    return (
      date.getUTCFullYear() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) + 'T' +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) + 'Z'
    );
  }

  const RRULE = {
    daily: 'FREQ=DAILY',
    weekly: 'FREQ=WEEKLY',
    biweekly: 'FREQ=WEEKLY;INTERVAL=2',
    monthly: 'FREQ=MONTHLY',
  };

  /* ------------------------------------------------------------------ */
  /* 내보내기                                                            */
  /* ------------------------------------------------------------------ */

  function toIcs(events, opts) {
    const options = opts || {};
    const nameOf = options.memberName || ((id) => id);
    const now = stampUtc(new Date());
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//klkong//제작2파트 비서//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:제작2파트',
      'X-WR-TIMEZONE:Asia/Seoul',
    ];

    for (const ev of events) {
      const cat = A.category(ev.category);
      const who = (ev.members || []).map(nameOf).filter(Boolean);
      const descParts = [];
      if (who.length) descParts.push('담당: ' + who.join(', '));
      if (ev.note) descParts.push(ev.note);

      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + ev.id + '@klkong-part2');
      lines.push('DTSTAMP:' + now);

      if (ev.allDay || !ev.start) {
        const endExclusive = U.addDays(ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date, 1);
        lines.push('DTSTART;VALUE=DATE:' + ev.date.replace(/-/g, ''));
        lines.push('DTEND;VALUE=DATE:' + endExclusive.replace(/-/g, ''));
      } else {
        const endDate = ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date;
        const endTime = ev.end || ev.start;
        lines.push(
          'DTSTART;TZID=Asia/Seoul:' + ev.date.replace(/-/g, '') + 'T' + ev.start.replace(':', '') + '00'
        );
        lines.push(
          'DTEND;TZID=Asia/Seoul:' + endDate.replace(/-/g, '') + 'T' + endTime.replace(':', '') + '00'
        );
      }

      if (ev.repeat && RRULE[ev.repeat]) {
        const until = ev.repeatUntil
          ? ';UNTIL=' + ev.repeatUntil.replace(/-/g, '') + 'T235959Z'
          : '';
        lines.push('RRULE:' + RRULE[ev.repeat] + until);
      }

      lines.push(fold('SUMMARY:' + escapeText(ev.title)));
      if (descParts.length) lines.push(fold('DESCRIPTION:' + escapeText(descParts.join('\n'))));
      if (ev.place) lines.push(fold('LOCATION:' + escapeText(ev.place)));
      lines.push(fold('CATEGORIES:' + escapeText(cat.label)));
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  /* ------------------------------------------------------------------ */
  /* 가져오기                                                            */
  /* ------------------------------------------------------------------ */

  function unfold(text) {
    return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  }

  function parseDateValue(raw, params) {
    const isDateOnly = /VALUE=DATE(?!-TIME)/i.test(params) || /^\d{8}$/.test(raw);
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!m) return null;

    if (isDateOnly || !m[4]) {
      return { date: `${m[1]}-${m[2]}-${m[3]}`, time: '', allDay: true };
    }

    if (m[7]) {
      // UTC 표기는 로컬 시간으로 돌려놓는다
      const d = new Date(
        Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
      );
      return { date: U.toKey(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()), allDay: false };
    }

    return {
      date: `${m[1]}-${m[2]}-${m[3]}`,
      time: `${m[4]}:${m[5]}`,
      allDay: false,
    };
  }

  /**
   * 타임트리에서 쓰는 대괄호 머리말이 곧 제작 파이프라인이다.
   * [구성] → 기획, [촬영] → 촬영, [1차] → 편집중, [업로드] → 완료.
   * 머리말이 있으면 그걸 믿고, 없으면 본문 단어로 추측한다.
   */
  const PREFIX_RULES = [
    { re: /^\[(구성|기획|콘티|대본)\]/, category: 'plan', status: 'plan' },
    { re: /^\[(촬영|사전세팅|프리뷰)\]/, category: 'shoot', status: 'shoot' },
    { re: /^\[(라이브|소스중계|중계)\]/, category: 'shoot', status: 'shoot' },
    { re: /^\[(1차|2차|3차|편집|가편|종편)\]/, category: 'edit', status: 'editing' },
    { re: /^\[(시사|피드백|검수|리뷰)\]/, category: 'review', status: 'feedback' },
    { re: /^\[(업로드|납품|송출|발행)\]/, category: 'deliver', status: 'done' },
    { re: /^\[(회의|미팅|킥오프)\]/, category: 'meeting', status: 'plan' },
    { re: /^\[(대휴|휴가|연차|반차|예비군|교육)\]/, category: 'off', status: 'plan' },
    { re: /^\[(지원|섭외|예비군)\]/, category: 'etc', status: 'plan' },
  ];

  const WORD_HINTS = [
    [/촬영|스튜디오|현장|로케/, 'shoot', 'shoot'],
    [/편집|자막|색보정|컷편집/, 'edit', 'editing'],
    [/기획|구성|콘티|시나리오|대본/, 'plan', 'plan'],
    [/시사|피드백|검수|리뷰/, 'review', 'feedback'],
    [/납품|업로드|송출|발행/, 'deliver', 'done'],
    [/회의|미팅|킥오프/, 'meeting', 'plan'],
    [/휴가|연차|반차|대휴/, 'off', 'plan'],
  ];

  /**
   * 제목에서 종류와 파이프라인 상태를 함께 뽑는다.
   * 촬영은 지난 날짜면 '촬영완료', 앞으로면 '촬영예정' 으로 나눠 준다.
   */
  function classify(title, categories, dateKey) {
    const hay = (title || '') + ' ' + (categories || '');
    let category = 'etc';
    let status = 'plan';

    const prefix = PREFIX_RULES.find((rule) => rule.re.test(title || ''));
    if (prefix) {
      category = prefix.category;
      status = prefix.status;
    } else {
      const word = WORD_HINTS.find(([re]) => re.test(hay));
      if (word) {
        category = word[1];
        status = word[2];
      }
    }

    if (status === 'shoot') {
      status = dateKey && dateKey < U.today() ? 'shot' : 'ready';
    }
    return { category, status };
  }

  /** 제목/설명에서 팀원 이름을 찾아 담당자로 붙여준다 */
  function guessMembers(text, members) {
    const found = [];
    for (const m of members) {
      const name = m.name.replace(/\s*\(.*\)$/, '');
      if (!name) continue;
      const re = new RegExp(name + '|\\b' + m.short + '\\b', 'i');
      if (re.test(text)) found.push(m.id);
    }
    return found;
  }

  function parseIcs(text, opts) {
    const options = opts || {};
    const members = options.members || [];
    const lines = unfold(String(text)).split('\n');
    const events = [];
    let current = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line === 'BEGIN:VEVENT') {
        current = { members: [], allDay: true, repeat: 'none' };
        continue;
      }
      if (line === 'END:VEVENT') {
        if (current && current.title && current.date) events.push(finalize(current, members));
        current = null;
        continue;
      }
      if (!current) continue;

      const sep = line.indexOf(':');
      if (sep < 0) continue;
      const left = line.slice(0, sep);
      const value = line.slice(sep + 1);
      const semi = left.indexOf(';');
      const key = (semi < 0 ? left : left.slice(0, semi)).toUpperCase();
      const params = semi < 0 ? '' : left.slice(semi + 1);

      switch (key) {
        case 'SUMMARY':
          current.title = unescapeText(value);
          break;
        case 'DESCRIPTION':
          current.note = unescapeText(value);
          break;
        case 'LOCATION':
          current.place = unescapeText(value);
          break;
        case 'CATEGORIES':
          current.rawCategories = unescapeText(value);
          break;
        case 'UID':
          current.uid = value;
          break;
        case 'DTSTART': {
          const parsed = parseDateValue(value, params);
          if (parsed) {
            current.date = parsed.date;
            current.start = parsed.time;
            current.allDay = parsed.allDay;
          }
          break;
        }
        case 'DTEND': {
          const parsed = parseDateValue(value, params);
          if (parsed) {
            // 종일 일정의 DTEND 는 '다음 날'이라 하루 빼야 한다
            current.endDate = parsed.allDay ? U.addDays(parsed.date, -1) : parsed.date;
            current.end = parsed.time;
          }
          break;
        }
        case 'RRULE': {
          if (/FREQ=DAILY/i.test(value)) current.repeat = 'daily';
          else if (/FREQ=WEEKLY/i.test(value))
            current.repeat = /INTERVAL=2/i.test(value) ? 'biweekly' : 'weekly';
          else if (/FREQ=MONTHLY/i.test(value)) current.repeat = 'monthly';
          const until = value.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
          if (until) current.repeatUntil = `${until[1]}-${until[2]}-${until[3]}`;
          break;
        }
        default:
          break;
      }
    }

    return events;
  }

  function finalize(raw, members) {
    const haystack = [raw.title, raw.note, raw.rawCategories].filter(Boolean).join(' ');
    const kind = classify(raw.title, raw.rawCategories, raw.date);
    return {
      id: U.uid(),
      importedUid: raw.uid || '',
      title: raw.title,
      date: raw.date,
      endDate: raw.endDate && raw.endDate > raw.date ? raw.endDate : '',
      allDay: raw.allDay,
      start: raw.allDay ? '' : raw.start || '',
      end: raw.allDay ? '' : raw.end || '',
      members: guessMembers(haystack, members),
      category: kind.category,
      status: kind.status,
      note: raw.note || '',
      place: raw.place || '',
      done: false,
      repeat: raw.repeat || 'none',
      repeatUntil: raw.repeatUntil || '',
      createdAt: new Date().toISOString(),
    };
  }

  A.ics = { toIcs, parseIcs, classify };
})(window);
