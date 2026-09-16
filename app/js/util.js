/* 공용 유틸 — 날짜 계산, DOM 헬퍼, 잡다한 것들 */
(function (global) {
  'use strict';

  const A = (global.A = global.A || {});

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function uid() {
    return (
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
    );
  }

  /* --- 날짜는 전부 'YYYY-MM-DD' 문자열로 다룬다 (타임존 사고 방지) --- */

  function toKey(date) {
    return (
      date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    );
  }

  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function today() {
    return toKey(new Date());
  }

  function addDays(key, n) {
    const d = fromKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  function addMonths(key, n) {
    const d = fromKey(key);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    // 1/31 에서 한 달 더하면 2/31 이 되는 걸 막는다
    d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
    return toKey(d);
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function dayOfWeek(key) {
    return fromKey(key).getDay();
  }

  function startOfWeek(key, weekStart) {
    const start = typeof weekStart === 'number' ? weekStart : 0;
    const dow = dayOfWeek(key);
    return addDays(key, -((dow - start + 7) % 7));
  }

  function diffDays(a, b) {
    return Math.round((fromKey(b) - fromKey(a)) / 86400000);
  }

  function isWeekend(key) {
    const dow = dayOfWeek(key);
    return dow === 0 || dow === 6;
  }

  /* --- 표시용 포맷 --- */

  function fmtDate(key, opts) {
    const d = fromKey(key);
    const withYear = !opts || opts.year !== false;
    const base =
      (withYear ? d.getFullYear() + '년 ' : '') +
      (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
    return opts && opts.weekday === false
      ? base
      : base + ' (' + WEEKDAYS[d.getDay()] + ')';
  }

  function fmtShort(key) {
    const d = fromKey(key);
    return d.getMonth() + 1 + '/' + d.getDate();
  }

  function fmtRelative(key) {
    const delta = diffDays(today(), key);
    if (delta === 0) return '오늘';
    if (delta === 1) return '내일';
    if (delta === 2) return '모레';
    if (delta === -1) return '어제';
    if (delta < 0) return Math.abs(delta) + '일 지남';
    return delta + '일 뒤';
  }

  function fmtTimeRange(ev) {
    if (ev.allDay || !ev.start) return '종일';
    return ev.end ? ev.start + ' – ' + ev.end : ev.start;
  }

  /* --- 시간 --- */

  function toMinutes(hhmm) {
    if (!hhmm) return -1;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function nowHHMM() {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* --- DOM --- */

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function')
          node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const child of [].concat(children || [])) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(
        typeof child === 'string' || typeof child === 'number'
          ? document.createTextNode(String(child))
          : child
      );
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function debounce(fn, ms) {
    let timer = null;
    const wrapped = function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
    wrapped.flush = function (...args) {
      clearTimeout(timer);
      fn.apply(this, args);
    };
    return wrapped;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  A.util = {
    WEEKDAYS,
    pad, uid,
    toKey, fromKey, today, addDays, addMonths, daysInMonth,
    dayOfWeek, startOfWeek, diffDays, isWeekend,
    fmtDate, fmtShort, fmtRelative, fmtTimeRange,
    toMinutes, nowHHMM,
    el, clear, $, $$, debounce, escapeHtml,
  };
})(window);
