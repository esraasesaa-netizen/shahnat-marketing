/* Shahnat marketing office: optional 3D view of the office (managers, computers).
   Built with CSS 3D only (no libraries). Opens from a tab on the side of the office page;
   anyone who prefers the normal view simply never opens it.
   Clicking a team member opens their room in the normal office (data-act="room"). */
(function () {
  'use strict';

  var TEAM = [
    { key: 'lead', n: 'فيصل', role: 'مدير الفريق', g: 'm', x: 120, y: -310 },
    { key: 'seo', n: 'ريم', role: 'السيو و GEO', g: 'f', x: -170, y: -80 },
    { key: 'social', n: 'نواف', role: 'السوشال ميديا', g: 'm', x: 110, y: -80 },
    { key: 'content', n: 'لمى', role: 'المحتوى والكتابة', g: 'f', x: 390, y: -80 },
    { key: 'growth', n: 'سلطان', role: 'الإعلانات والنمو', g: 'm', x: -30, y: 190 },
    { key: 'analytics', n: 'هيا', role: 'التحليل والتقارير', g: 'f', x: 250, y: 190 }
  ];
  var STATE = {
    review: { t: 'تسليم للمراجعة', m: 'عنده تسليم للمراجعة', f: 'عندها تسليم للمراجعة', c: '#F85F22' },
    doing: { t: 'شغّال على مهمة', m: 'يشتغل على مهمة', f: 'تشتغل على مهمة', c: '#2459C7' },
    queued: { t: 'عنده مهام جديدة', m: 'عنده مهام', f: 'عندها مهام', c: '#56647F' },
    idle: { t: 'فاضي', m: 'فاضي', f: 'فاضية', c: '#17724B' }
  };
  var CAM = { rz: -24, tilt: 58, zoom: 1 }, DEF = { rz: -24, tilt: 58, zoom: 1 };
  var sb = null, full = false, view = '', tab = null, ov = null, world = null, timer = null, open = false, liveMeeting = false;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- styles ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#o3d-tab{position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:30;writing-mode:vertical-rl;background:var(--navy,#243A4B);color:#fff;border:0;' +
    'border-radius:0 10px 10px 0;padding:16px 9px;font:700 14px var(--display,system-ui);cursor:pointer;box-shadow:0 6px 18px rgba(19,33,60,.18);letter-spacing:.3px}' +
    '#o3d-tab:hover{background:#1b2d3b}#o3d-tab b{display:block;color:var(--bright,#F85F22);margin-bottom:6px}#o3d-tab[hidden]{display:none}' +
    '#o3d{position:fixed;inset:0;z-index:44;background:radial-gradient(ellipse at 50% 30%,#FFFFFF 0%,#EEF1F7 55%,#DFE4EE 100%);overflow:hidden;user-select:none;-webkit-user-select:none}' +
    '#o3d[hidden]{display:none}' +
    '#o3d .bar{position:absolute;top:0;left:0;right:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;' +
    'background:linear-gradient(#ffffffee,#ffffff00)}' +
    '#o3d .bar h2{margin:0;font:700 20px var(--display,system-ui);color:var(--ink,#13213C)}#o3d .bar small{display:block;font:400 13px var(--body,system-ui);color:var(--muted,#56647F)}' +
    '#o3d .tools{display:flex;gap:8px;flex-wrap:wrap}#o3d .tools button{min-height:40px;padding:0 14px;border-radius:8px;border:1px solid var(--line,#D8DEEA);background:#fff;' +
    'font:600 14px var(--body,system-ui);color:var(--ink,#13213C);cursor:pointer}#o3d .tools button:hover{border-color:var(--navy,#243A4B)}' +
    '#o3d .tools .back{background:var(--navy,#243A4B);color:#fff;border-color:var(--navy,#243A4B)}' +
    '#o3d .legend{position:absolute;bottom:16px;right:20px;z-index:3;display:flex;gap:14px;flex-wrap:wrap;background:#ffffffd9;border:1px solid var(--line,#D8DEEA);border-radius:10px;padding:8px 14px;font-size:13px;color:var(--muted,#56647F)}' +
    '#o3d .legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-inline-end:6px}' +
    '#o3d .hint{position:absolute;bottom:16px;left:20px;z-index:3;font-size:13px;color:var(--muted,#56647F)}' +
    '#o3d .stage{position:absolute;inset:0;perspective:1800px;perspective-origin:50% 35%;cursor:grab}#o3d .stage.drag{cursor:grabbing}' +
    '#o3d .world{position:absolute;left:50%;top:56%;width:0;height:0;transform-style:preserve-3d;' +
    'transform:scale(var(--zoom)) rotateX(var(--tilt)) rotateZ(var(--rz));transition:transform .25s ease-out}' +
    '#o3d .stage.drag .world{transition:none}' +
    '#o3d .world *{transform-style:preserve-3d;box-sizing:border-box}' +
    '#o3d .b3{position:absolute;left:0;top:0}#o3d .f{position:absolute;left:0;top:0;transform-origin:0 0}' +
    '#o3d .floor{position:absolute;left:-680px;top:-430px;width:1360px;height:860px;background:' +
    'repeating-linear-gradient(90deg,#E9DFD2 0 118px,#E3D7C8 118px 120px),#E9DFD2;box-shadow:0 0 0 14px #D6CCBF;border-radius:4px}' +
    '#o3d .rug{position:absolute;left:-330px;top:-170px;width:860px;height:500px;background:#2E4A5E;opacity:.9;border-radius:6px;' +
    'background-image:repeating-linear-gradient(0deg,transparent 0 40px,rgba(255,255,255,.04) 40px 41px)}' +
    '#o3d .wall{background:#F7F8FB;border:1px solid #E3E7EF}' +
    '#o3d .win{background:linear-gradient(180deg,#BFD9F2 0%,#E4F0FA 70%,#F4F8FC 100%);border:6px solid #FFFFFF;box-shadow:inset 0 0 0 1px #D5DEE9}' +
    '#o3d .desk-top{background:#FFFFFF;border:1px solid #E1E5EC}#o3d .desk-side{background:#5B6472}#o3d .desk-front{background:#4B5462}' +
    '#o3d .mon{background:#1E2733}#o3d .mon-top{background:#2C3644}#o3d .chair{background:#2B3440}#o3d .chair-top{background:#36404D}' +
    '#o3d .glass{background:rgba(206,229,247,.28);border:2px solid rgba(255,255,255,.9);box-shadow:inset 0 0 30px rgba(255,255,255,.35)}' +
    '#o3d .live .glass{background:rgba(248,95,34,.12);border-color:rgba(248,95,34,.75)}' +
    '#o3d .tbl{background:#FFFFFF;border:1px solid #DCE2EA}#o3d .tbl-s{background:#8C95A3}' +
    '#o3d .bb{position:absolute;left:0;top:0;width:0;height:0}' +
    '#o3d .bbi{position:absolute;bottom:0;left:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none}' +
    '#o3d .person{pointer-events:auto;cursor:pointer}#o3d .person svg{display:block;filter:drop-shadow(0 6px 6px rgba(19,33,60,.18));transition:transform .15s}' +
    '#o3d .person:hover svg{transform:translateY(-4px)}' +
    '#o3d .tag{background:#13213Ce6;color:#fff;border-radius:8px;padding:5px 10px;text-align:center;margin-bottom:6px;white-space:nowrap;box-shadow:0 4px 10px rgba(19,33,60,.2)}' +
    '#o3d .tag b{display:block;font:700 15px var(--display,system-ui)}#o3d .tag small{display:block;font:400 11.5px var(--body,system-ui);opacity:.85}' +
    '#o3d .st{display:inline-flex;align-items:center;gap:6px;background:#fff;color:#13213C;border-radius:99px;padding:3px 10px;font:600 12px var(--body,system-ui);margin-bottom:6px;white-space:nowrap;box-shadow:0 3px 8px rgba(19,33,60,.15)}' +
    '#o3d .st i{width:8px;height:8px;border-radius:50%}' +
    '#o3d .st.hot{animation:o3dpulse 1.6s ease-in-out infinite}@keyframes o3dpulse{50%{box-shadow:0 0 0 6px rgba(248,95,34,.18)}}' +
    '#o3d .label{background:#ffffffe6;border:1px solid #DCE2EA;color:#243A4B;border-radius:8px;padding:4px 10px;font:700 13px var(--display,system-ui);white-space:nowrap}' +
    '#o3d .live .label{background:#F85F22;color:#fff;border-color:#F85F22}' +
    '#o3d .lampc{width:14px;height:14px;border-radius:50% 50% 2px 2px;background:#F85F22}' +
    '@media (prefers-reduced-motion:reduce){#o3d .world{transition:none}#o3d .st.hot{animation:none}}';
  document.head.appendChild(css);

  /* ---------- 3D building blocks ---------- */
  function box(x, y, z, w, d, h, cls) {
    var c = cls || {}, t = c.top || '', fr = c.front || '', sd = c.side || fr;
    return '<div class="b3" style="transform:translate3d(' + x + 'px,' + y + 'px,' + z + 'px)">' +
      '<div class="f ' + sd + '" style="width:' + d + 'px;height:' + h + 'px;transform:translate3d(0,0,' + h + 'px) rotateZ(90deg) rotateX(-90deg)"></div>' +
      '<div class="f ' + sd + '" style="width:' + d + 'px;height:' + h + 'px;transform:translate3d(' + w + 'px,0,' + h + 'px) rotateZ(90deg) rotateX(-90deg)"></div>' +
      '<div class="f ' + fr + '" style="width:' + w + 'px;height:' + h + 'px;transform:translate3d(0,0,' + h + 'px) rotateX(-90deg)"></div>' +
      '<div class="f ' + fr + '" style="width:' + w + 'px;height:' + h + 'px;transform:translate3d(0,' + d + 'px,' + h + 'px) rotateX(-90deg)"></div>' +
      '<div class="f ' + t + '" style="width:' + w + 'px;height:' + d + 'px;transform:translate3d(0,0,' + h + 'px)"></div></div>';
  }
  function plane(x, y, z, w, h, cls, rot, inner) { /* vertical plane along x (rot 0) or along y (rot 90) */
    var tf = rot ? 'translate3d(' + x + 'px,' + y + 'px,' + (z + h) + 'px) rotateZ(90deg) rotateX(-90deg)' : 'translate3d(' + x + 'px,' + y + 'px,' + (z + h) + 'px) rotateX(-90deg)';
    return '<div class="f ' + cls + '" style="width:' + w + 'px;height:' + h + 'px;transform:' + tf + '">' + (inner || '') + '</div>';
  }
  function bb(x, y, z, html, cls) { /* always faces the camera */
    return '<div class="bb ' + (cls || '') + '" style="transform:translate3d(' + x + 'px,' + y + 'px,' + z + 'px) rotateZ(calc(var(--rz) * -1)) rotateX(calc(var(--tilt) * -1))"><div class="bbi">' + html + '</div></div>';
  }

  /* team members: simple original figures (thobe and ghutra, abaya and hijab) */
  function figure(g) {
    if (g === 'm') return '<svg width="62" height="84" viewBox="0 0 62 84" aria-hidden="true">' +
      '<path d="M8 84 C8 58 18 48 31 48 C44 48 54 58 54 84 Z" fill="#FFFFFF" stroke="#D9DEE6" stroke-width="1.5"/>' +
      '<path d="M31 50 L31 66" stroke="#D9DEE6" stroke-width="1.5"/>' +
      '<circle cx="31" cy="30" r="12.5" fill="#C99A72"/>' +
      '<path d="M15 34 C15 16 22 9 31 9 C40 9 47 16 47 34 L52 52 C46 47 41 44 39 36 C39 26 36 22 31 22 C26 22 23 26 23 36 C21 44 16 47 10 52 Z" fill="#FFFFFF" stroke="#D9DEE6" stroke-width="1.5"/>' +
      '<path d="M18 16 C24 11 38 11 44 16" stroke="#1F2A37" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
      '<path d="M27 37 C29 38.5 33 38.5 35 37" stroke="#7A5233" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
    return '<svg width="62" height="84" viewBox="0 0 62 84" aria-hidden="true">' +
      '<path d="M7 84 C7 58 17 47 31 47 C45 47 55 58 55 84 Z" fill="#243A4B"/>' +
      '<path d="M14 36 C14 17 21 8 31 8 C41 8 48 17 48 36 C48 46 42 53 31 53 C20 53 14 46 14 36 Z" fill="#1E2C3A"/>' +
      '<ellipse cx="31" cy="32" rx="10" ry="11.5" fill="#D2A47C"/>' +
      '<path d="M27 37 C29 38.5 33 38.5 35 37" stroke="#8A5C3B" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M31 53 L31 70" stroke="#F85F22" stroke-width="2.2" stroke-linecap="round"/></svg>';
  }
  function plant() {
    return '<svg width="44" height="70" viewBox="0 0 44 70" aria-hidden="true"><path d="M12 48 h20 l-3 22 h-14z" fill="#E8ECF4" stroke="#C8CFDB"/>' +
      '<path d="M22 48 C10 40 6 26 12 14 C18 22 21 34 22 48 C23 30 28 16 34 8 C38 22 34 38 22 48 Z" fill="#3E8E6B"/><path d="M22 48 C26 38 32 32 40 30 C38 40 31 46 22 48 Z" fill="#2F7556"/></svg>';
  }

  function deskHtml(p, st) {
    var s = STATE[st], x = p.x, y = p.y, lbl = s[p.g] || s.t;
    return box(x - 80, y - 20, 58, 160, 80, 5, { top: 'desk-top', front: 'desk-top' }) +
      box(x - 78, y + 52, 0, 156, 6, 58, { top: 'desk-front', front: 'desk-front' }) +
      box(x - 80, y - 20, 0, 6, 78, 58, { top: 'desk-side', front: 'desk-side' }) +
      box(x + 74, y - 20, 0, 6, 78, 58, { top: 'desk-side', front: 'desk-side' }) +
      box(x - 32, y + 4, 63, 64, 5, 30, { top: 'mon-top', front: 'mon' }) +
      box(x - 6, y + 8, 63, 12, 8, 6, { top: 'mon-top', front: 'mon' }) +
      bb(x + 58, y + 20, 63, '<div class="lampc"></div><div style="width:3px;height:18px;background:#9AA3B1"></div>') +
      box(x - 24, y - 92, 0, 48, 34, 34, { top: 'chair-top', front: 'chair' }) +
      box(x - 24, y - 98, 34, 48, 8, 40, { top: 'chair-top', front: 'chair' }) +
      bb(x, y - 40, 40,
        '<span class="st' + (st === 'review' ? ' hot' : '') + '"><i style="background:' + s.c + '"></i>' + esc(lbl) + '</span>' +
        '<div class="tag"><b>' + esc(p.n) + '</b><small>' + esc(p.role) + '</small></div>' +
        '<div class="person" data-act="room" data-k="' + p.key + '" role="button" tabindex="0" aria-label="' + esc(p.n + '، ' + p.role + '، ' + lbl) + '">' + figure(p.g) + '</div>');
  }

  function scene(states) {
    var h = '<div class="floor"></div><div class="rug"></div>';
    /* back wall with windows, side wall */
    h += plane(-680, -430, 0, 1360, 250, 'wall', 0,
      [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<div class="win" style="position:absolute;left:' + (330 + i * 145) + 'px;top:34px;width:128px;height:170px"></div>'; }).join(''));
    h += plane(-680, -430, 0, 860, 250, 'wall', 1,
      [0, 1].map(function (i) { return '<div class="win" style="position:absolute;left:' + (380 + i * 210) + 'px;top:34px;width:180px;height:170px"></div>'; }).join(''));
    /* glass meeting room in the corner */
    var mx = -660, my = -410, mw = 300, md = 250, mh = 170;
    h += '<div class="' + (liveMeeting ? 'live' : '') + '">' +
      box(mx + 70, my + 85, 0, 160, 80, 52, { top: 'tbl', front: 'tbl-s' }) +
      [[mx + 95, my + 50], [mx + 175, my + 50], [mx + 95, my + 182], [mx + 175, my + 182]].map(function (c) { return box(c[0], c[1], 0, 34, 26, 30, { top: 'chair-top', front: 'chair' }); }).join('') +
      plane(mx, my + md, 0, mw, mh, 'glass', 0) + plane(mx + mw, my, 0, md, mh, 'glass', 1) +
      bb(mx + mw / 2, my + md, mh + 6, '<span class="label">' + (liveMeeting ? 'اجتماع شغّال الحين' : 'قاعة الاجتماعات') + '</span>') + '</div>';
    /* team */
    TEAM.forEach(function (p) { h += deskHtml(p, states[p.key] || 'idle'); });
    /* plants */
    [[600, -380], [600, 360], [-640, 360], [-300, 380]].forEach(function (c) { h += bb(c[0], c[1], 0, plant()); });
    /* entrance label */
    h += bb(120, 400, 0, '<span class="label">مكتب شحنات التسويقي</span>');
    return h;
  }

  /* ---------- data ---------- */
  async function states() {
    var out = {};
    if (!sb) return out;
    try {
      var r = await Promise.all([
        sb.from('docs').select('data').eq('collection', 'tasks'),
        sb.from('team_meetings').select('id').eq('status', 'live').limit(1)
      ]);
      var tasks = (r[0].data || []).map(function (x) { return x.data || {}; });
      TEAM.forEach(function (p) {
        var mine = tasks.filter(function (t) { return t.emp === p.key; });
        out[p.key] = mine.some(function (t) { return t.status === 'review'; }) ? 'review'
          : mine.some(function (t) { return t.status === 'doing'; }) ? 'doing'
          : mine.some(function (t) { return t.status === 'new'; }) ? 'queued' : 'idle';
      });
      liveMeeting = !!(r[1].data && r[1].data.length);
    } catch (_) {}
    return out;
  }
  async function refresh() { if (!open) return; var s = await states(); if (world && open) world.innerHTML = scene(s); }

  /* ---------- camera ---------- */
  function apply() {
    if (!world) return;
    world.style.setProperty('--rz', CAM.rz + 'deg'); world.style.setProperty('--tilt', CAM.tilt + 'deg'); world.style.setProperty('--zoom', CAM.zoom);
    try { localStorage.setItem('o3d-cam', JSON.stringify(CAM)); } catch (_) {}
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fit() { /* smaller screens start a little further away */
    var w = window.innerWidth; if (w < 1100) return Math.max(0.55, w / 1500); return w > 1600 ? 1.1 : 0.9;
  }

  /* ---------- open / close ---------- */
  function build() {
    if (ov) return;
    ov = document.createElement('div'); ov.id = 'o3d'; ov.dir = 'rtl'; ov.lang = 'ar'; ov.hidden = true;
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'عرض المكتب ثلاثي الأبعاد');
    ov.innerHTML = '<div class="bar"><div><h2>المكتب</h2><small>اضغطي على أي موظف عشان تفتحين غرفته.</small></div>' +
      '<div class="tools"><button type="button" data-o="in" aria-label="تقريب">تقريب +</button><button type="button" data-o="out" aria-label="تبعيد">تبعيد −</button>' +
      '<button type="button" data-o="reset">الزاوية الأصلية</button><button type="button" class="back" data-o="close">العرض العادي</button></div></div>' +
      '<div class="stage"><div class="world"></div></div>' +
      '<div class="legend">' + ['review', 'doing', 'queued', 'idle'].map(function (k) { return '<span><i style="background:' + STATE[k].c + '"></i>' + STATE[k].t + '</span>'; }).join('') + '</div>' +
      '<div class="hint">اسحبي بالماوس للف المكتب، وعجلة الماوس للتقريب.</div>';
    document.body.appendChild(ov);
    world = ov.querySelector('.world');
    var stage = ov.querySelector('.stage'), drag = null;
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.person')) return;
      drag = { x: e.clientX, y: e.clientY, rz: CAM.rz, tilt: CAM.tilt }; stage.classList.add('drag'); stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', function (e) {
      if (!drag) return;
      CAM.rz = clamp(drag.rz - (e.clientX - drag.x) * 0.25, -50, 8);
      CAM.tilt = clamp(drag.tilt - (e.clientY - drag.y) * 0.15, 38, 72); apply();
    });
    function end() { drag = null; stage.classList.remove('drag'); }
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', function (e) { e.preventDefault(); CAM.zoom = clamp(CAM.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.45, 1.8); apply(); }, { passive: false });
    ov.addEventListener('click', function (e) {
      if (e.target.closest('.person')) { close(); return; } /* the office opens the room (data-act="room") */
      var b = e.target.closest('[data-o]'); if (!b) return;
      var o = b.dataset.o;
      if (o === 'in') CAM.zoom = clamp(CAM.zoom * 1.15, 0.45, 1.8);
      if (o === 'out') CAM.zoom = clamp(CAM.zoom / 1.15, 0.45, 1.8);
      if (o === 'reset') { CAM.rz = DEF.rz; CAM.tilt = DEF.tilt; CAM.zoom = fit(); }
      if (o === 'close') { close(); return; }
      apply();
    });
    ov.addEventListener('keydown', function (e) {
      var p = e.target.closest && e.target.closest('.person');
      if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); p.click(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) close(); });
  }
  function show() {
    build(); open = true;
    try { var c = JSON.parse(localStorage.getItem('o3d-cam') || 'null'); if (c && c.tilt) CAM = c; else CAM.zoom = fit(); } catch (_) { CAM.zoom = fit(); }
    world.innerHTML = scene({}); apply();
    ov.hidden = false; document.body.style.overflow = 'hidden';
    refresh(); clearInterval(timer); timer = setInterval(refresh, 30000);
    var b = ov.querySelector('[data-o="close"]'); if (b) b.focus();
  }
  function close() {
    open = false; clearInterval(timer);
    if (ov) ov.hidden = true; document.body.style.overflow = '';
    if (tab) tab.focus();
  }

  /* ---------- side tab ---------- */
  function placeTab() {
    if (!tab) {
      tab = document.createElement('button'); tab.id = 'o3d-tab'; tab.type = 'button'; tab.hidden = true;
      tab.innerHTML = '<b>3D</b>عرض المكتب'; tab.setAttribute('aria-label', 'عرض المكتب ثلاثي الأبعاد');
      tab.addEventListener('click', show); document.body.appendChild(tab);
    }
    tab.hidden = !(full && view === 'office' && window.innerWidth >= 900);
  }
  document.addEventListener('office:auth', function () { var a = window.officeAuth; if (a) { sb = a.sb; full = !!a.full; placeTab(); } });
  document.addEventListener('office:view', function (e) {
    view = e.detail;
    if (!sb && window.officeAuth) { sb = window.officeAuth.sb; full = !!window.officeAuth.full; }
    placeTab();
    if (view !== 'office' && open) close();
  });
  window.addEventListener('resize', function () { if (tab) placeTab(); });
})();
