/* Ночной поезд — логика сайта. Текст живёт в content.js */
(function () {
  'use strict';

  var C = window.CONTENT || {};
  var CH = Array.isArray(C.chapters) ? C.chapters : [];
  var FINAL = C.final || { title: 'Дом', text: 'Я дома.', after: [] };
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ===================== утилиты ===================== */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, ''); }
  function pick(a) { return a && a.length ? a[Math.floor(Math.random() * a.length)] : ''; }
  function pickNot(a, prev) {
    if (!a || !a.length) return '';
    if (a.length === 1) return a[0];
    var x, n = 0;
    do { x = pick(a); n++; } while (x === prev && n < 10);
    return x;
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function plural(n, f) {
    n = Math.abs(n) % 100; var n1 = n % 10;
    if (n > 10 && n < 20) return f[2];
    if (n1 > 1 && n1 < 5) return f[1];
    if (n1 === 1) return f[0];
    return f[2];
  }
  function shuffle(a, seed) {
    a = a.slice();
    var s = seed || Math.random() * 1e9;
    function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor((seed ? rnd() : Math.random()) * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function paras(text) {
    return String(text || '').trim().split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
  }
  function firstLetter(text) {
    var m = String(text || '').match(/[A-Za-zА-Яа-яЁё]/);
    return m ? m[0].toUpperCase() : '·';
  }

  /* ===================== хранилище ===================== */
  var mem = {};
  var store = {
    get: function (k, d) {
      try {
        var v = localStorage.getItem('lv_' + k);
        return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v);
      } catch (e) { return k in mem ? mem[k] : d; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { localStorage.setItem('lv_' + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  var S = {
    in: store.get('in', false),
    home: store.get('home', false),
    read: store.get('read', []),
    ow: store.get('ow', []),
    mem: store.get('mem', []),
    sec: store.get('sec', []),
    notes: store.get('notes', []),
    visits: store.get('visits', 0),
    rewards: store.get('rewards', []),
    gift: store.get('gift', '')
  };
  function save(k) { store.set(k, S[k]); }

  /* ===================== время ===================== */
  var timeOffset = 0, DEV = false;
  (function () {
    try {
      var p = new URLSearchParams(location.search);
      var t = p.get('t');
      DEV = !!(C.devKey && p.get('dev') === C.devKey);
      if (t && DEV) {
        if (t.indexOf('T') < 0) t += 'T12:00';
        var d = new Date(t);
        if (!isNaN(d)) timeOffset = d.getTime() - Date.now();
      }
    } catch (e) {}
  })();
  function now() { return new Date(Date.now() + timeOffset); }
  function parseD(s) {
    var p = String(s || '').split('-').map(Number);
    var d = new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
    return isNaN(d) ? new Date() : d;
  }
  function addMonths(d, n) {
    var y = d.getFullYear(), m = d.getMonth() + n, day = d.getDate();
    var last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, last));
  }
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dayDiff(a, b) { return Math.round((midnight(b) - midnight(a)) / 864e5); }
  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  function fmtDate(d) { return d.getDate() + ' ' + MONTHS_G[d.getMonth()]; }
  function mmdd(d) { return ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function hhmm(h) { var H = Math.floor(h), M = Math.round((h - H) * 60); return ('0' + H).slice(-2) + ':' + ('0' + M).slice(-2); }

  var START = parseD(C.start), END = parseD(C.end);
  var chapters = CH.map(function (c, i) {
    return { c: c, i: i, date: addMonths(START, i), letter: firstLetter(c.text) };
  });
  var FINAL_LETTER = firstLetter(FINAL.text);
  var TOTAL = chapters.length + 1;

  function isOpen(ch) { return S.home || now() >= ch.date; }
  function finalOpen() { return S.home || now() >= END; }
  function openCount() { return chapters.filter(isOpen).length; }
  function isRead(i) { return S.read.indexOf(i) >= 0; }
  function markRead(i) { if (!isRead(i)) { S.read.push(i); save('read'); return true; } return false; }
  function hasNew() { return chapters.some(function (ch) { return isOpen(ch) && !isRead(ch.i); }); }
  function journeyFrac() { return clamp((now() - START) / (END - START || 1), 0, 1); }

  // фраза для финала: раскладка по словам; если не совпадает с буквами — просто буквы подряд
  var ALL_LETTERS = chapters.map(function (c) { return c.letter; }).concat([FINAL_LETTER]);
  var PHRASE_WORDS = (function () {
    var ph = String(C.phrase || '').toUpperCase().replace(/Ё/g, 'Е');
    var clean = ph.replace(/[^A-ZА-Я]/g, '');
    var joined = ALL_LETTERS.join('').replace(/Ё/g, 'Е');
    if (clean !== joined) return [ALL_LETTERS.slice()];
    var idx = 0;
    return ph.split(/\s+/).filter(Boolean).map(function (w) {
      return w.replace(/[^A-ZА-Я]/g, '').split('').map(function () { return ALL_LETTERS[idx++]; });
    });
  })();
  var PERM = shuffle(ALL_LETTERS.map(function (_, i) { return i; }), 7);

  /* ===================== звёздное небо ===================== */
  var Sky = (function () {
    var c, ctx, w, h, stars = [], shoot = null, raf = 0, last = 0, paused = false;
    function resize() {
      if (!c) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.min(170, Math.round(w * h / 5200));
      stars = [];
      for (var i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * w, y: Math.random() * h * .92,
          r: Math.random() * 1.15 + .25, s: Math.random() * .9 + .2, p: Math.random() * 6.28,
          col: Math.random() < .16 ? '255,214,170' : (Math.random() < .2 ? '200,190,255' : '255,255,255')
        });
      }
      draw(performance.now());
    }
    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var a = reduced ? .7 : .25 + .75 * (.5 + .5 * Math.sin(t * .001 * s.s + s.p));
        ctx.fillStyle = 'rgba(' + s.col + ',' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
        if (s.r > 1.15) {
          ctx.fillStyle = 'rgba(' + s.col + ',' + (a * .12).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, 6.283); ctx.fill();
        }
      }
      if (reduced) return;
      if (!shoot && Math.random() < .004) {
        shoot = { x: Math.random() * w * .8 + w * .2, y: Math.random() * h * .35, l: 0, life: 1 };
      }
      if (shoot) {
        shoot.l += 14; shoot.life -= .022;
        var x2 = shoot.x - shoot.l, y2 = shoot.y + shoot.l * .45;
        var g = ctx.createLinearGradient(x2, y2, x2 + 90, y2 - 40);
        g.addColorStop(0, 'rgba(255,240,220,' + Math.max(0, shoot.life) + ')');
        g.addColorStop(1, 'rgba(255,240,220,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 + 90, y2 - 40); ctx.stroke();
        if (shoot.life <= 0) shoot = null;
      }
    }
    function loop(t) {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;
      last = t;
      try { draw(t); } catch (e) { stop(); }
    }
    function start() { if (!c || paused || reduced || raf || document.hidden) return; raf = requestAnimationFrame(loop); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    var to;
    return {
      init: function () {
        c = $('#sky');
        if (!c || !c.getContext) return;
        ctx = c.getContext('2d');
        if (!ctx) { c = null; return; }
        resize();
        window.addEventListener('resize', function () { clearTimeout(to); to = setTimeout(resize, 200); });
        document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
        start();
      },
      pause: function () { paused = true; stop(); },
      resume: function () { paused = false; start(); }
    };
  })();

  /* ===================== интерфейс: лист, тост, эффекты ===================== */
  var openSheets = [];
  function sheet(html, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = '<div class="sheet-bg"></div><div class="sheet ' + (opts.cls || '') + '" role="dialog" aria-modal="true">' +
      '<button class="sheet-x" aria-label="Закрыть">×</button>' + html + '</div>';
    $('#sheet-root').appendChild(wrap);
    document.body.classList.add('lock');
    var closed = false;
    function close() {
      if (closed) return; closed = true;
      wrap.classList.remove('on');
      openSheets = openSheets.filter(function (x) { return x !== api; });
      if (!openSheets.length) document.body.classList.remove('lock');
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 420);
      if (opts.onClose) try { opts.onClose(); } catch (e) {}
    }
    var api = { el: $('.sheet', wrap), close: close };
    openSheets.push(api);
    $('.sheet-bg', wrap).addEventListener('click', close);
    $('.sheet-x', wrap).addEventListener('click', close);
    requestAnimationFrame(function () { requestAnimationFrame(function () { wrap.classList.add('on'); }); });
    return api;
  }
  function closeSheets() { openSheets.slice().forEach(function (s) { s.close(); }); }

  function toast(msg, ms) {
    var el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    $('#toast-root').appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, ms || 2800);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, (ms || 2800) + 400);
  }

  function hearts(x, y, n, chars) {
    if (reduced) return;
    var root = $('#fx-root'); if (!root) return;
    chars = chars || ['❤️', '💗', '💕', '✨', '💖'];
    if (x == null) { x = window.innerWidth / 2; y = window.innerHeight / 2; }
    for (var i = 0; i < (n || 14); i++) {
      var el = document.createElement('span');
      el.className = 'heart-p';
      el.textContent = pick(chars);
      var ang = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 150;
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.setProperty('--x', Math.cos(ang) * dist + 'px');
      el.style.setProperty('--y', (Math.sin(ang) * dist - 90) + 'px');
      el.style.setProperty('--s', (.7 + Math.random() * .9).toFixed(2));
      el.style.setProperty('--r', (Math.random() * 60 - 30) + 'deg');
      el.style.setProperty('--d', (1.2 + Math.random() * .9).toFixed(2) + 's');
      root.appendChild(el);
      (function (e) { setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 2300); })(el);
    }
  }
  function confetti(n) {
    if (reduced) return;
    var root = $('#fx-root'); if (!root) return;
    var cols = ['#ffd48f', '#ff8fb1', '#b9a8ff', '#ffb39a', '#ffffff', '#8fd8ff'];
    var W = window.innerWidth;
    for (var i = 0; i < (n || 90); i++) {
      var el = document.createElement('i');
      el.className = 'conf';
      el.style.background = pick(cols);
      el.style.left = (W / 2 + (Math.random() - .5) * 60) + 'px';
      el.style.top = (window.innerHeight * .45) + 'px';
      el.style.setProperty('--x', (Math.random() - .5) * W * 1.2 + 'px');
      el.style.setProperty('--y', (Math.random() * window.innerHeight * .7 - window.innerHeight * .25) + 'px');
      el.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
      el.style.setProperty('--d', (1.8 + Math.random() * 1.4).toFixed(2) + 's');
      root.appendChild(el);
      (function (e) { setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 3400); })(el);
    }
  }
  function centerOf(el) {
    try { var r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
    catch (e) { return [window.innerWidth / 2, window.innerHeight / 2]; }
  }

  /* ===================== иконки ===================== */
  var I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.8V20h13V9.8"/><path d="M10 20v-5.5h4V20"/></svg>',
    train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="14" rx="3.5"/><path d="M5 10h14"/><circle cx="9" cy="13.5" r=".9" fill="currentColor"/><circle cx="15" cy="13.5" r=".9" fill="currentColor"/><path d="m8 21 2-4M16 21l-2-4"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="2"/><rect x="6.5" y="6" width="11" height="9" rx="1"/><path d="M8 18h5"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 18.5 9.5"/><path d="M4 20l1-4.5L16 4.5a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'
  };
  function backBtn(to, label) { return '<a class="back" href="#/' + to + '">' + I.back + (label || 'Назад') + '</a>'; }

  /* ===================== роутер ===================== */
  var NAV = [['home', 'Дом', I.home], ['chapters', 'Главы', I.train], ['letters', 'Письма', I.mail], ['memories', 'Память', I.photo], ['notes', 'Записки', I.pen]];
  var teardown = [];
  function onLeave(fn) { teardown.push(fn); }
  function go(path) {
    var h = '#/' + path;
    if (location.hash === h) render(); else location.hash = h;
  }
  function route() {
    var p = (location.hash || '').replace(/^#\/?/, '').split('/');
    return { name: p[0] || 'home', arg: p[1] };
  }
  var ROUTES = {};
  function render() {
    teardown.forEach(function (f) { try { f(); } catch (e) {} });
    teardown = [];
    closeSheets();
    var v = $('#view'), nav = $('#nav');
    v.className = ''; void v.offsetWidth; v.className = 'view-in';
    if (!S.in) {
      nav.hidden = true; document.body.classList.add('no-nav');
      try { viewGate(v); } catch (e) { fail(v, e); }
      return;
    }
    var r = route();
    var fn = ROUTES[r.name] || ROUTES.home;
    nav.hidden = false; document.body.classList.remove('no-nav');
    try { fn(v, r.arg); } catch (e) { fail(v, e); }
    renderNav(r.name);
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function fail(v, e) {
    try { console.error(e); } catch (x) {}
    v.innerHTML = '<div class="card center" style="margin-top:20vh"><div style="font-size:40px">🌙</div><div class="h3" style="margin:8px 0 6px">Ой, что-то запнулось</div>' +
      '<p class="muted small">Ничего страшного — всё сохранено.</p><a class="btn" href="#/home" style="margin-top:10px">На главную</a></div>';
  }
  function renderNav(active) {
    var nav = $('#nav');
    var map = { chapter: 'chapters', day: 'home', final: 'chapters' };
    var cur = map[active] || active;
    var dot = hasNew();
    nav.innerHTML = NAV.map(function (n) {
      return '<a href="#/' + n[0] + '" class="' + (cur === n[0] ? 'on' : '') + '">' + n[2] + '<span>' + n[1] + '</span>' +
        (n[0] === 'chapters' && dot ? '<i class="dot"></i>' : '') + '</a>';
    }).join('');
  }

  /* ===================== ВХОД ===================== */
  var GATE_WRONG = ['Не тот. Посмотри на записку ещё раз 🙂', 'Хм, почти. Попробуй ещё.', 'Не открывается. Проверь буквы.', 'Неа. Но я ценю твоё упорство ❤️'];
  function viewGate(v) {
    v.innerHTML =
      '<section class="gate">' +
      '<div class="moon-big rise"><div class="moon"></div></div>' +
      '<h1 class="h1 rise d1">Для <span class="grad it">тебя</span></h1>' +
      '<p class="muted rise d2">Здесь спрятано кое-что очень важное. Код — на записке, которую я отдал тебе на перроне.</p>' +
      '<form class="ticket rise d3" autocomplete="off" novalidate>' +
      '<div class="t-head"><span>Билет № 1</span><span>Перрон → Дом</span></div>' +
      '<div class="t-perf"></div>' +
      '<input class="field" name="code" type="text" placeholder="код с записки" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Код">' +
      '<button class="btn" type="submit">Открыть</button>' +
      '<div class="err"></div><div class="stamp">ПРОЙДЕНО</div>' +
      '</form></section>';
    var form = $('form', v), inp = $('input', v), err = $('.err', v), tries = 0, done = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (done) return;
      var code = norm(inp.value);
      if (!code) { inp.focus(); return; }
      var codes = (C.entryCodes || []).map(norm);
      var isHome = C.homeCode && code === norm(C.homeCode);
      if (codes.indexOf(code) >= 0 || isHome) {
        done = true;
        if (isHome) { S.home = true; save('home'); }
        try { inp.blur(); } catch (x) {}
        err.textContent = '';
        $('.stamp', v).classList.add('on');
        var c = centerOf(form);
        setTimeout(function () { hearts(c[0], c[1], 22); }, 250);
        setTimeout(function () {
          S.in = true; save('in');
          countVisit();
          go(chapters[0] && isOpen(chapters[0]) && !isRead(0) ? 'chapter/0' : 'home');
        }, 1300);
      } else {
        tries++;
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        err.textContent = tries >= 3 ? 'Подсказка: это одно слово, оно написано на записке.' : pick(GATE_WRONG);
      }
    });
  }

  /* ===================== ГЛАВНАЯ ===================== */
  function greeting(d) {
    var h = d.getHours();
    if (h >= 5 && h < 11) return 'Доброе утро';
    if (h >= 11 && h < 17) return 'Добрый день';
    if (h >= 17 && h < 23) return 'Добрый вечер';
    return 'Доброй ночи';
  }
  function specialToday(d) {
    var k = mmdd(d);
    if (C.birthday && k === C.birthday) return { em: '🎂', text: C.birthdayText };
    if (C.anniversary && k === C.anniversary) return { em: '💞', text: C.anniversaryText };
    var sd = C.specialDays || {};
    if (sd[k]) return { em: k === '02-14' ? '💘' : k === '03-08' ? '🌷' : '🎄', text: sd[k] };
    return null;
  }

  function trackSVG(frac) {
    var x0 = 14, x1 = 326, y = 47, n = TOTAL;
    var tx = x0 + (x1 - x0) * frac;
    var sts = '';
    for (var i = 0; i < n; i++) {
      var x = x0 + (x1 - x0) * i / (n - 1);
      var on = i < chapters.length ? isOpen(chapters[i]) : finalOpen();
      sts += '<circle class="st' + (on ? ' on' : '') + (i === n - 1 ? ' home' : '') + '" cx="' + x.toFixed(1) + '" cy="' + y + '" r="' + (i === n - 1 ? 6 : 4.2) + '"/>';
    }
    var sleepers = '';
    for (var s = x0; s <= x1; s += 7) sleepers += '<rect x="' + s + '" y="' + (y - 3) + '" width="1.6" height="6" fill="rgba(255,255,255,.12)"/>';
    return '<svg class="track" viewBox="0 0 340 72" aria-hidden="true">' +
      '<defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#b9a8ff"/><stop offset="1" stop-color="#ffd48f"/></linearGradient>' +
      '<linearGradient id="beam" x1="0" x2="1"><stop offset="0" stop-color="#fff3c8" stop-opacity=".8"/><stop offset="1" stop-color="#fff3c8" stop-opacity="0"/></linearGradient></defs>' +
      sleepers +
      '<line class="rail" x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '"/>' +
      '<line class="done" x1="' + x0 + '" y1="' + y + '" x2="' + tx.toFixed(1) + '" y2="' + y + '"/>' +
      sts +
      '<g class="train-g" data-x="' + (tx - 34).toFixed(1) + '" style="transform:translate(' + (Math.max(x0, tx - 40) - 34).toFixed(1) + 'px,25px)">' +
      '<circle class="puff" cx="27" cy="0" r="3"/><circle class="puff p2" cx="27" cy="0" r="3"/><circle class="puff p3" cx="27" cy="0" r="3"/>' +
      '<path d="M34 12 L60 5 L60 19Z" fill="url(#beam)" opacity=".55"/>' +
      '<rect x="-1.5" y="1.5" width="16" height="3" rx="1.5" fill="#ffd0dc"/>' +
      '<rect x="0" y="3" width="13" height="15" rx="2.5" fill="#ff8fb1"/>' +
      '<rect x="3" y="6" width="7" height="5" rx="1.2" fill="#fff1c2"/>' +
      '<rect x="12" y="8" width="21" height="10" rx="4" fill="#b9a8ff"/>' +
      '<rect x="25" y="2.5" width="4.5" height="7" rx="1" fill="#6c5fc7"/>' +
      '<circle cx="33.4" cy="12" r="1.7" fill="#fff6c8"/>' +
      '<circle cx="5" cy="19" r="2.8" fill="#14163a" stroke="#ffd48f"/><circle cx="17" cy="19" r="2.8" fill="#14163a" stroke="#ffd48f"/><circle cx="27" cy="19" r="2.8" fill="#14163a" stroke="#ffd48f"/>' +
      '</g>' +
      '<text x="' + x0 + '" y="68">перрон</text><text x="' + x1 + '" y="68" text-anchor="end">дом</text>' +
      '</svg>';
  }

  function currentSlot(d) {
    var h = d.getHours() + d.getMinutes() / 60;
    var sc = C.schedule || [];
    for (var i = 0; i < sc.length; i++) {
      var s = sc[i];
      if (s.from < s.to ? (h >= s.from && h < s.to) : (h >= s.from || h < s.to)) return i;
    }
    return sc.length ? sc.length - 1 : -1;
  }

  ROUTES.home = function (v) {
    var n = now();
    var dIn = dayDiff(START, n);
    var fo = finalOpen();
    var big, lbl;
    if (dIn < 0 && !S.home) { big = 'скоро'; lbl = 'Наш путь начнётся ' + fmtDate(START); }
    else if (fo) { big = 'Дом'; lbl = 'Мы доехали. Я рядом'; }
    else { big = String(dIn + 1); lbl = plural(dIn + 1, ['день', 'дня', 'дней']) + ' нашего пути домой'; }
    var oc = openCount() + (fo ? 1 : 0);
    var sp = specialToday(n);
    var newCh = chapters.filter(function (ch) { return isOpen(ch) && !isRead(ch.i); })[0];
    var giftNew = S.gift !== mmdd(n) + n.getFullYear();
    var lastNote = S.notes[S.notes.length - 1];

    var h = '';
    h += '<header class="top rise"><div><div class="date">' + WD[n.getDay()] + ', ' + fmtDate(n) + '</div>' +
      '<h1 class="h1">' + greeting(n) + ',<br><span class="grad it">' + esc(C.her || 'любимая') + '</span></h1></div>' +
      '<button class="moon-btn" aria-label="Луна"><div class="moon"></div></button></header>';

    h += '<section class="card journey rise d1"><div class="row between" style="align-items:flex-end">' +
      '<div><div class="big grad">' + big + '</div><div class="lbl">' + lbl + '</div></div>' +
      '<div class="pill">' + oc + ' / ' + TOTAL + ' станций</div></div>' +
      trackSVG(fo ? 1 : journeyFrac()) +
      (fo || dIn < 0 ? '' : '<button class="how-long">а сколько ещё?</button>') + '</section>';

    if (sp) h += '<section class="card special rise d2"><span class="em">' + sp.em + '</span><div class="h3">' + esc(sp.text) + '</div></section>';

    if (fo) h += '<a href="#/final" class="tile wide t-rose rise d2" style="display:flex;margin-top:14px;text-decoration:none;color:inherit"><span class="em">🏡</span><div><div class="t">Станция «Дом» открыта</div><div class="s">Тебя ждёт последняя глава</div></div><i class="badge"></i></a>';
    else if (newCh) h += '<a href="#/chapter/' + newCh.i + '" class="tile wide t-gold rise d2" style="display:flex;margin-top:14px;text-decoration:none;color:inherit"><span class="em">💌</span><div><div class="t">Новая глава: «' + esc(newCh.c.title) + '»</div><div class="s">Открылась ' + fmtDate(newCh.date) + '</div></div><i class="badge"></i></a>';

    h += '<button class="card where rise d2" style="margin-top:14px"><span class="ic">🪖</span>' +
      '<div class="tiny faint">нажми</div><div class="q">Где ты сейчас?</div><div class="ans"></div></button>';

    if (lastNote) {
      var ago = dayDiff(new Date(lastNote.t), n);
      var agoS = ago <= 0 ? 'сегодня' : ago === 1 ? 'вчера' : ago + ' ' + plural(ago, ['день', 'дня', 'дней']) + ' назад';
      h += '<section class="card note-back rise d3"><span class="muted">Ты писала это ' + agoS + ':</span><q>' +
        esc(lastNote.x.length > 120 ? lastNote.x.slice(0, 120) + '…' : lastNote.x) + '</q><span class="muted">Я всё ещё думаю о тебе.</span></section>';
    }

    h += '<div class="section-t">Когда скучаешь</div><div class="grid2">' +
      tile('near', 'rose', '💬', 'Если бы я был рядом', 'что бы я сказал', 'd3') +
      tile('hug', 'rose', '🫂', 'Обними меня', 'подержи палец на сердце', 'd3') +
      tile('gift', 'gold', '🎁', 'Подарок дня', giftNew ? 'сегодня ещё не открыт' : 'загляни завтра', 'd4', giftNew) +
      tile('memory', 'lav', '📸', 'Случайное воспоминание', 'из нашей колоды', 'd4') +
      tile('letters', '', '💌', 'Открой, когда…', 'письма на трудные дни', 'd5') +
      tile('day', '', '🕰', 'Мой день', 'распорядок по часам', 'd5') +
      '<button class="tile wide rise d6" data-a="stash"><span class="em">🗝</span><div><div class="t">Тайник</div><div class="s">Нашла секретное слово? Введи его здесь · найдено ' + S.sec.length + ' из ' + (C.secrets || []).length + '</div></div></button>' +
      '</div>';
    v.innerHTML = h;

    // поезд подъезжает
    var tg = $('.train-g', v);
    if (tg) requestAnimationFrame(function () { requestAnimationFrame(function () { tg.style.transform = 'translate(' + tg.getAttribute('data-x') + 'px,25px)'; }); });

    // где ты сейчас
    var where = $('.where', v), ans = $('.ans', v), prev = '';
    where.addEventListener('click', function () {
      var t = now(), si = currentSlot(t), sl = (C.schedule || [])[si];
      if (!sl) return;
      var r = Math.random(), line, rare = false, extra = '';
      if (r < .1 && C.rare && C.rare.length) { line = pickNot(C.rare, prev); rare = true; }
      else if (r < .2 && C.memories && C.memories.length) {
        var m = pick(C.memories);
        line = 'А сейчас я думаю вот о чём…';
        extra = '<div class="muted small" style="margin-top:6px">' + esc(m.e || '✨') + ' ' + esc(m.t) + ' — ' + esc(m.d) + '</div>';
      } else line = pickNot(sl.lines, prev);
      prev = line;
      where.classList.toggle('rare', rare);
      $('.ic', where).textContent = sl.icon || '🪖';
      ans.innerHTML = '<div class="fade-in"><span class="pill slot">' + (rare ? '✦ редкая · ' : '') + esc(hhmm(sl.from)) + ' · ' + esc(sl.name) + '</span>' +
        '<div class="phrase">' + esc(line) + '</div>' + extra + '<div class="faint small" style="margin-top:8px">нажми ещё раз</div></div>';
      if (rare) { var c = centerOf(where); hearts(c[0], c[1], 10, ['✨', '⭐️', '💛']); }
    });

    $$('[data-a]', v).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-a');
        if (a === 'near') sheetNear();
        else if (a === 'hug') sheetHug();
        else if (a === 'gift') sheetGift(b);
        else if (a === 'memory') go('memories');
        else if (a === 'letters') go('letters');
        else if (a === 'day') go('day');
        else if (a === 'stash') sheetStash();
      });
    });

    var hl = $('.how-long', v);
    if (hl) hl.addEventListener('click', sheetHowLong);

    // луна: 7 нажатий
    var mb = $('.moon-btn', v), taps = 0, tt;
    mb.addEventListener('click', function () {
      taps++; clearTimeout(tt); tt = setTimeout(function () { taps = 0; }, 2500);
      var c = centerOf(mb);
      if (taps === 7) {
        taps = 0; hearts(c[0], c[1], 16, ['🌙', '✨', '⭐️']);
        sheet('<div class="center"><div style="font-size:60px">🌙</div><div class="h2" style="margin:8px 0">Ты нашла луну</div>' +
          '<p class="muted">Секретное слово для тайника:</p><div class="big-phrase" style="min-height:0">«луна»</div></div>');
      } else if (taps > 2) hearts(c[0], c[1], 2, ['✨']);
    });

    checkVisitReward();
  };
  function tile(a, tone, em, t, s, d, badge) {
    return '<button class="tile ' + (tone ? 't-' + tone : '') + ' rise ' + d + '" data-a="' + a + '"><span class="em">' + em + '</span>' +
      '<div><div class="t">' + t + '</div><div class="s">' + s + '</div></div>' + (badge ? '<i class="badge"></i>' : '') + '</button>';
  }

  function sheetNear() {
    var prev = pick(C.ifNear);
    var s = sheet('<div class="center"><div class="tiny faint">если бы я был рядом, я бы сказал</div>' +
      '<div class="big-phrase">' + esc(prev) + '</div><button class="btn block">Ещё</button></div>');
    $('.btn', s.el).addEventListener('click', function (e) {
      prev = pickNot(C.ifNear, prev);
      var bp = $('.big-phrase', s.el);
      bp.innerHTML = '<span class="fade-in">' + esc(prev) + '</span>';
      hearts(e.clientX, e.clientY, 5);
    });
  }

  function sheetHug() {
    var s = sheet('<div class="center"><div class="h2">Обними меня</div><p class="muted small" style="margin:6px 0 0">Прижми палец к сердцу и держи</p>' +
      '<div class="hug-zone"><div class="hug-heart"><svg viewBox="0 0 100 92"><defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3c6"/><stop offset="1" stop-color="#e2507c"/></linearGradient>' +
      '<clipPath id="hc"><path d="M50 88C20 66 4 50 4 30 4 15 15 4 29 4c9 0 16 5 21 12C55 9 62 4 71 4c14 0 25 11 25 26 0 20-16 36-46 58z"/></clipPath></defs>' +
      '<path d="M50 88C20 66 4 50 4 30 4 15 15 4 29 4c9 0 16 5 21 12C55 9 62 4 71 4c14 0 25 11 25 26 0 20-16 36-46 58z" fill="rgba(255,143,177,.18)" stroke="#ff8fb1" stroke-width="2"/>' +
      '<rect class="fill" x="0" y="92" width="100" height="92" fill="url(#hg)" clip-path="url(#hc)"/></svg></div></div>' +
      '<div class="big-phrase" style="min-height:70px;font-size:28px"></div></div>');
    var heart = $('.hug-heart', s.el), svg = $('svg', heart), fill = $('.fill', s.el), out = $('.big-phrase', s.el);
    var p = 0, holding = false, raf = 0, last = 0, done = false;
    function frame(t) {
      var dt = last ? Math.min(.05, (t - last) / 1000) : 0; last = t;
      if (holding && !done) p = Math.min(1, p + dt / 1.6);
      else if (!done) p = Math.max(0, p - dt * 1.4);
      fill.setAttribute('y', (92 - 92 * p).toFixed(1));
      svg.style.transform = 'scale(' + (1 + p * .18 + (holding ? Math.sin(t / 90) * .015 : 0)) + ')';
      if (p >= 1 && !done) {
        done = true;
        var c = centerOf(heart); hearts(c[0], c[1], 26);
        out.innerHTML = '<span class="fade-in">' + esc(pick(C.hugs)) + '</span>';
        setTimeout(function () { done = false; p = .999; holding = false; }, 1600);
      }
      if (holding || p > 0) raf = requestAnimationFrame(frame); else { raf = 0; last = 0; }
    }
    function down(e) { e.preventDefault(); holding = true; if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
    function up() { holding = false; }
    heart.addEventListener('pointerdown', down);
    heart.addEventListener('pointerup', up);
    heart.addEventListener('pointerleave', up);
    heart.addEventListener('pointercancel', up);
    heart.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function sheetGift(tileEl) {
    var n = now(), key = mmdd(n) + n.getFullYear();
    var opened = S.gift === key;
    var sp = specialToday(n);
    var arr = C.daily || [];
    var idx = ((dayDiff(START, n) % arr.length) + arr.length) % (arr.length || 1);
    var text = sp ? sp.text : arr[idx];
    var s = sheet('<div class="center"><div class="h2">Подарок дня</div><p class="muted small" style="margin:6px 0 0">' + (opened ? 'Сегодняшний подарок' : 'Нажми на коробку') + '</p>' +
      '<button class="gift' + (opened ? ' open' : ' wiggle') + '" aria-label="Открыть подарок"><div class="bx"></div><div class="lid"><div class="bow"></div></div></button>' +
      '<div class="big-phrase" style="min-height:60px">' + (opened ? esc(text) : '') + '</div>' +
      '<p class="faint small">Новый — завтра</p></div>');
    var g = $('.gift', s.el);
    g.addEventListener('click', function () {
      if (g.classList.contains('open')) return;
      g.classList.remove('wiggle'); g.classList.add('open');
      S.gift = key; save('gift');
      var c = centerOf(g); hearts(c[0], c[1] - 30, 16, ['✨', '💛', '🎉', '💗']);
      setTimeout(function () { $('.big-phrase', s.el).innerHTML = '<span class="fade-in">' + esc(text) + '</span>'; }, 350);
      var b = tileEl && $('.badge', tileEl); if (b) b.remove();
      var st = tileEl && $('.s', tileEl); if (st) st.textContent = 'загляни завтра';
    });
  }

  function sheetHowLong() {
    var left = Math.max(0, dayDiff(now(), END));
    var forms = [
      [['сон', 'сна', 'снов'], 'до меня'],
      [['рассвет', 'рассвета', 'рассветов'], 'без меня — а потом все со мной'],
      [['объятие', 'объятия', 'объятий'], 'я коплю для тебя — по одному в день'],
      [['вечер', 'вечера', 'вечеров'], 'до нашего первого вечера вместе']
    ];
    var f = pick(forms);
    sheet('<div class="center"><div class="tiny faint">если честно</div>' +
      '<div class="h1 grad" style="font-size:76px;margin:10px 0 0">' + left + '</div>' +
      '<div class="h3" style="margin-top:4px">' + plural(left, f[0]) + ' ' + f[1] + '</div>' +
      '<p class="muted" style="margin:18px 0 0">Но каждый — на шаг ближе к тебе.</p></div>');
  }

  function sheetStash() {
    var secs = C.secrets || [];
    function list() {
      return S.sec.map(function (code) {
        var s = secs.filter(function (x) { return norm(x.code) === code; })[0];
        return s ? '<button class="opt" data-c="' + esc(code) + '">🗝 ' + esc(s.title) + '</button>' : '';
      }).join('');
    }
    var s = sheet('<div class="h2">Тайник</div><p class="muted small" style="margin:6px 0 14px">По всему сайту спрятаны секретные слова. Нашла — вводи.</p>' +
      '<form class="stash-f"><input class="field" placeholder="секретное слово" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">' +
      '<button class="btn block" style="margin-top:10px">Проверить</button></form><div class="st-msg"></div>' +
      '<div class="section-t">Найдено ' + S.sec.length + ' из ' + secs.length + '</div><div class="st-list">' + list() + '</div>');
    var form = $('form', s.el), inp = $('input', s.el), msg = $('.st-msg', s.el);
    function showSecret(sec) {
      msg.innerHTML = '<div class="paper fade-in" style="margin-top:16px;padding:22px 20px"><div class="ow-when">' + esc(sec.title) + '</div><div class="letter-text" style="margin-top:8px"><p>' + br(sec.text) + '</p></div></div>';
    }
    function bindList() {
      $$('.st-list .opt', s.el).forEach(function (b) {
        b.addEventListener('click', function () {
          var sec = secs.filter(function (x) { return norm(x.code) === b.getAttribute('data-c'); })[0];
          if (sec) showSecret(sec);
        });
      });
    }
    bindList();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = norm(inp.value);
      if (!code) return;
      if (C.homeCode && code === norm(C.homeCode)) {
        S.home = true; save('home');
        s.close(); confetti(120);
        setTimeout(function () { go('final'); }, 500);
        return;
      }
      var sec = secs.filter(function (x) { return norm(x.code) === code; })[0];
      if (!sec) {
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        msg.innerHTML = '<p class="muted small center" style="margin-top:12px">Такого слова в тайнике нет. Ищи дальше 🙂</p>';
        return;
      }
      inp.value = ''; try { inp.blur(); } catch (x) {}
      if (S.sec.indexOf(code) < 0) {
        S.sec.push(code); save('sec');
        var c = centerOf(form); hearts(c[0], c[1], 18, ['🗝', '✨', '💛']);
        $('.st-list', s.el).innerHTML = list(); bindList();
        $('.section-t', s.el).textContent = 'Найдено ' + S.sec.length + ' из ' + secs.length;
      }
      showSecret(sec);
    });
  }

  function countVisit() {
    try { if (sessionStorage.getItem('lv_v')) return; sessionStorage.setItem('lv_v', '1'); } catch (e) {}
    S.visits++; save('visits');
  }
  function checkVisitReward() {
    var vr = C.visitRewards || {};
    var hit = Object.keys(vr).map(Number).filter(function (k) { return S.visits >= k && S.rewards.indexOf(k) < 0; }).sort(function (a, b) { return a - b; })[0];
    if (!hit) return;
    S.rewards.push(hit); save('rewards');
    setTimeout(function () {
      if (route().name !== 'home') return;
      sheet('<div class="center"><div style="font-size:56px">🏅</div><div class="h2" style="margin:6px 0 10px">' + hit + '-й визит</div><div class="big-phrase" style="font-size:27px">' + esc(vr[hit]) + '</div></div>');
      hearts(null, null, 18);
    }, 900);
  }

  /* ===================== ГЛАВЫ ===================== */
  function lettersRow() {
    var foundN = 0;
    var tiles = PERM.map(function (i) {
      var got = i < chapters.length ? isRead(i) : isRead('f');
      if (got) foundN++;
      return '<span class="lt' + (got ? ' on' : '') + '">' + (got ? esc(ALL_LETTERS[i]) : '') + '</span>';
    }).join('');
    return { html: tiles, n: foundN };
  }

  ROUTES.chapters = function (v) {
    var lr = lettersRow();
    var h = '<header class="rise" style="margin-bottom:18px"><h1 class="h1">Главы</h1><p class="muted" style="margin:6px 0 0">Каждая открывается сама, в свой день. Подглядывать нельзя 🙂</p></header>';
    h += '<section class="card letters-box rise d1"><div class="tiny faint">Собранные буквы · ' + lr.n + ' из ' + TOTAL + '</div>' +
      '<div class="letters-row">' + lr.html + '</div>' +
      '<p class="muted small" style="margin:12px 0 0">В каждой главе спрятана буква. Они перемешаны — сложатся сами, в самом конце.</p></section>';
    h += '<div class="line-wrap">';
    var nextShown = false;
    chapters.forEach(function (ch, k) {
      var open = isOpen(ch), read = isRead(ch.i);
      var cls = open ? ('open' + (read ? '' : ' new')) : 'locked';
      var meta;
      if (open) meta = '<span>' + fmtDate(ch.date) + '</span>' + (read ? '<span class="gold">✓ прочитано · «' + esc(ch.letter) + '»</span>' : '<span class="pill">новая</span>');
      else {
        var dd = dayDiff(now(), ch.date);
        meta = '<span>' + (nextShown ? 'Скоро' : 'Откроется через ' + dd + ' ' + plural(dd, ['день', 'дня', 'дней'])) + '</span><span>🔒</span>';
        nextShown = true;
      }
      h += '<button class="stn ' + cls + ' rise d' + Math.min(6, k + 1) + '" data-i="' + ch.i + '"><i class="pin"></i><div class="card">' +
        '<div class="num">Станция ' + (k + 1) + ' · ' + MONTHS[ch.date.getMonth()] + '</div>' +
        '<div class="h3">' + (open ? esc(ch.c.title) : 'Здесь что-то есть…') + '</div>' +
        '<div class="meta">' + meta + '</div></div></button>';
    });
    var fo = finalOpen();
    h += '<button class="stn home ' + (fo ? 'open new' : 'locked') + '" data-i="f"><i class="pin"></i><div class="card">' +
      '<div class="num">Конечная</div><div class="h3">' + (fo ? 'Дом 🏡' : 'Последняя дверь') + '</div>' +
      '<div class="meta"><span>' + (fo ? 'Открыто' : 'Откроется, когда я вернусь') + '</span><span>' + (fo ? '❤️' : '🔒') + '</span></div></div></button>';
    h += '</div>';
    v.innerHTML = h;

    $$('.stn', v).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = b.getAttribute('data-i');
        if (i === 'f') { if (finalOpen()) go('final'); else lockedSheet(null); return; }
        var ch = chapters[+i];
        if (isOpen(ch)) go('chapter/' + i); else lockedSheet(ch);
      });
    });
  };

  function lockedSheet(ch) {
    var nextIdx = chapters.filter(function (c) { return !isOpen(c); })[0];
    var extra = '';
    if (ch && nextIdx === ch) {
      var dd = dayDiff(now(), ch.date);
      extra = '<p class="faint small">Эта — следующая. До неё ' + dd + ' ' + plural(dd, ['день', 'дня', 'дней']) + '.</p>';
    } else if (!ch) extra = '<p class="faint small">Она откроется, когда я вернусь. Или когда я скажу тебе слово.</p>';
    var s = sheet('<div class="center"><div class="door" style="margin:16px auto 22px"><div class="knob"></div><div class="kh"></div><div class="door-glow"></div></div>' +
      '<div class="big-phrase" style="font-size:27px;min-height:0;margin:0 0 12px">' + esc(pick(C.locked)) + '</div>' + extra +
      '<button class="btn ghost sm another" style="margin-top:8px">ещё фразу</button></div>');
    var d = $('.door', s.el);
    d.addEventListener('click', function () { d.classList.remove('rattle'); void d.offsetWidth; d.classList.add('rattle'); });
    $('.another', s.el).addEventListener('click', function () {
      $('.big-phrase', s.el).innerHTML = '<span class="fade-in">' + esc(pick(C.locked)) + '</span>';
    });
  }

  function letterHTML(text, sign) {
    var ps = paras(text), out = '';
    ps.forEach(function (p, k) {
      var inner;
      if (k === 0) {
        var m = p.match(/[A-Za-zА-Яа-яЁё]/);
        var at = m ? m.index : 0;
        inner = esc(p.slice(0, at)) + '<span class="drop">' + esc(p.charAt(at)) + '</span>' + esc(p.slice(at + 1));
      } else inner = esc(p);
      out += '<p style="animation-delay:' + (0.15 + k * 0.35).toFixed(2) + 's">' + inner + '</p>';
    });
    return '<div class="letter-text paper-reveal">' + out + '</div><div class="sign">' + esc(sign || C.me || '') + ' ❤</div>';
  }

  ROUTES.chapter = function (v, arg) {
    var i = parseInt(arg, 10);
    var ch = chapters[i];
    if (!ch || !isOpen(ch)) { go('chapters'); return; }
    var first = markRead(i);
    var c = ch.c;
    var h = backBtn('chapters', 'Все главы');
    h += '<header class="ch-head rise"><span class="pill">Глава ' + (i + 1) + ' · ' + MONTHS[ch.date.getMonth()] + '</span>' +
      '<h1 class="h1">' + esc(c.title) + '</h1>' + (c.sub ? '<div class="muted it" style="font-family:var(--serif);font-size:19px;margin-top:4px">' + esc(c.sub) + '</div>' : '') + '</header>';
    h += '<article class="paper rise d1">' + letterHTML(c.text) + '</article>';
    if (c.photo) h += '<figure class="photo-frame rise d2" style="margin-top:22px"><img src="' + esc(c.photo) + '" alt="" loading="lazy" decoding="async" onerror="this.parentNode.style.display=\'none\'"></figure>';
    h += '<section class="card found rise d2"><span class="lt on">' + esc(ch.letter) + '</span><div><div style="font-weight:700">Буква этой главы</div><div class="muted small">Сохранена в твоей коллекции. Их ' + TOTAL + ' — собери все.</div></div></section>';
    if (c.game) h += '<section class="card game rise d3" id="game"></section>';
    var prev = chapters[i - 1], next = chapters[i + 1];
    h += '<div class="ch-nav">' +
      (prev ? '<a class="btn ghost sm" href="#/chapter/' + (i - 1) + '">← ' + esc(prev.c.title) + '</a>' : '') +
      (next && isOpen(next) ? '<a class="btn ghost sm" href="#/chapter/' + (i + 1) + '">' + esc(next.c.title) + ' →</a>' : '') +
      '</div>';
    v.innerHTML = h;
    if (c.game) {
      try { GAMES[c.game.type] && GAMES[c.game.type]($('#game', v), c.game, 'g' + i); }
      catch (e) { try { console.error(e); } catch (x) {} $('#game', v).remove(); }
    }
    if (first) setTimeout(function () { toast('Ты нашла букву «' + ch.letter + '» ✨'); }, 1400);
  };

  /* ===================== мини-игры ===================== */
  var GAMES = {};
  function gstate(key, d) { return store.get(key, d); }
  function gsave(key, v) { store.set(key, v); }
  function head(g, hint) { return '<div class="h3">' + esc(g.title || '') + '</div>' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '<div style="height:12px"></div>'); }

  GAMES.ticket = function (el, g, key) {
    var torn = gstate(key, false);
    el.innerHTML = head({ title: 'Твой билет' }, torn ? '' : 'Оторви корешок') +
      '<div class="rticket"><div class="main"><div class="kv">Маршрут</div><div class="route">' + esc(g.from) + ' → ' + esc(g.to) + '</div>' +
      '<div class="kv">Срок: 1 год · Место: рядом со мной</div></div>' +
      '<button class="stub' + (torn ? ' torn' : '') + '">ОТОРВАТЬ<br>✂︎</button></div>' +
      '<div class="result hand"' + (torn ? '' : ' hidden') + '>' + esc(g.stub) + '</div>';
    var stub = $('.stub', el);
    stub.addEventListener('click', function () {
      if (stub.classList.contains('torn')) return;
      stub.classList.add('torn'); gsave(key, true);
      setTimeout(function () { var r = $('.result', el); r.hidden = false; r.classList.add('fade-in'); }, 500);
      var c = centerOf(stub); hearts(c[0], c[1], 8, ['✂️', '✨', '🎫']);
    });
  };

  GAMES.jar = function (el, g, key) {
    var items = g.items || [], seen = gstate(key, []);
    var cols = ['#ffd48f', '#ff9fb5', '#b9a8ff', '#9fe0ff', '#ffc2a6', '#c4f0b8'];
    function slips() {
      var left = items.length - seen.length, s = '';
      for (var k = 0; k < Math.min(left, 12); k++) {
        var x = 46 + (k % 4) * 16 + (k > 3 ? 6 : 0), y = 150 - Math.floor(k / 4) * 16;
        s += '<rect x="' + x + '" y="' + y + '" width="22" height="9" rx="2" fill="' + cols[k % cols.length] + '" transform="rotate(' + ((k * 37) % 50 - 25) + ' ' + (x + 11) + ' ' + (y + 4) + ')"/>';
      }
      return s;
    }
    el.innerHTML = head(g, 'Нажми на баночку, чтобы вытащить записку') +
      '<div class="jar-wrap"><button class="jar" aria-label="Вытащить записку"><svg viewBox="0 0 150 180">' +
      '<rect x="44" y="4" width="62" height="18" rx="5" fill="#d2a274"/><rect x="44" y="14" width="62" height="5" fill="#b8865a"/>' +
      '<g class="slips">' + slips() + '</g>' +
      '<path d="M40 24h70q8 0 8 10v112q0 28-28 28H60q-28 0-28-28V34q0-10 8-10z" fill="rgba(200,220,255,.12)" stroke="rgba(255,255,255,.5)" stroke-width="2"/>' +
      '<path d="M44 44q-4 50 2 100" stroke="rgba(255,255,255,.35)" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="M40 62h70" stroke="#ff8fb1" stroke-width="5"/><text x="75" y="88" text-anchor="middle" fill="#fff4e6" font-family="Caveat,cursive" font-size="17">для тебя</text>' +
      '</svg></button><div class="cnt muted small" style="margin-top:6px"></div></div><div class="slot"></div>';
    var cnt = $('.cnt', el), slot = $('.slot', el);
    function upd() { cnt.textContent = 'Вытащено ' + seen.length + ' из ' + items.length; $('.slips', el).innerHTML = slips(); }
    upd();
    $('.jar', el).addEventListener('click', function (e) {
      var pool = items.map(function (_, k) { return k; }).filter(function (k) { return seen.indexOf(k) < 0; });
      var k;
      if (pool.length) { k = pick(pool); seen.push(k); gsave(key, seen); }
      else k = Math.floor(Math.random() * items.length);
      slot.innerHTML = '<div class="result hand slip-out">' + esc(items[k]) + '</div>' +
        (pool.length <= 1 ? '<p class="faint small center" style="margin-top:8px">' + (pool.length ? 'Это была последняя! Но можно перечитывать.' : 'Все записки прочитаны — тяну случайную.') + '</p>' : '');
      upd(); hearts(e.clientX, e.clientY, 5);
    });
  };

  GAMES.scratch = function (el, g, key) {
    var done = gstate(key, false);
    el.innerHTML = head(g, done ? '' : g.hint) + '<div class="scratch"><div class="under">' + esc(g.prize) + '</div>' + (done ? '' : '<canvas></canvas>') + '</div>';
    if (done) return;
    var cv = $('canvas', el), box = $('.scratch', el);
    var ctx = cv.getContext('2d'); if (!ctx) { cv.remove(); return; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2), W, H;
    function setup() {
      W = box.clientWidth; H = box.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var gr = ctx.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, '#dfe6ff'); gr.addColorStop(.5, '#b9c3ef'); gr.addColorStop(1, '#e8dcff');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      for (var k = 0; k < 40; k++) { ctx.font = (10 + Math.random() * 16) + 'px sans-serif'; ctx.fillText('❄', Math.random() * W, Math.random() * H); }
      ctx.fillStyle = '#5a5f99'; ctx.font = '600 18px Manrope, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('сотри меня ✨', W / 2, H / 2 + 6);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 38; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }
    setup();
    var drawing = false, lx = 0, ly = 0, moves = 0, finished = false;
    function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function check() {
      try {
        var d = ctx.getImageData(0, 0, cv.width, cv.height).data, clear = 0, tot = 0;
        for (var k = 3; k < d.length; k += 4 * 24) { tot++; if (d[k] < 40) clear++; }
        if (clear / tot > .5) finish();
      } catch (e) { finish(); }
    }
    function finish() {
      if (finished) return; finished = true;
      cv.style.opacity = 0; gsave(key, true);
      setTimeout(function () { if (cv.parentNode) cv.remove(); }, 650);
      var c = centerOf(box); hearts(c[0], c[1], 18, ['🎁', '✨', '🍊', '❄️']);
    }
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); drawing = true; var p = pos(e); lx = p[0]; ly = p[1]; ctx.beginPath(); ctx.arc(lx, ly, 19, 0, 6.3); ctx.fill(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
    cv.addEventListener('pointermove', function (e) {
      if (!drawing) return; e.preventDefault();
      var p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p[0], p[1]); ctx.stroke(); lx = p[0]; ly = p[1];
      if (++moves % 14 === 0) check();
    });
    function end() { if (drawing) { drawing = false; check(); } }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  };

  GAMES.stars = function (el, g, key) {
    var items = g.items || [], n = items.length, lit = gstate(key, []);
    var pts = [];
    for (var k = 0; k < n; k++) {
      var t = (k / n) * Math.PI * 2;
      var X = 16 * Math.pow(Math.sin(t), 3);
      var Y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([50 + X * 2.6, 42 - Y * 2.55]);
    }
    var d = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L') + ' Z';
    var bg = '';
    for (var b = 0; b < 40; b++) bg += '<circle cx="' + (Math.random() * 100).toFixed(1) + '" cy="' + (Math.random() * 100).toFixed(1) + '" r=".25" fill="rgba(255,255,255,.6)"/>';
    el.innerHTML = head(g, g.hint) + '<div class="sky-box' + (lit.length >= n ? ' done' : '') + '">' +
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + bg + '<path class="cl" d="' + d + '" pathLength="1" fill="none" vector-effect="non-scaling-stroke"/></svg>' +
      pts.map(function (p, k) { return '<button class="star-b' + (lit.indexOf(k) >= 0 ? ' lit' : '') + '" data-k="' + k + '" style="left:' + p[0] + '%;top:' + p[1] + '%" aria-label="Звезда"><i></i></button>'; }).join('') +
      '</div><div class="star-line">' + (lit.length >= n ? '' : 'Каждая звезда — одна вещь, которую я в тебе люблю') + '</div>' +
      '<div class="result hand"' + (lit.length >= n ? '' : ' hidden') + '>' + esc(g.done) + '</div>';
    var line = $('.star-line', el);
    $$('.star-b', el).forEach(function (s) {
      s.addEventListener('click', function (e) {
        var k = +s.getAttribute('data-k');
        line.innerHTML = '<span class="fade-in">' + esc(items[k]) + '</span>';
        if (lit.indexOf(k) < 0) {
          lit.push(k); gsave(key, lit); s.classList.add('lit');
          hearts(e.clientX, e.clientY, 4, ['✨', '⭐️']);
          if (lit.length >= n) {
            setTimeout(function () {
              $('.sky-box', el).classList.add('done');
              var r = $('.result', el); r.hidden = false; r.classList.add('fade-in');
              var c = centerOf($('.sky-box', el)); hearts(c[0], c[1], 20, ['⭐️', '✨', '💛']);
            }, 500);
          }
        }
      });
    });
  };

  GAMES.checklist = function (el, g, key) {
    var on = gstate(key, []), items = g.items || [];
    el.innerHTML = head(g, 'Отмечай, когда сделаешь') + items.map(function (t, k) {
      return '<button class="check' + (on.indexOf(k) >= 0 ? ' on' : '') + '" data-k="' + k + '"><i class="box"></i><span>' + esc(t) + '</span></button>';
    }).join('') + '<div class="result hand"' + (on.length >= items.length ? '' : ' hidden') + '>' + esc(g.done) + '</div>';
    $$('.check', el).forEach(function (b) {
      b.addEventListener('click', function (e) {
        var k = +b.getAttribute('data-k'), at = on.indexOf(k);
        if (at >= 0) on.splice(at, 1); else { on.push(k); hearts(e.clientX, e.clientY, 4); }
        b.classList.toggle('on', at < 0); gsave(key, on);
        var r = $('.result', el), all = on.length >= items.length;
        if (all && r.hidden) { r.hidden = false; r.classList.add('fade-in'); confetti(60); }
        else if (!all) r.hidden = true;
      });
    });
  };

  GAMES.pairs = function (el, g, key) {
    var won = gstate(key, false);
    function build() {
      var deck = shuffle((g.icons || []).concat(g.icons || []));
      el.innerHTML = head(g, 'Переворачивай карточки и ищи одинаковые') +
        '<div class="pairs">' + deck.map(function (ic, k) {
          return '<button class="pc" data-ic="' + esc(ic) + '" data-k="' + k + '"><div class="in"><div class="f"></div><div class="b">' + esc(ic) + '</div></div></button>';
        }).join('') + '</div><div class="muted small center mv" style="margin-top:10px"></div>' +
        '<div class="result hand"' + (won ? '' : ' hidden') + '>' + esc(g.done) + '</div>';
      var open = [], lock = false, moves = 0, okN = 0, total = (g.icons || []).length;
      var mv = $('.mv', el);
      $$('.pc', el).forEach(function (c) {
        c.addEventListener('click', function () {
          if (lock || c.classList.contains('up') || c.classList.contains('ok')) return;
          c.classList.add('up'); open.push(c);
          if (open.length < 2) return;
          moves++; mv.textContent = 'Ходов: ' + moves;
          var a = open[0], b = open[1]; open = [];
          if (a.getAttribute('data-ic') === b.getAttribute('data-ic')) {
            setTimeout(function () {
              a.classList.add('ok'); b.classList.add('ok'); okN++;
              var cc = centerOf(b); hearts(cc[0], cc[1], 5);
              if (okN === total) {
                won = true; gsave(key, true);
                var r = $('.result', el); r.hidden = false; r.classList.add('fade-in');
                mv.innerHTML = 'Готово за ' + moves + ' ' + plural(moves, ['ход', 'хода', 'ходов']) + ' · <button class="link again">сыграть ещё</button>';
                $('.again', el).addEventListener('click', build);
                confetti(70);
              }
            }, 350);
          } else {
            lock = true;
            setTimeout(function () { a.classList.remove('up'); b.classList.remove('up'); lock = false; }, 850);
          }
        });
      });
    }
    build();
  };

  GAMES.party = function (el, g, key) {
    var done = gstate(key, false);
    el.innerHTML = '<div class="center">' + head(g, 'Половина пути — это повод') +
      '<div style="font-size:64px;line-height:1;margin:6px 0 14px">🚂💨</div>' +
      '<button class="btn">' + esc(g.button || 'Отметить!') + '</button>' +
      '<div class="result hand"' + (done ? '' : ' hidden') + '>' + esc(g.done) + '</div></div>';
    $('.btn', el).addEventListener('click', function (e) {
      confetti(140); hearts(e.clientX, e.clientY, 14, ['🎉', '🎊', '❤️', '✨']);
      gsave(key, true);
      var r = $('.result', el); r.hidden = false; r.classList.add('fade-in');
    });
  };

  GAMES.oracle = function (el, g, key) {
    var prev = '';
    el.innerHTML = '<div class="center">' + head(g, g.hint) + '</div><div class="orb-wrap"><div class="orb"><div class="win">спроси меня</div></div>' +
      '<input class="field" placeholder="твой вопрос (можно про себя)" style="font-size:16px;letter-spacing:0;font-weight:500" enterkeyhint="done">' +
      '<button class="btn block" style="margin-top:10px">Встряхнуть 🔮</button></div>';
    var orb = $('.orb', el), win = $('.win', el), busy = false;
    $('.btn', el).addEventListener('click', function () {
      if (busy) return; busy = true;
      try { $('input', el).blur(); } catch (x) {}
      win.textContent = '…';
      orb.classList.remove('shaking'); void orb.offsetWidth; orb.classList.add('shaking');
      setTimeout(function () {
        prev = pickNot(g.items, prev);
        win.innerHTML = '<span class="fade-in">' + esc(prev) + '</span>'; busy = false;
        var c = centerOf(orb); hearts(c[0], c[1], 6, ['✨', '🔮', '💜']);
      }, 950);
    });
  };

  GAMES.quiz = function (el, g, key) {
    var qs = g.items || [];
    function finalView(score) {
      var msg = score === qs.length ? 'Идеально. Ты знаешь меня лучше, чем я сам.' :
        score >= qs.length / 2 ? 'Хорошо! Остальное я расскажу тебе сам, когда вернусь.' : 'Ничего, у нас будет вся жизнь, чтобы узнать друг друга ещё лучше.';
      el.innerHTML = head(g) + '<div class="center"><div class="h1 grad">' + score + ' / ' + qs.length + '</div><div class="result hand" style="text-align:left">' + esc(msg) + '</div>' +
        '<button class="btn ghost sm again" style="margin-top:12px">пройти ещё раз</button></div>';
      $('.again', el).addEventListener('click', function () { step(0, 0); });
    }
    function step(k, score) {
      if (k >= qs.length) { gsave(key, score); finalView(score); if (score === qs.length) confetti(80); return; }
      var q = qs[k];
      el.innerHTML = head(g) + '<div class="qz"><div class="prog">' + qs.map(function (_, j) { return '<i class="' + (j <= k ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="q">' + esc(q.q) + '</div>' + q.a.map(function (a, j) { return '<button class="opt" data-j="' + j + '">' + esc(a) + '</button>'; }).join('') +
        '<div class="fb"></div></div>';
      var answered = false;
      $$('.opt', el).forEach(function (b) {
        b.addEventListener('click', function (e) {
          if (answered) return; answered = true;
          var j = +b.getAttribute('data-j'), ok = j === q.correct;
          b.classList.add(ok ? 'right' : 'wrong');
          if (!ok) { var r = $$('.opt', el)[q.correct]; if (r) r.classList.add('right'); }
          if (ok) hearts(e.clientX, e.clientY, 6);
          $('.fb', el).innerHTML = '<div class="result hand fade-in">' + esc(ok ? q.yes : q.no) + '</div>' +
            '<button class="btn block nx" style="margin-top:12px">' + (k + 1 < qs.length ? 'Дальше' : 'Результат') + '</button>';
          $('.nx', el).addEventListener('click', function () { step(k + 1, score + (ok ? 1 : 0)); });
        });
      });
    }
    var saved = gstate(key, null);
    if (saved != null) finalView(saved); else step(0, 0);
  };

  GAMES.choose = function (el, g, key) {
    var sel = gstate(key, []), max = g.max || 3, items = g.items || [];
    el.innerHTML = head(g, g.hint) + '<div class="chips">' + items.map(function (t, k) {
      return '<button class="chip' + (sel.indexOf(k) >= 0 ? ' on' : '') + '" data-k="' + k + '">' + esc(t) + '</button>';
    }).join('') + '</div><div class="result hand cm" hidden></div>';
    var cm = $('.cm', el);
    function upd() {
      if (sel.length >= max) { cm.hidden = false; cm.textContent = 'Записал! Когда вернусь — так и сделаем. Обещаю.'; }
      else { cm.hidden = sel.length === 0; cm.textContent = 'Выбрано ' + sel.length + ' из ' + max; }
    }
    upd();
    $$('.chip', el).forEach(function (b) {
      b.addEventListener('click', function (e) {
        var k = +b.getAttribute('data-k'), at = sel.indexOf(k);
        if (at >= 0) sel.splice(at, 1);
        else if (sel.length >= max) { toast('Только ' + max + '! Остальное — потом 🙂'); return; }
        else { sel.push(k); hearts(e.clientX, e.clientY, 4); }
        b.classList.toggle('on', at < 0); gsave(key, sel); upd();
      });
    });
  };

  GAMES.reveal = function (el, g, key) {
    var done = gstate(key, false);
    el.innerHTML = head(g, done ? '' : g.hint) + '<div class="reveal"><div class="txt" style="filter:blur(' + (done ? 0 : 12) + 'px)">' + esc(g.text) + '</div><i class="meter"></i></div>';
    if (done) return;
    var box = $('.reveal', el), txt = $('.txt', el), meter = $('.meter', el);
    var p = 0, holding = false, raf = 0, last = 0, fin = false;
    function frame(t) {
      var dt = last ? Math.min(.05, (t - last) / 1000) : 0; last = t;
      p = holding ? Math.min(1, p + dt / 2.2) : Math.max(0, p - dt * .6);
      txt.style.filter = 'blur(' + (12 * (1 - p)).toFixed(2) + 'px)';
      meter.style.width = (p * 100) + '%';
      if (p >= 1 && !fin) {
        fin = true; gsave(key, true); txt.style.filter = 'none'; meter.style.opacity = 0;
        var c = centerOf(box); hearts(c[0], c[1], 16);
        raf = 0; return;
      }
      if (!fin && (holding || p > 0)) raf = requestAnimationFrame(frame); else { raf = 0; last = 0; }
    }
    box.addEventListener('pointerdown', function (e) { if (fin) return; e.preventDefault(); holding = true; if (!raf) { last = 0; raf = requestAnimationFrame(frame); } });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { box.addEventListener(ev, function () { holding = false; }); });
    box.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  GAMES.door = function (el, g) {
    el.innerHTML = '<div class="center">' + head(g, 'Постучи') + '<div class="door"><div class="knob"></div><div class="kh"></div><div class="door-glow"></div></div>' +
      '<div class="result hand" hidden style="text-align:left;margin-top:22px">' + esc(g.text) + '</div></div>';
    var d = $('.door', el);
    d.addEventListener('click', function () {
      d.classList.remove('rattle'); void d.offsetWidth; d.classList.add('rattle');
      var r = $('.result', el); if (r.hidden) { r.hidden = false; r.classList.add('fade-in'); }
    });
  };

  /* ===================== ОТКРОЙ, КОГДА ===================== */
  ROUTES.letters = function (v) {
    var ow = C.openWhen || [];
    var h = '<header class="rise" style="margin-bottom:18px"><h1 class="h1">Открой, когда…</h1><p class="muted" style="margin:6px 0 0">Письма для разных моментов. Открывай, когда правда нужно — они не кончаются, их можно перечитывать.</p></header>';
    h += '<div class="env-grid">' + ow.map(function (o, k) {
      return '<button class="env rise d' + Math.min(6, k + 1) + (S.ow.indexOf(k) >= 0 ? ' read' : '') + '" data-k="' + k + '">' +
        '<div class="body"></div><div class="flap"></div><div class="seal">' + esc(o.icon || '❤') + '</div>' +
        '<div class="lbl"><small>открой, когда</small>' + esc(o.when) + '</div></button>';
    }).join('') + '</div>';
    v.innerHTML = h;
    $$('.env', v).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = +b.getAttribute('data-k'), o = ow[k];
        if (b.classList.contains('opening')) return;
        b.classList.add('opening');
        setTimeout(function () {
          b.classList.remove('opening');
          if (S.ow.indexOf(k) < 0) { S.ow.push(k); save('ow'); b.classList.add('read'); }
          sheet('<div class="ow-when">Открой, когда ' + esc(o.when) + '</div><div style="height:14px"></div><div class="ow-text paper-reveal">' +
            paras(o.text).map(function (p, j) { return '<p style="animation-delay:' + (j * .25).toFixed(2) + 's">' + esc(p) + '</p>'; }).join('') +
            '</div><div class="sign">' + esc(C.me || '') + ' ❤</div>', { cls: 'paper-sheet' });
        }, 620);
      });
    });
  };

  /* ===================== ВОСПОМИНАНИЯ ===================== */
  ROUTES.memories = function (v) {
    var ms = C.memories || [];
    if (!ms.length) { v.innerHTML = '<h1 class="h1">Память</h1><p class="muted">Скоро здесь появятся наши воспоминания.</p>'; return; }
    var cur = -1;
    function nextIdx() {
      var pool = ms.map(function (_, k) { return k; }).filter(function (k) { return S.mem.indexOf(k) < 0 && k !== cur; });
      if (!pool.length) pool = ms.map(function (_, k) { return k; }).filter(function (k) { return k !== cur; });
      return pool.length ? pick(pool) : 0;
    }
    function cardHTML(m) {
      var ph = m.img ? '<img src="' + esc(m.img) + '" alt="" decoding="async" onerror="this.parentNode.innerHTML=\'' + esc(m.e || '✨') + '\'">' : esc(m.e || '✨');
      return '<div class="ph">' + ph + '</div><div class="cap"><b>' + esc(m.t) + '</b><span>' + esc(m.d) + '</span></div>';
    }
    v.innerHTML = '<header class="rise" style="margin-bottom:8px"><h1 class="h1">Память</h1><p class="muted" style="margin:6px 0 0">Колода наших моментов. Тяни карточку или смахни её в сторону.</p></header>' +
      '<div class="deck rise d1"><div class="polaroid back2"></div><div class="polaroid back1"></div><div class="polaroid main"></div></div>' +
      '<div class="center rise d2"><button class="btn nextm">Ещё воспоминание</button><p class="faint small cnt" style="margin-top:10px"></p></div>';
    var card = $('.polaroid.main', v), cnt = $('.cnt', v), busy = false;
    function show(k, enter) {
      cur = k;
      if (S.mem.indexOf(k) < 0) { S.mem.push(k); save('mem'); }
      card.innerHTML = cardHTML(ms[k]);
      card.style.transform = '';
      if (enter) { card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter'); }
      cnt.textContent = 'Ты видела ' + Math.min(S.mem.length, ms.length) + ' из ' + ms.length;
      fitDeck();
    }
    function fitDeck() {
      requestAnimationFrame(function () { var d = $('.deck', v); if (d && card.offsetHeight) d.style.height = (card.offsetHeight + 16) + 'px'; });
    }
    function next(dir) {
      if (busy) return; busy = true;
      card.classList.add(dir > 0 ? 'fly-r' : 'fly');
      setTimeout(function () {
        card.classList.remove('fly', 'fly-r');
        card.style.transition = 'none';
        show(nextIdx(), true);
        void card.offsetWidth; card.style.transition = '';
        busy = false;
      }, 380);
    }
    show(nextIdx(), true);
    $('.nextm', v).addEventListener('click', function () { next(-1); });
    var sx = null, dx = 0;
    card.addEventListener('pointerdown', function (e) { if (busy) return; sx = e.clientX; dx = 0; card.style.transition = 'none'; });
    card.addEventListener('pointermove', function (e) {
      if (sx == null) return;
      dx = e.clientX - sx;
      card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 18) + 'deg)';
    });
    function up() {
      if (sx == null) return;
      sx = null; card.style.transition = '';
      if (Math.abs(dx) > 70) next(dx > 0 ? 1 : -1); else card.style.transform = '';
    }
    card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up); card.addEventListener('pointerleave', up);
    var onR = function () { fitDeck(); };
    window.addEventListener('resize', onR);
    onLeave(function () { window.removeEventListener('resize', onR); });
    $$('img', card).forEach(function (im) { im.addEventListener('load', fitDeck); });
  };

  /* ===================== МОЙ ДЕНЬ ===================== */
  ROUTES.day = function (v) {
    var sc = C.schedule || [], ci = currentSlot(now());
    v.innerHTML = backBtn('home', 'Домой') +
      '<header class="rise" style="margin-bottom:14px"><h1 class="h1">Мой день</h1><p class="muted" style="margin:6px 0 0">Примерно так проходит каждый мой день. Подсвечено — что я делаю прямо сейчас. Нажми на любой час.</p></header>' +
      '<section class="card tl rise d1" style="padding:8px">' + sc.map(function (s, k) {
        return '<button class="tl-i' + (k === ci ? ' now' : '') + '" data-k="' + k + '"><span class="tm">' + hhmm(s.from) + '</span><span class="ic">' + esc(s.icon || '•') + '</span>' +
          '<span style="flex:1"><span class="nm">' + esc(s.name) + (k === ci ? ' <span class="pill" style="margin-left:4px">сейчас</span>' : '') + '</span>' +
          '<span class="ph" style="display:block">' + (k === ci ? esc(pick(s.lines)) : '') + '</span></span></button>';
      }).join('') + '</section>' +
      '<p class="faint small center" style="margin-top:14px">Распорядок примерный. Но мысли о тебе — по расписанию всегда.</p>';
    $$('.tl-i', v).forEach(function (b) {
      b.addEventListener('click', function () {
        var s = sc[+b.getAttribute('data-k')], ph = $('.ph', b);
        ph.innerHTML = '<span class="fade-in">' + esc(pickNot(s.lines, ph.textContent)) + '</span>';
      });
    });
    var cur = $('.tl-i.now', v);
    if (cur) setTimeout(function () { try { cur.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }, 500);
  };

  /* ===================== ЗАПИСКИ ===================== */
  ROUTES.notes = function (v) {
    function list() {
      if (!S.notes.length) return '<p class="faint center small" style="margin-top:20px">Пока пусто. Напиши первую ❤</p>';
      var n = now();
      return S.notes.slice().reverse().map(function (x) {
        var d = new Date(x.t), ago = dayDiff(d, n);
        var agoS = ago <= 0 ? 'сегодня' : ago === 1 ? 'вчера' : ago + ' ' + plural(ago, ['день', 'дня', 'дней']) + ' назад';
        return '<div class="note"><div class="nt sel">' + esc(x.x) + '</div><div class="nd"><span>' + fmtDate(d) + ', ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' · ' + agoS + '</span>' +
          '<button class="del" data-t="' + x.t + '">удалить</button></div></div>';
      }).join('');
    }
    v.innerHTML = '<header class="rise" style="margin-bottom:14px"><h1 class="h1">Записки</h1><p class="muted" style="margin:6px 0 0">Пиши мне сюда что угодно. Они хранятся только на этом телефоне — когда я вернусь, мы прочитаем их вместе.</p></header>' +
      '<section class="card rise d1"><textarea class="field" maxlength="2000" placeholder="Привет. Сегодня я…"></textarea>' +
      '<button class="btn block savebtn" style="margin-top:10px">Оставить записку</button></section>' +
      '<div class="section-t">Твои записки · ' + S.notes.length + '</div><div class="nlist">' + list() + '</div>';
    var ta = $('textarea', v), nl = $('.nlist', v);
    try { var draft = sessionStorage.getItem('lv_draft'); if (draft) ta.value = draft; } catch (e) {}
    ta.addEventListener('input', function () { try { sessionStorage.setItem('lv_draft', ta.value); } catch (e) {} });
    function bind() {
      $$('.del', nl).forEach(function (b) {
        b.addEventListener('click', function () {
          var ok = true; try { ok = window.confirm('Удалить эту записку?'); } catch (e) {}
          if (!ok) return;
          var t = +b.getAttribute('data-t');
          S.notes = S.notes.filter(function (x) { return x.t !== t; }); save('notes');
          nl.innerHTML = list(); bind();
          $('.section-t', v).textContent = 'Твои записки · ' + S.notes.length;
        });
      });
    }
    bind();
    $('.savebtn', v).addEventListener('click', function (e) {
      var x = ta.value.trim();
      if (!x) { ta.focus(); return; }
      S.notes.push({ t: Date.now() + timeOffset, x: x }); save('notes');
      ta.value = ''; try { sessionStorage.removeItem('lv_draft'); ta.blur(); } catch (er) {}
      nl.innerHTML = list(); bind();
      $('.section-t', v).textContent = 'Твои записки · ' + S.notes.length;
      hearts(e.clientX, e.clientY, 12);
      toast('Сохранил. Прочитаю, когда вернусь ❤️');
      if (S.notes.length === 5 && !store.get('note5', false)) {
        store.set('note5', true);
        setTimeout(function () {
          sheet('<div class="center"><div style="font-size:56px">✉️</div><div class="h2" style="margin:6px 0 8px">Пять записок!</div><p class="muted">Ты пишешь мне — и я это чувствую. Секретное слово для тайника:</p><div class="big-phrase" style="min-height:0">«письмо»</div></div>');
        }, 900);
      }
    });
  };

  /* ===================== ФИНАЛ ===================== */
  ROUTES.final = function (v) {
    if (!finalOpen()) { go('chapters'); return; }
    var missing = chapters.filter(function (ch) { return !isRead(ch.i); });
    var h = backBtn('chapters', 'Главы') + '<section class="gate" style="min-height:calc(100dvh - 220px)">' +
      '<div class="moon-big rise"><div class="moon"></div></div>' +
      '<div class="tiny faint rise d1">конечная</div><h1 class="h1 rise d1" style="margin-top:6px">Станция <span class="grad it">«Дом»</span></h1>';
    if (missing.length) {
      h += '<p class="muted rise d2">Чтобы буквы сложились, нужно открыть все главы. Не хватает ещё ' + missing.length + ':</p>' +
        '<div class="rise d3" style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center">' +
        missing.map(function (ch) { return '<a class="btn ghost sm" href="#/chapter/' + ch.i + '">' + (ch.i + 1) + '. ' + esc(ch.c.title) + '</a>'; }).join('') + '</div>';
    } else {
      h += '<p class="muted rise d2">Год позади. Все буквы собраны. Последний поезд готов к отправлению.</p>' +
        '<p class="faint small rise d2">' + (C.music ? 'Включи звук 🔊 ' : '') + 'Устройся поудобнее.</p>' +
        '<div class="rise d3" style="margin-top:22px"><button class="btn gofin">Я готова</button></div>';
    }
    h += '</section>';
    v.innerHTML = h;
    var b = $('.gofin', v);
    if (b) b.addEventListener('click', runFinal);
  };

  function svgURL(s) { return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")'; }
  var SVG_FAR = svgURL('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 900 300" preserveAspectRatio="none"><path d="M0 300V170l80-50 70 40 90-90 90 80 90-40 100 70 80-90 100 60 80-50 120 70v130z" fill="#2b3180"/><path d="M0 300V215l120-30 110 25 140-45 120 40 130-30 120 25 160-20v140z" fill="#1d2263"/></svg>');
  var SVG_MID = svgURL('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200" viewBox="0 0 640 200" preserveAspectRatio="none"><path d="M0 120Q80 80 160 105T320 100T480 110T640 120V200H0z" fill="#121640"/><path d="M50 112l12-42 12 42zM74 110l9-30 9 30zM210 102l14-50 14 50zM236 104l9-28 9 28zM520 112l11-38 11 38zM544 114l8-26 8 26z" fill="#121640"/><rect x="380" y="78" width="40" height="30" fill="#121640"/><path d="M374 80l26-20 26 20z" fill="#121640"/><rect x="390" y="88" width="8" height="8" fill="#ffcf8a"/><rect x="404" y="88" width="8" height="8" fill="#ffb37a" opacity=".8"/></svg>');
  var SVG_POLES = svgURL('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="600" viewBox="0 0 700 600" preserveAspectRatio="none"><path d="M8 80Q350 150 700 80" stroke="#05060f" stroke-width="2.5" fill="none"/><path d="M8 100Q350 165 700 100" stroke="#05060f" stroke-width="1.5" fill="none"/><rect x="2" y="60" width="10" height="540" fill="#05060f"/><rect x="-14" y="74" width="42" height="7" fill="#05060f"/></svg>');
  var SVG_NEAR = svgURL('<svg xmlns="http://www.w3.org/2000/svg" width="520" height="200" viewBox="0 0 520 200" preserveAspectRatio="none"><path d="M0 60Q60 40 130 55T260 50T390 58T520 60V200H0z" fill="#06071a"/><path d="M30 60q6-24 12 0M120 56q5-20 10 0M300 52q7-28 14 0M420 58q5-18 10 0" fill="#06071a"/><rect y="150" width="520" height="3" fill="#2a2a50"/><rect y="168" width="520" height="3" fill="#2a2a50"/></svg>');

  function runFinal() {
    if (!isRead('f')) { S.read.push('f'); save('read'); }
    Sky.pause();
    document.body.classList.add('lock');
    var fin = document.createElement('div');
    fin.id = 'fin';
    fin.innerHTML = '<div class="shake-cam"><div class="scene"><div class="fstars"></div><div class="fmoon"><div class="moon"></div></div>' +
      '<div class="layer l-far" style="--h:40%;--b:20%;--w:900px"></div>' +
      '<div class="layer l-mid" style="--h:26%;--b:18%;--w:640px"></div>' +
      '<div class="stations"></div>' +
      '<div class="layer l-near" style="--h:22%;--b:0px;--w:520px"></div>' +
      '<div class="layer l-poles" style="--h:100%;--b:0px;--w:700px"></div>' +
      '</div><div class="window"></div></div>' +
      '<div class="top-cap">поезд «Год» · следует до станции «Дом»</div><div class="cap"></div>' +
      '<button class="fx" aria-label="Закрыть">×</button>';
    document.body.appendChild(fin);
    requestAnimationFrame(function () { fin.classList.add('on'); });

    var audio = null;
    if (C.music) { try { audio = new Audio(C.music); audio.loop = true; audio.volume = .75; var pr = audio.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) { audio = null; } }

    var L = { far: $('.l-far', fin), mid: $('.l-mid', fin), near: $('.l-near', fin), poles: $('.l-poles', fin) };
    L.far.style.backgroundImage = SVG_FAR; L.mid.style.backgroundImage = SVG_MID;
    L.near.style.backgroundImage = SVG_NEAR; L.poles.style.backgroundImage = SVG_POLES;
    var stBox = $('.stations', fin), cap = $('.cap', fin), cam = $('.shake-cam', fin);
    var W = fin.clientWidth || window.innerWidth;
    var O = 0, v = 1100, raf = 0, last = 0, t0 = 0, alive = true;
    var list = chapters.slice(), next = 0, nextAt = 1.4, live = [];
    var braking = null, stopped = false, timers = [];
    var ST = 0.9; // скорость станций относительно O
    var memo = C.memories || [];

    function later(fn, ms) { timers.push(setTimeout(function () { if (alive) fn(); }, ms)); }
    function setCap(txt) {
      cap.style.opacity = 0;
      later(function () { cap.innerHTML = txt; cap.style.opacity = 1; }, 450);
    }
    function spawn(ch, home) {
      var el = document.createElement('div');
      el.className = 'f-st' + (home ? ' home' : '');
      if (home) el.innerHTML = '<div class="sign"><small>станция</small>Дом</div><div class="post"></div><div class="lamp"></div>';
      else {
        var c = ch.c, m = memo[ch.i % (memo.length || 1)] || {};
        var ph = c.photo ? '<img src="' + esc(c.photo) + '" alt="">' : (m.img ? '<img src="' + esc(m.img) + '" alt="">' : esc(m.e || '✨'));
        el.innerHTML = '<div class="memo"><div class="mp">' + ph + '</div>' + esc(c.title) + '</div>' +
          '<div class="sign"><small>' + MONTHS[ch.date.getMonth()] + '</small>' + esc(c.title) + '</div><div class="post"></div><div class="lamp"></div>';
      }
      stBox.appendChild(el);
      var w = el.offsetWidth || 230;
      var item = { el: el, x0: W + 30, o0: O, w: w, home: home };
      live.push(item);
      el.style.transform = 'translate3d(' + item.x0 + 'px,0,0)';
      if (home) {
        var D = (item.x0 - (W / 2 - w / 2)) / ST;
        braking = { a: v * v / (2 * D), target: O + D };
        setCap('Следующая станция — «Дом»');
      } else {
        var first = paras(ch.c.text)[0] || '';
        var mm = first.match(/^[\s\S]*?[.!?…](?=\s|$)/);
        var sent = mm ? mm[0] : first;
        if (sent.length > 110) sent = sent.slice(0, 107) + '…';
        setCap(esc(sent));
      }
    }
    function frame(t) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!last) { last = t; t0 = t; }
      var dt = Math.min(.05, (t - last) / 1000); last = t;
      var el = (t - t0) / 1000;
      if (!braking) {
        var targetV = 1100 - 600 * (next / list.length);
        v += (targetV - v) * Math.min(1, dt * 1.5);
        if (el >= nextAt) {
          if (next < list.length) { spawn(list[next], false); next++; nextAt = el + 2.3 + next * .08; }
          else spawn(null, true);
        }
      } else if (!stopped) {
        v = Math.max(0, v - braking.a * dt);
        if (v <= 4 || O >= braking.target) { O = braking.target; v = 0; stopped = true; arrive(); }
      }
      O += v * dt;
      if (braking && O > braking.target) O = braking.target;
      L.far.style.transform = 'translate3d(' + (-(O * .1 % 900)).toFixed(1) + 'px,0,0)';
      L.mid.style.transform = 'translate3d(' + (-(O * .35 % 640)).toFixed(1) + 'px,0,0)';
      L.near.style.transform = 'translate3d(' + (-(O * 1.1 % 520)).toFixed(1) + 'px,0,0)';
      L.poles.style.transform = 'translate3d(' + (-(O * 1.7 % 700)).toFixed(1) + 'px,0,0)';
      for (var k = live.length - 1; k >= 0; k--) {
        var it = live[k], x = it.x0 - (O - it.o0) * ST;
        if (x < -it.w - 40) { it.el.remove(); live.splice(k, 1); continue; }
        it.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
      }
      if (stopped) { cancelAnimationFrame(raf); raf = 0; }
    }
    function arrive() {
      cam.classList.add('stop');
      setCap('Поезд прибыл. Конечная станция — «Дом».');
      later(assemble, 3200);
    }
    function assemble() {
      var a = document.createElement('div');
      a.className = 'assemble';
      var html = '<div class="tiny" style="opacity:.6;margin-bottom:14px;text-align:center">буквы, которые ты собирала весь год</div>';
      var tiles = [];
      PHRASE_WORDS.forEach(function (w) {
        html += '<div class="phrase-row">' + w.map(function (ch) {
          tiles.push(ch);
          return '<span class="ph-tile" style="--x:' + ((Math.random() - .5) * W * 1.2).toFixed(0) + 'px;--y:' + ((Math.random() - .5) * 600).toFixed(0) + 'px;--r:' + ((Math.random() - .5) * 200).toFixed(0) + 'deg">' + esc(ch) + '</span>';
        }).join('') + '</div>';
      });
      html += '<div class="fin-say">' + esc(FINAL.sayIt || 'Скажи мне это, когда увидишь меня.') + '</div><div class="fin-rest" style="width:100%;max-width:520px;margin-top:30px" hidden></div>';
      a.innerHTML = html;
      fin.appendChild(a);
      requestAnimationFrame(function () { a.classList.add('on'); });
      var els = $$('.ph-tile', a);
      els.forEach(function (e, k) { later(function () { e.classList.add('in'); }, 1200 + k * 170); });
      var tEnd = 1200 + els.length * 170 + 1300;
      later(function () {
        els.forEach(function (e) { e.classList.add('glow'); });
        $('.fin-say', a).classList.add('on');
        hearts(W / 2, window.innerHeight / 2, 30);
      }, tEnd);
      later(function () {
        var rest = $('.fin-rest', a);
        rest.innerHTML = '<article class="paper fade-in">' + letterHTML(FINAL.text) + '</article>' +
          ((FINAL.after || []).length ? '<section class="card fade-in" style="margin-top:18px"><div class="h3" style="margin-bottom:6px">Что нас ждёт дальше</div>' +
            FINAL.after.map(function (x) { return '<div class="after-i"><span>✦</span><span>' + esc(x) + '</span></div>'; }).join('') + '</section>' : '') +
          '<div class="ch-nav" style="margin-bottom:30px"><button class="btn ghost again">Прокатиться ещё раз</button><button class="btn closef">Домой</button></div>';
        rest.hidden = false;
        $('.again', rest).addEventListener('click', function () { close(); setTimeout(runFinal, 300); });
        $('.closef', rest).addEventListener('click', function () { close(); go('home'); });
      }, tEnd + 3500);
    }
    function close() {
      if (!alive) return;
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      if (audio) try { audio.pause(); } catch (e) {}
      fin.classList.remove('on');
      setTimeout(function () { if (fin.parentNode) fin.parentNode.removeChild(fin); }, 700);
      document.body.classList.remove('lock');
      Sky.resume();
    }
    $('.fx', fin).addEventListener('click', close);
    onLeave(close);
    setCap('Поезд отправляется…');
    if (reduced) { later(function () { stopped = true; assemble(); }, 800); return; }
    raf = requestAnimationFrame(frame);
  }

  /* ===================== панель тестирования (только с ?dev=КЛЮЧ) ===================== */
  function isoLocal(d) {
    function z(x) { return ('0' + x).slice(-2); }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes());
  }
  function devGo(t) {
    var p = new URLSearchParams(location.search);
    p.set('dev', C.devKey);
    if (t) p.set('t', t); else p.delete('t');
    location.href = location.pathname + '?' + p.toString() + location.hash;
  }
  function atNoon(d) { var x = new Date(d.getTime()); x.setHours(12, 0, 0, 0); return isoLocal(x); }
  function dayShift(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  function contentChecks() {
    var out = [];
    function row(ok, text) { out.push('<div class="dv-chk ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'warn') + '">' + (ok === true ? '✓' : ok === false ? '✗' : '!') + ' ' + text + '</div>'); }
    row(CH.length === 12 ? true : null, 'Глав: ' + CH.length + (CH.length === 12 ? '' : ' (задумано 12)'));
    var joined = ALL_LETTERS.join(''), want = String(C.phrase || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^A-ZА-Я]/g, '');
    row(joined.replace(/Ё/g, 'Е') === want, 'Акростих: первые буквы писем «' + esc(joined) + '», фраза «' + esc(want) + '»');
    row(START < END, 'Отъезд ' + fmtDate(START) + ' ' + START.getFullYear() + ' → дембель ' + fmtDate(END) + ' ' + END.getFullYear());
    var lastCh = chapters[chapters.length - 1];
    if (lastCh) row(lastCh.date < END, 'Последняя глава открывается ' + fmtDate(lastCh.date) + ' — до финала');
    row((C.entryCodes || []).length > 0, 'Код входа: ' + esc((C.entryCodes || []).join(', ') || 'не задан'));
    row(!!C.homeCode, 'Слово возвращения: ' + esc(C.homeCode || 'не задано'));
    var codes = (C.secrets || []).map(function (s) { return norm(s.code); });
    var dup = codes.filter(function (c, i) { return codes.indexOf(c) !== i; });
    row(!dup.length, 'Секретных слов: ' + codes.length + (dup.length ? ' — повторы: ' + esc(dup.join(', ')) : ''));
    row(C.devKey !== 'proverka-2026' ? true : null, 'Ключ теста ' + (C.devKey === 'proverka-2026' ? 'стандартный — смени перед отправкой' : 'свой'));
    var noPhoto = (C.memories || []).filter(function (m) { return !m.img; }).length;
    row(noPhoto ? null : true, 'Воспоминаний: ' + (C.memories || []).length + ', без фото: ' + noPhoto);
    var chNoPhoto = CH.filter(function (c) { return !c.photo; }).length;
    row(chNoPhoto ? null : true, 'Глав без фото: ' + chNoPhoto);
    row(C.birthday ? true : null, 'День рождения: ' + esc(C.birthday || 'не указан'));
    return out.join('') + '<div class="dv-imgs"></div>';
  }
  function checkImages(box) {
    var paths = [];
    CH.forEach(function (c) { if (c.photo) paths.push(c.photo); });
    (C.memories || []).forEach(function (m) { if (m.img) paths.push(m.img); });
    if (C.music) paths.push(C.music);
    if (!paths.length) return;
    var bad = [], left = paths.length;
    paths.forEach(function (p) {
      function done(ok) {
        if (!ok) bad.push(p);
        if (--left === 0) box.innerHTML = '<div class="dv-chk ' + (bad.length ? 'bad' : 'ok') + '">' + (bad.length ? '✗ Не найдены файлы: ' + esc(bad.join(', ')) : '✓ Все ' + paths.length + ' файлов фото/музыки на месте') + '</div>';
      }
      if (/\.(mp3|m4a|ogg|wav)$/i.test(p)) { fetch(p, { method: 'HEAD' }).then(function (r) { done(r.ok); }).catch(function () { done(false); }); return; }
      var im = new Image(); im.onload = function () { done(true); }; im.onerror = function () { done(false); }; im.src = p;
    });
  }

  function devPanel() {
    var n = now();
    var jumps = [['За 3 дня до отъезда', atNoon(dayShift(START, -3))]]
      .concat(chapters.map(function (ch) { return ['Гл. ' + (ch.i + 1) + ' · ' + fmtDate(ch.date), atNoon(ch.date)]; }))
      .concat([['Накануне дембеля', atNoon(dayShift(END, -1))], ['Дембель · финал', atNoon(END)]]);
    var sp = C.specialDays || {};
    var y = START.getFullYear();
    var specials = Object.keys(sp).concat(C.birthday ? [C.birthday] : []).map(function (k) {
      var p = k.split('-'), d = new Date(y, +p[0] - 1, +p[1]);
      if (d < START) d = new Date(y + 1, +p[0] - 1, +p[1]);
      return [k === C.birthday ? 'ДР ' + fmtDate(d) : fmtDate(d), atNoon(d)];
    });
    var hours = [[6.5, 'подъём'], [7.5, 'завтрак'], [8.5, 'развод'], [10, 'занятия'], [13.5, 'обед'], [15, 'работы'], [18.5, 'ужин'], [20, 'личное'], [21.75, 'поверка'], [23, 'отбой']];
    function btns(list, cls) { return list.map(function (j) { return '<button class="chip ' + cls + '" data-t="' + j[1] + '">' + esc(j[0]) + '</button>'; }).join(''); }
    var s = sheet(
      '<div class="h2">🛠 Тестирование</div><p class="muted small" style="margin:4px 0 14px">Видно только тебе (по ссылке с ключом). Сейчас на сайте: <b class="gold">' + WD[n.getDay()] + ', ' + fmtDate(n) + ' ' + n.getFullYear() + ', ' + hhmm(n.getHours() + n.getMinutes() / 60) + '</b></p>' +
      '<div class="section-t" style="margin-top:0">Машина времени</div>' +
      '<div class="row"><input type="datetime-local" class="field dv-dt" value="' + isoLocal(n) + '" style="font-size:16px;letter-spacing:0"><button class="btn sm dv-go">Перейти</button></div>' +
      '<div class="chips" style="margin-top:10px">' + btns(jumps, 'dv-j') + '</div>' +
      '<div class="section-t">Праздники</div><div class="chips">' + btns(specials, 'dv-j') + '</div>' +
      '<div class="section-t">Время суток (для «Где ты сейчас?»)</div><div class="chips">' +
      hours.map(function (h) { return '<button class="chip dv-h" data-h="' + h[0] + '">' + hhmm(h[0]) + ' ' + h[1] + '</button>'; }).join('') + '</div>' +
      '<div class="section-t">Прогресс</div><div class="chips">' +
      '<button class="chip dv-a" data-a="real">Реальное время</button>' +
      '<button class="chip dv-a" data-a="readall">Прочитать все главы</button>' +
      '<button class="chip dv-a" data-a="home">' + (S.home ? 'Убрать слово возвращения' : 'Ввести слово возвращения') + '</button>' +
      '<button class="chip dv-a" data-a="gift">Подарок дня заново</button>' +
      '<button class="chip dv-a" data-a="visits">Визиты: ' + S.visits + ' → +6</button>' +
      '<button class="chip dv-a" data-a="gate">Экран входа</button>' +
      '<button class="chip dv-a" data-a="reset" style="border-color:rgba(255,140,160,.5)">Сбросить всё, как у неё в первый раз</button>' +
      '<button class="chip dv-a" data-a="off">Выйти из теста</button></div>' +
      '<div class="section-t">Проверка контента</div><div class="dv-report">' + contentChecks() + '</div>'
    );
    checkImages($('.dv-imgs', s.el));
    $$('.dv-j', s.el).forEach(function (b) { b.addEventListener('click', function () { devGo(b.getAttribute('data-t')); }); });
    $('.dv-go', s.el).addEventListener('click', function () { var v = $('.dv-dt', s.el).value; if (v) devGo(v); });
    $$('.dv-h', s.el).forEach(function (b) {
      b.addEventListener('click', function () {
        var h = +b.getAttribute('data-h'), d = now();
        d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
        devGo(isoLocal(d));
      });
    });
    $$('.dv-a', s.el).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-a');
        if (a === 'real') devGo(null);
        else if (a === 'readall') { S.read = chapters.map(function (c) { return c.i; }); save('read'); location.reload(); }
        else if (a === 'home') { S.home = !S.home; save('home'); location.reload(); }
        else if (a === 'gift') { S.gift = ''; save('gift'); location.reload(); }
        else if (a === 'visits') { S.visits += 6; save('visits'); location.reload(); }
        else if (a === 'gate') { S.in = false; save('in'); location.reload(); }
        else if (a === 'reset') {
          var ok = true; try { ok = window.confirm('Стереть весь прогресс, записки и найденные слова на этом устройстве?'); } catch (e) {}
          if (!ok) return;
          try { Object.keys(localStorage).filter(function (k) { return k.indexOf('lv_') === 0; }).forEach(function (k) { localStorage.removeItem(k); }); sessionStorage.clear(); } catch (e) {}
          location.href = location.pathname + location.search;
        }
        else if (a === 'off') location.href = location.pathname;
      });
    });
  }
  function devButton() {
    if (!DEV) return;
    var b = document.createElement('button');
    b.className = 'dv-btn';
    var n = now();
    b.innerHTML = '🛠 <span>' + n.getDate() + '.' + ('0' + (n.getMonth() + 1)).slice(-2) + '.' + String(n.getFullYear()).slice(2) + ' ' + hhmm(n.getHours() + n.getMinutes() / 60) + '</span>';
    b.addEventListener('click', devPanel);
    document.body.appendChild(b);
  }

  /* ===================== старт ===================== */
  window.addEventListener('error', function (e) { try { console.warn('err', e.message); } catch (x) {} });
  window.addEventListener('unhandledrejection', function (e) { try { e.preventDefault(); } catch (x) {} });

  function boot() {
    try { Sky.init(); } catch (e) {}
    if (S.in && !DEV) countVisit();
    try { devButton(); } catch (e) {}
    window.addEventListener('hashchange', render);
    render();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
