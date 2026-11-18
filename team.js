/* Shahnat marketing office: the team side.
   - "يومي": the marketer's home (meeting invitations, today's work, weekly goal)
   - "اجتماعات الفريق": managers schedule meetings, invite marketers, see attendance and recordings
   - the meeting room: a voice meeting between laptops (WebRTC), recorded by the host
   Entry to a meeting goes through the database function meeting_join: invited people only,
   from 5 minutes before the start until 5 minutes after it. */
(function () {
  'use strict';

  var ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  var WINDOW_MIN = 5;

  var sb = null, uid = '', role = '', full = false, myName = '';
  var S = { people: [], meetings: [], att: [], work: null, week: null, loaded: false, sheet: null, busy: false, confirm: '' };
  var todayEl = null, mgrEl = null, sheetEl = null, roomEl = null, view = '', tick = null, chan = null, warned = {};

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { var el = $('#toast'); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 4000); }
  var L = 'ar-SA-u-ca-gregory-nu-latn';
  var FD = new Intl.DateTimeFormat(L, { weekday: 'long', day: 'numeric', month: 'long' });
  var FT = new Intl.DateTimeFormat(L, { hour: 'numeric', minute: '2-digit' });
  var FS = new Intl.DateTimeFormat(L, { day: 'numeric', month: 'short' });
  function when(iso) { var d = new Date(iso); return FD.format(d) + '، الساعة ' + FT.format(d); }
  function person(id) { var p = S.people.filter(function (x) { return x.id === id; })[0]; return p ? (p.name || 'بدون اسم') : ''; }
  function me() { return S.people.filter(function (x) { return x.id === uid; })[0] || {}; }
  function endOfToday() { var d = new Date(); d.setHours(24, 0, 0, 0); return d; }
  function weekStart() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; } /* week starts Sunday */
  function mins(ms) { return Math.round(ms / 60000); }
  function span(m) {
    if (m < 1) return 'أقل من دقيقة';
    if (m < 60) return m + ' دقيقة';
    var h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return h + ' ساعة' + (r ? ' و' + r + ' دقيقة' : '');
    var d = Math.floor(h / 24); return d === 1 ? 'يوم' : d === 2 ? 'يومين' : d + ' أيام';
  }
  function attended(mid) { return S.att.some(function (a) { return a.meeting_id === mid && a.user_id === uid; }); }
  function gate(m) {
    var t = new Date(m.starts_at).getTime(), now = Date.now();
    if (m.status === 'cancelled') return { open: false, label: 'انلغى الاجتماع' };
    if (m.status === 'ended') return { open: false, label: 'انتهى الاجتماع' };
    if (full) return { open: true, label: m.status === 'live' ? 'دخول الغرفة (الاجتماع شغّال)' : 'دخول الغرفة' };
    if (attended(m.id)) return { open: true, label: 'رجوع للاجتماع' };
    if (now < t - WINDOW_MIN * 60000) return { open: false, label: 'الدخول يفتح قبل الموعد بـ 5 دقائق', wait: t - WINDOW_MIN * 60000 - now };
    if (now > t + WINDOW_MIN * 60000) return { open: false, label: 'انتهى وقت الدخول', late: true };
    return { open: true, label: 'دخول الاجتماع' };
  }

  /* ---------- styles ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#myday,#teammeet{padding-bottom:20px}' +
    '#myday .hello{margin:4px 0 16px}#myday .hello h2{margin:0;font:700 24px var(--display)}#myday .hello p{margin:4px 0 0;color:var(--muted)}' +
    '.tm-card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:14px}' +
    '.tm-card h3{margin:0 0 10px;font:700 17px var(--display)}' +
    '.tm-meet{border-inline-start:4px solid var(--bright,#F85F22)}' +
    '.tm-meet .t{font-weight:700;font-size:16px}.tm-meet .w{color:var(--muted);font-size:14.5px;margin:2px 0 8px}' +
    '.tm-meet .ag{white-space:pre-wrap;font-size:14.5px;background:var(--bg);border-radius:6px;padding:8px 10px;margin:0 0 10px}' +
    '.tm-meet .cd{font-size:14px;color:var(--muted);margin:8px 0 0}.tm-meet .rec{font-size:13px;color:var(--muted);margin:6px 0 0}' +
    '.tm-meet+.tm-meet{margin-top:-4px}' +
    '.tm-goal .bar{height:10px;border-radius:99px;background:var(--soft,#E8ECF4);overflow:hidden;margin:8px 0 6px}' +
    '.tm-goal .bar i{display:block;height:100%;background:var(--bright,#F85F22);border-radius:99px}' +
    '.tm-goal .nums{display:flex;gap:18px;flex-wrap:wrap;font-size:14.5px}.tm-goal b{font-size:20px;font-variant-numeric:tabular-nums}' +
    '.tm-work{display:grid;gap:8px}.tm-work button{display:flex;justify-content:space-between;gap:10px;width:100%;text-align:start;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px 12px;font:inherit;color:inherit;cursor:pointer}' +
    '.tm-work small{flex:none;color:var(--muted);font-size:13px}.tm-work .late small{color:var(--bad,#B3261E);font-weight:700}' +
    '.tm-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--line)}' +
    '.tm-row:first-of-type{border-top:0}.tm-row .info{min-width:0}.tm-row .info b{display:block}.tm-row .info small{color:var(--muted);font-size:13.5px}' +
    '.tm-att{font-size:13.5px;color:var(--muted);margin:4px 0 0}.tm-att span{margin-inline-end:10px}' +
    '.tm-row audio{width:100%;margin-top:8px}' +
    '#team-sheet{position:fixed;inset:0;z-index:46;background:var(--bg);overflow-y:auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}' +
    '#team-sheet[hidden]{display:none}#team-sheet .inv{display:flex;flex-wrap:wrap;gap:8px 16px}#team-sheet .inv label{display:flex;align-items:center;gap:6px;font-weight:500}#team-sheet .inv input{width:20px;height:20px;min-height:0}' +
    '#meet-room{position:fixed;inset:0;z-index:60;background:#13213C;color:#fff;overflow-y:auto;padding:max(16px,env(safe-area-inset-top,0px)) 16px 24px}' +
    '#meet-room[hidden]{display:none}#meet-room .mr-in{max-width:760px;margin:0 auto;display:grid;gap:16px}' +
    '#meet-room h2{margin:0;font:700 22px var(--display);color:#fff}#meet-room .sub{color:#C9D3E3;font-size:14.5px}' +
    '#meet-room .recbar{display:flex;align-items:center;gap:8px;background:rgba(248,95,34,.16);border:1px solid rgba(248,95,34,.5);border-radius:8px;padding:8px 12px;font-size:14.5px}' +
    '#meet-room .recbar i{width:10px;height:10px;border-radius:50%;background:#F85F22;animation:mrblink 1.4s infinite}' +
    '@keyframes mrblink{50%{opacity:.25}}' +
    '#meet-room .people{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}' +
    '#meet-room .p{background:rgba(255,255,255,.06);border:2px solid transparent;border-radius:12px;padding:16px 10px;text-align:center;transition:border-color .15s}' +
    '#meet-room .p.talk{border-color:#F85F22}#meet-room .p .av{width:56px;height:56px;border-radius:50%;background:#243A4B;display:grid;place-items:center;margin:0 auto 8px;font:700 22px var(--display)}' +
    '#meet-room .p b{display:block;font-size:15px}#meet-room .p small{color:#C9D3E3;font-size:12.5px}' +
    '#meet-room .ag{white-space:pre-wrap;background:rgba(255,255,255,.06);border-radius:8px;padding:10px 12px;font-size:14.5px}' +
    '#meet-room .ctl{display:flex;gap:10px;flex-wrap:wrap}#meet-room .ctl .btn{flex:1;min-width:140px}' +
    '#meet-room .btn{background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.35)}#meet-room .btn.end{background:#B3261E;border-color:#B3261E}' +
    '#meet-room .btn.on{background:#fff;color:#13213C}#meet-room .msg{background:rgba(255,255,255,.08);border-radius:8px;padding:10px 12px;font-size:14.5px}';
  document.head.appendChild(css);

  /* ---------- data ---------- */
  async function load() {
    if (!sb) return;
    var since = weekStart().toISOString();
    var q = [
      sb.from('profiles').select('id,name,role,weekly_goal'),
      sb.from('team_meetings').select('*').order('starts_at', { ascending: true }),
      sb.from('team_meeting_attendance').select('*')
    ];
    if (role === 'marketer') {
      q.push(sb.from('crm_tasks').select('id,title,due_at,merchant_id').eq('done', false).order('due_at', { ascending: true, nullsFirst: false }));
      q.push(sb.from('crm_merchants').select('id,name,stage,source,next_follow_up_at,last_contact_at').eq('owner_id', uid));
      q.push(sb.from('crm_activities').select('type,to_stage,created_at').eq('created_by', uid).gte('created_at', since));
    }
    var r = await Promise.all(q);
    S.people = r[0].data || []; S.meetings = r[1].data || []; S.att = r[2].data || [];
    if (role === 'marketer') S.work = { tasks: r[3].data || [], merchants: r[4].data || [], acts: r[5].data || [] };
    S.loaded = true;
    draw();
  }
  function live() {
    if (chan || !sb) return;
    var t = null; function later() { clearTimeout(t); t = setTimeout(load, 500); }
    chan = sb.channel('office-team')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_meetings' }, later)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'docs' }, function (p) {
        var d = p.new && p.new.data;
        if (d && d.to === uid && d.text) toast(d.text);
        if (d && d.to === uid) later();
      });
    if (role === 'marketer') chan.on('postgres_changes', { event: '*', schema: 'public', table: 'crm_tasks' }, later)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_merchants' }, later);
    chan.subscribe();
  }

  /* ---------- "يومي" (marketers) ---------- */
  function upcoming() {
    var now = Date.now();
    return S.meetings.filter(function (m) {
      if (m.status === 'cancelled' || m.status === 'ended') return false;
      if (!full && (m.invitees || []).indexOf(uid) < 0) return false;
      return new Date(m.starts_at).getTime() + m.duration_min * 60000 > now - 30 * 60000;
    });
  }
  function meetCard(m) {
    var g = gate(m), t = new Date(m.starts_at).getTime(), left = t - Date.now();
    var cd = m.status === 'live' ? 'الاجتماع شغّال الحين' : left > 0 ? 'يبدأ بعد ' + span(mins(left)) : g.late ? 'بدأ قبل ' + span(mins(-left)) : 'بدأ الحين';
    return '<div class="tm-card tm-meet"><div class="t">' + esc(m.title) + '</div><div class="w">' + esc(when(m.starts_at)) + ' · ' + m.duration_min + ' دقيقة</div>' +
      (m.agenda ? '<div class="ag">' + esc(m.agenda) + '</div>' : '') +
      '<button class="btn pri wide" type="button" data-t="join" data-id="' + esc(m.id) + '"' + (g.open ? '' : ' disabled') + '>' + esc(g.label) + '</button>' +
      '<p class="cd">' + esc(cd) + '</p><p class="rec">الاجتماع يتسجّل صوتياً، والتسجيل يوصل للإدارة بس.</p></div>';
  }
  function drawToday() {
    if (!todayEl) return;
    if (!S.loaded) { todayEl.innerHTML = '<div class="empty"><span class="spin"></span></div>'; return; }
    var h = '<div class="hello"><h2>حياك الله ' + esc(myName || me().name || '') + '</h2><p>فريق التسويق · ' + esc(FD.format(new Date())) + '</p></div>';
    var ups = upcoming();
    if (ups.length) h += '<h3 class="sec" style="margin:0 0 8px;font:700 17px var(--display)">اجتماعاتك</h3>' + ups.map(meetCard).join('');

    var w = S.work || { tasks: [], merchants: [], acts: [] }, end = endOfToday(), items = [], sod = new Date(); sod.setHours(0, 0, 0, 0);
    var mById = {}; w.merchants.forEach(function (m) { mById[m.id] = m; });
    w.tasks.forEach(function (t) { if (t.due_at && new Date(t.due_at) < end) items.push({ at: t.due_at, txt: t.title + (mById[t.merchant_id] ? ' · ' + mById[t.merchant_id].name : ''), id: t.merchant_id }); });
    w.merchants.forEach(function (m) {
      if (m.stage === 'lost') return;
      if (m.next_follow_up_at && new Date(m.next_follow_up_at) < end) items.push({ at: m.next_follow_up_at, txt: 'متابعة ' + m.name, id: m.id });
      else if (m.source === 'الموقع' && m.stage === 'lead' && !m.last_contact_at) items.push({ at: new Date().toISOString(), txt: 'عميل جديد من الموقع: ' + m.name, id: m.id });
    });
    var seen = {}; items = items.filter(function (x) { var k = x.id + x.txt; if (seen[k]) return false; seen[k] = 1; return true; })
      .sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    h += '<div class="tm-card"><h3>شغل اليوم' + (items.length ? ' (' + items.length + ')' : '') + '</h3>' +
      (items.length ? '<div class="tm-work">' + items.slice(0, 12).map(function (x) {
        var late = new Date(x.at) < sod;
        return '<button type="button" class="' + (late ? 'late' : '') + '" data-t="openm" data-id="' + esc(x.id) + '"><span>' + esc(x.txt) + '</span><small>' + (late ? 'متأخرة · ' + esc(FS.format(new Date(x.at))) : 'اليوم') + '</small></button>';
      }).join('') + '</div>' : '<p class="muted" style="margin:0">ما فيه متابعات اليوم. وقت مناسب تضيفين محلات جديدة من الخرائط.</p>') +
      '<div class="actions" style="margin-top:12px"><button class="btn" type="button" data-t="tocrm">فتح العملاء</button></div></div>';

    var contacts = w.acts.filter(function (a) { return a.type !== 'note' && a.type !== 'stage_change'; }).length;
    var won = w.acts.filter(function (a) { return a.type === 'stage_change' && ['registered', 'first_shipment', 'active'].indexOf(a.to_stage) >= 0; }).length;
    var goal = me().weekly_goal || 0, pct = goal ? Math.min(100, Math.round(contacts * 100 / goal)) : 0;
    h += '<div class="tm-card tm-goal"><h3>هدف الأسبوع</h3>' +
      (goal ? '<div class="nums"><span><b>' + contacts + '</b> من ' + goal + ' تواصل</span><span><b>' + won + '</b> تحوّلوا لعملاء</span></div><div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<p class="muted" style="margin:0;font-size:14px">' + (contacts >= goal ? 'حققتِ هدف الأسبوع.' : 'باقي ' + (goal - contacts) + ' تواصل للهدف. الأسبوع يبدأ يوم الأحد.') + '</p>'
        : '<div class="nums"><span><b>' + contacts + '</b> تواصل هالأسبوع</span><span><b>' + won + '</b> تحوّلوا لعملاء</span></div>') + '</div>';
    todayEl.innerHTML = h;
  }

  /* ---------- team meetings (managers) ---------- */
  function attLine(m) {
    var inv = m.invitees || [], rows = S.att.filter(function (a) { return a.meeting_id === m.id; });
    var got = {}; rows.forEach(function (a) { got[a.user_id] = a; });
    var ended = m.status === 'ended' || Date.now() > new Date(m.starts_at).getTime() + WINDOW_MIN * 60000;
    var parts = inv.map(function (id) {
      var a = got[id];
      if (a) return esc(person(id)) + (a.late_min > 0 ? ' (تأخرت ' + a.late_min + ' د)' : ' (حضرت)');
      return esc(person(id)) + (ended ? ' (ما حضرت)' : '');
    });
    return parts.length ? '<p class="tm-att">' + parts.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</p>' : '';
  }
  function drawMgr() {
    if (!mgrEl) return;
    if (!S.loaded) { mgrEl.innerHTML = ''; return; }
    var ups = upcoming(), past = S.meetings.filter(function (m) { return m.status === 'ended'; }).slice(-6).reverse();
    var h = '<div class="tm-card"><div class="rowhead" style="margin:0 0 6px"><h2 style="margin:0">اجتماعات الفريق</h2><button class="btn pri" type="button" data-t="new">+ جدولة اجتماع</button></div>' +
      '<p class="muted" style="margin:0 0 6px;font-size:14px">اجتماع صوتي داخل المكتب. المدعوّات يوصلهن تنبيه، ويقدرن يدخلن من قبل الموعد بـ 5 دقائق لين 5 دقائق بعده بس. الاجتماع يتسجّل من جهازك.</p>';
    h += ups.length ? ups.map(function (m) {
      var k = 'c' + m.id;
      return '<div class="tm-row"><div class="info"><b>' + esc(m.title) + (m.status === 'live' ? ' · شغّال الحين' : '') + '</b><small>' + esc(when(m.starts_at)) + ' · ' + m.duration_min + ' دقيقة</small>' + attLine(m) + '</div>' +
        '<div class="actions"><button class="btn pri" type="button" data-t="join" data-id="' + esc(m.id) + '">دخول الغرفة</button>' +
        (S.confirm === k ? '<button class="btn danger" type="button" data-t="cancel" data-id="' + esc(m.id) + '">متأكدة؟ إلغاء</button>' : '<button class="btn" type="button" data-t="askcancel" data-id="' + esc(m.id) + '">إلغاء</button>') + '</div></div>';
    }).join('') : '<p class="muted" style="margin:6px 0 0">ما فيه اجتماعات قادمة.</p>';
    if (past.length) h += '<h3 style="margin:16px 0 4px;font:700 16px var(--display)">اجتماعات سابقة</h3>' + past.map(function (m) {
      return '<div class="tm-row" style="display:block"><div class="info"><b>' + esc(m.title) + '</b><small>' + esc(when(m.starts_at)) +
        (m.recording_sec ? ' · مدة التسجيل ' + span(Math.max(1, Math.round(m.recording_sec / 60))) : '') + '</small>' + attLine(m) + '</div>' +
        (m.recording_id ? '<audio controls preload="none" src="/_blob/' + encodeURIComponent(m.recording_id) + '"></audio>' : '<p class="tm-att">ما فيه تسجيل.</p>') + '</div>';
    }).join('');
    mgrEl.innerHTML = h + '</div>';
  }
  function draw() { if (view === 'today') drawToday(); if (view === 'meeting' && full) drawMgr(); }

  /* schedule sheet */
  function openSheet() { S.sheet = 'new'; drawSheet(); }
  function closeSheet() { S.sheet = null; drawSheet(); }
  function drawSheet() {
    if (!sheetEl) return;
    if (!S.sheet) { sheetEl.hidden = true; sheetEl.innerHTML = ''; document.body.style.overflow = ''; return; }
    var d = new Date(Date.now() + 864e5); d.setHours(10, 0, 0, 0);
    var ds = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    var team = S.people.filter(function (p) { return p.id !== uid && p.role; });
    team.sort(function (a, b) { return (a.role === 'marketer' ? 0 : 1) - (b.role === 'marketer' ? 0 : 1); });
    sheetEl.innerHTML = '<div class="sin"><div class="shead"><h2 style="font:700 21px var(--display);margin:0">جدولة اجتماع للفريق</h2><button class="x" type="button" data-t="close">إغلاق</button></div>' +
      '<div class="form"><label>موضوع الاجتماع<input id="tm-title" placeholder="مثال: متابعة محلات الأسبوع"></label>' +
      '<div class="two"><label>اليوم<input id="tm-date" type="date" value="' + ds + '"></label><label>الساعة<input id="tm-time" type="time" value="10:00"></label></div>' +
      '<label>المدة<select id="tm-dur"><option value="15">15 دقيقة</option><option value="30">30 دقيقة</option><option value="45" selected>45 دقيقة</option><option value="60">ساعة</option><option value="90">ساعة ونص</option></select></label>' +
      '<fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:700;font-size:14.5px;margin-bottom:6px">المدعوّات</legend><div class="inv">' +
      team.map(function (p, i) { return '<label><input type="checkbox" class="tm-inv" value="' + esc(p.id) + '"' + (p.role === 'marketer' ? ' checked' : '') + '>' + esc(p.name || 'بدون اسم') + (p.role === 'marketer' ? '' : ' <small class="muted">(إدارة)</small>') + '</label>'; }).join('') +
      '</div></fieldset>' +
      '<label>الأجندة (اختياري)<textarea id="tm-agenda" style="min-height:110px" placeholder="1. مراجعة المحلات اللي تحولت&#10;2. أسئلة العملاء المتكررة&#10;3. خطة الأسبوع"></textarea></label>' +
      '<p class="err" id="tm-err"></p><button class="btn pri wide" type="button" data-t="save"' + (S.busy ? ' disabled' : '') + '>جدولة وإرسال الدعوات</button></div></div>';
    sheetEl.hidden = false; document.body.style.overflow = 'hidden';
  }
  async function saveMeeting() {
    function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    var title = v('tm-title'), date = v('tm-date'), time = v('tm-time'), err = $('#tm-err');
    var inv = Array.prototype.slice.call(sheetEl.querySelectorAll('.tm-inv:checked')).map(function (x) { return x.value; });
    if (!title) { err.textContent = 'اكتبي موضوع الاجتماع.'; return; }
    if (!date || !time) { err.textContent = 'حددي اليوم والساعة.'; return; }
    var p = date.split('-'), t = time.split(':'), at = new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1], 0);
    if (at.getTime() < Date.now() - 60000) { err.textContent = 'الموعد لازم يكون بعد الحين.'; return; }
    if (!inv.length) { err.textContent = 'اختاري مدعوّة وحدة على الأقل.'; return; }
    S.busy = true; drawSheet();
    try {
      var r = await sb.from('team_meetings').insert({ title: title, agenda: v('tm-agenda'), starts_at: at.toISOString(), duration_min: +v('tm-dur') || 45, invitees: inv }).select().single();
      if (r.error) throw r.error;
      var text = 'دعوة لاجتماع: ' + title + '، ' + when(at.toISOString()) + '. الدخول من صفحة «يومي» قبل الموعد بـ 5 دقائق.';
      var now = new Date().toISOString();
      await sb.from('docs').insert(inv.map(function (id) {
        return { path: 'alerts/' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Math.random()).slice(2)), collection: 'alerts',
          data: { type: 'meeting_invite', to: id, ref: r.data.id, text: text, at: now, read: false }, updated_at: now };
      }));
      S.meetings.push(r.data); S.sheet = null; toast('انجدول الاجتماع ووصلت الدعوات');
    } catch (e) { S.busy = false; drawSheet(); var el = $('#tm-err'); if (el) el.textContent = 'تعذر الحفظ: ' + ((e && e.message) || ''); return; }
    S.busy = false; drawSheet(); draw();
  }
  async function cancelMeeting(id) {
    var m = S.meetings.filter(function (x) { return x.id === id; })[0]; if (!m) return;
    var r = await sb.from('team_meetings').update({ status: 'cancelled' }).eq('id', id);
    if (r.error) { toast('تعذر الإلغاء'); return; }
    var now = new Date().toISOString();
    await sb.from('docs').insert((m.invitees || []).map(function (u) {
      return { path: 'alerts/' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Math.random()).slice(2)), collection: 'alerts',
        data: { type: 'meeting_cancel', to: u, ref: id, text: 'انلغى اجتماع: ' + m.title + ' (' + when(m.starts_at) + ')', at: now, read: false }, updated_at: now };
    }));
    m.status = 'cancelled'; S.confirm = ''; toast('انلغى الاجتماع ووصل تنبيه للمدعوّات'); draw();
  }

  /* ---------- the meeting room ---------- */
  var R = null;
  var JOIN_MSG = { early: 'الدخول يفتح قبل الموعد بـ 5 دقائق.', late: 'انتهى وقت الدخول. الدخول مسموح لين 5 دقائق بعد بداية الاجتماع.', not_invited: 'ما عندك دعوة لهذا الاجتماع.',
    ended: 'هذا الاجتماع انتهى.', cancelled: 'هذا الاجتماع انلغى.', not_found: 'الاجتماع غير موجود.', auth: 'سجّلي دخولك من جديد.' };

  async function join(id) {
    if (R) return;
    var m = S.meetings.filter(function (x) { return x.id === id; })[0]; if (!m) return;
    var j = await sb.rpc('meeting_join', { p_id: id });
    if (j.error || j.data !== 'ok') { toast(JOIN_MSG[j.data] || 'تعذر الدخول، جربي مرة ثانية.'); load(); return; }
    var stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (e) { toast('لازم تسمحين للمتصفح يستخدم المايكروفون عشان تدخلين الاجتماع.'); return; }
    R = { m: m, id: id, stream: stream, peers: {}, people: {}, muted: false, host: full, recorder: null, chunks: [], recStart: 0,
      ctx: null, mixDest: null, levels: {}, started: Date.now(), ended: false };
    try { R.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
    meter(uid, stream);
    roomEl.hidden = false; document.body.style.overflow = 'hidden';
    drawRoom();

    if (full && m.status === 'scheduled') {
      await sb.from('team_meetings').update({ status: 'live', started_at: new Date().toISOString() }).eq('id', id);
      m.status = 'live'; R.recordMe = true;
    } else if (full && m.status === 'live' && !m.started_at) { R.recordMe = true; }
    if (R.recordMe) startRecording();

    var ch = sb.channel('meet:' + id, { config: { private: true, broadcast: { self: false }, presence: { key: uid } } });
    R.ch = ch;
    ch.on('broadcast', { event: 'sig' }, function (msg) { onSignal(msg.payload); })
      .on('broadcast', { event: 'end' }, function () { if (!R || R.recordMe) return; leave('انتهى الاجتماع. شكراً لحضورك.'); })
      .on('presence', { event: 'sync' }, function () { onPresence(ch.presenceState()); })
      .subscribe(async function (status) {
        if (status === 'SUBSCRIBED') {
          await ch.track({ uid: uid, name: myName || me().name || '', host: full, recording: !!R.recordMe, muted: false });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (R && !R.ended) { R.err = 'انقطع الاتصال بالغرفة. تأكدي من الإنترنت.'; drawRoom(); }
        }
      });
    R.timer = setInterval(drawLevels, 200);
    R.clock = setInterval(drawRoom, 15000);
    window.addEventListener('beforeunload', unloadGuard);
  }
  function unloadGuard(e) { if (R && R.recordMe) { e.preventDefault(); e.returnValue = ''; } }

  function onPresence(state) {
    if (!R) return;
    var now = {};
    Object.keys(state).forEach(function (k) { var meta = state[k][0]; if (meta) now[k] = meta; });
    R.people = now;
    Object.keys(now).forEach(function (k) { if (k !== uid && !R.peers[k] && uid < k) connect(k, true); });
    Object.keys(R.peers).forEach(function (k) { if (!now[k]) dropPeer(k); });
    drawRoom();
  }
  function newPC(peer) {
    var pc = new RTCPeerConnection({ iceServers: ICE });
    R.stream.getTracks().forEach(function (t) { pc.addTrack(t, R.stream); });
    pc.onicecandidate = function (e) { if (e.candidate) send(peer, 'ice', e.candidate.toJSON ? e.candidate.toJSON() : e.candidate); };
    pc.ontrack = function (e) {
      var s = e.streams[0]; if (!s || R.peers[peer].stream === s) return;
      R.peers[peer].stream = s;
      var a = document.createElement('audio'); a.autoplay = true; a.playsInline = true; a.srcObject = s; a.dataset.peer = peer;
      roomEl.appendChild(a); R.peers[peer].audio = a;
      meter(peer, s);
      if (R.mixDest && R.ctx) { try { R.ctx.createMediaStreamSource(s).connect(R.mixDest); } catch (_) {} }
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'failed') { dropPeer(peer); if (R && uid < peer && R.people[peer]) setTimeout(function () { if (R && !R.peers[peer] && R.people[peer]) connect(peer, true); }, 1500); }
      drawRoom();
    };
    R.peers[peer] = { pc: pc, stream: null, audio: null, queue: [] };
    return pc;
  }
  async function connect(peer, offer) {
    var pc = newPC(peer);
    if (!offer) return pc;
    var o = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(o);
    send(peer, 'offer', { type: o.type, sdp: o.sdp });
    return pc;
  }
  async function onSignal(p) {
    if (!R || !p || p.to !== uid || !p.from) return;
    var peer = p.from, entry = R.peers[peer];
    try {
      if (p.kind === 'offer') {
        if (entry) dropPeer(peer);
        var pc = await connect(peer, false);
        await pc.setRemoteDescription(p.data);
        var ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
        send(peer, 'answer', { type: ans.type, sdp: ans.sdp });
        flush(peer);
      } else if (p.kind === 'answer' && entry) {
        await entry.pc.setRemoteDescription(p.data); flush(peer);
      } else if (p.kind === 'ice') {
        if (entry && entry.pc.remoteDescription) await entry.pc.addIceCandidate(p.data);
        else { (entry ? entry.queue : (R.pending = R.pending || {}, R.pending[peer] = R.pending[peer] || [])).push(p.data); }
      }
    } catch (e) { console.warn('signal', e); }
  }
  function flush(peer) {
    var e = R.peers[peer]; if (!e) return;
    var q = (e.queue || []).concat((R.pending && R.pending[peer]) || []);
    e.queue = []; if (R.pending) delete R.pending[peer];
    q.forEach(function (c) { e.pc.addIceCandidate(c).catch(function () {}); });
  }
  function send(peer, kind, data) { if (R && R.ch) R.ch.send({ type: 'broadcast', event: 'sig', payload: { from: uid, to: peer, kind: kind, data: data } }); }
  function dropPeer(peer) {
    var e = R && R.peers[peer]; if (!e) return;
    try { e.pc.close(); } catch (_) {}
    if (e.audio) e.audio.remove();
    delete R.peers[peer]; delete R.levels[peer];
  }

  /* speaking indicator */
  function meter(id, stream) {
    if (!R.ctx) return;
    try {
      var src = R.ctx.createMediaStreamSource(stream), an = R.ctx.createAnalyser();
      an.fftSize = 512; src.connect(an);
      R.levels[id] = { an: an, buf: new Uint8Array(an.fftSize), v: 0 };
    } catch (_) {}
  }
  function drawLevels() {
    if (!R) return;
    Object.keys(R.levels).forEach(function (id) {
      var l = R.levels[id], sum = 0; l.an.getByteTimeDomainData(l.buf);
      for (var i = 0; i < l.buf.length; i++) { var x = (l.buf[i] - 128) / 128; sum += x * x; }
      var rms = Math.sqrt(sum / l.buf.length), el = roomEl.querySelector('.p[data-id="' + id + '"]');
      var talking = rms > 0.04 && !(id === uid && R.muted);
      if (el) el.classList.toggle('talk', talking);
    });
  }

  /* recording (host's laptop): everyone's voice mixed into one file */
  function startRecording() {
    if (!R.ctx || !window.MediaRecorder) { R.recErr = 'المتصفح ما يدعم التسجيل. جربي Chrome أو Edge.'; return; }
    R.mixDest = R.ctx.createMediaStreamDestination();
    try { R.ctx.createMediaStreamSource(R.stream).connect(R.mixDest); } catch (_) {}
    Object.keys(R.peers).forEach(function (k) { var s = R.peers[k].stream; if (s) try { R.ctx.createMediaStreamSource(s).connect(R.mixDest); } catch (_) {} });
    var type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].filter(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0] || '';
    R.recorder = new MediaRecorder(R.mixDest.stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
    R.recType = R.recorder.mimeType || type || 'audio/webm';
    R.recorder.ondataavailable = function (e) { if (e.data && e.data.size) R.chunks.push(e.data); };
    R.recorder.start(5000); R.recStart = Date.now();
  }
  function stopRecording() {
    return new Promise(function (resolve) {
      if (!R || !R.recorder || R.recorder.state === 'inactive') { resolve(null); return; }
      R.recorder.onstop = function () { resolve(new Blob(R.chunks, { type: R.recType })); };
      try { R.recorder.stop(); } catch (_) { resolve(null); }
    });
  }

  async function endMeeting() {
    if (!R || R.ending) return;
    R.ending = true; drawRoom();
    var blob = await stopRecording(), recId = null, sec = Math.round((Date.now() - (R.recStart || Date.now())) / 1000);
    if (blob && blob.size) {
      recId = 'meeting-' + R.id.slice(0, 8) + '-' + Date.now() + (R.recType.indexOf('mp4') >= 0 ? '.m4a' : R.recType.indexOf('ogg') >= 0 ? '.ogg' : '.webm');
      var up = await sb.storage.from('attachments').upload(recId, blob, { contentType: R.recType.split(';')[0], upsert: false });
      if (up.error) {
        recId = null;
        try { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'تسجيل-الاجتماع.webm'; document.body.appendChild(a); a.click(); a.remove(); } catch (_) {}
        toast('تعذر رفع التسجيل، فنزّلناه على جهازك.');
      }
    }
    await sb.from('team_meetings').update({ status: 'ended', ended_at: new Date().toISOString(), recording_id: recId, recording_sec: recId ? sec : null }).eq('id', R.id);
    if (R.ch) await R.ch.send({ type: 'broadcast', event: 'end', payload: {} });
    leave(recId ? 'انتهى الاجتماع وانحفظ التسجيل.' : 'انتهى الاجتماع.');
  }
  function leave(msg) {
    if (!R) return;
    R.ended = true;
    clearInterval(R.timer); clearInterval(R.clock);
    Object.keys(R.peers).forEach(dropPeer);
    R.stream.getTracks().forEach(function (t) { t.stop(); });
    try { if (R.recorder && R.recorder.state !== 'inactive') R.recorder.stop(); } catch (_) {}
    if (R.ch) { try { R.ch.untrack(); } catch (_) {} sb.removeChannel(R.ch); }
    try { R.ctx && R.ctx.close(); } catch (_) {}
    window.removeEventListener('beforeunload', unloadGuard);
    R = null; roomEl.hidden = true; roomEl.innerHTML = ''; document.body.style.overflow = '';
    if (msg) toast(msg);
    load();
  }
  function toggleMute() {
    if (!R) return;
    R.muted = !R.muted;
    R.stream.getAudioTracks().forEach(function (t) { t.enabled = !R.muted; });
    if (R.ch) R.ch.track({ uid: uid, name: myName || me().name || '', host: full, recording: !!R.recordMe, muted: R.muted });
    drawRoom();
  }
  function drawRoom() {
    if (!R || !roomEl) return;
    var m = R.m, list = Object.keys(R.people).length ? Object.keys(R.people) : [uid];
    if (list.indexOf(uid) < 0) list.unshift(uid);
    var recording = !!R.recordMe || Object.keys(R.people).some(function (k) { return R.people[k].recording; });
    var elapsed = Math.max(0, mins(Date.now() - new Date(m.started_at || m.starts_at).getTime()));
    var h = '<div class="mr-in"><div><h2>' + esc(m.title) + '</h2><div class="sub">' + esc(when(m.starts_at)) + ' · ' + (elapsed ? 'مرّ ' + span(elapsed) : 'بدأ الحين') + '</div></div>' +
      (recording ? '<div class="recbar" role="status"><i></i>الاجتماع يتسجّل صوتياً</div>' : '<div class="msg">التسجيل يبدأ أول ما تدخل مديرة الاجتماع.</div>') +
      (R.recErr ? '<div class="msg">' + esc(R.recErr) + '</div>' : '') + (R.err ? '<div class="msg">' + esc(R.err) + '</div>' : '') +
      '<div class="people">' + list.map(function (k) {
        var p = R.people[k] || { name: k === uid ? (myName || me().name) : person(k) }, nm = p.name || person(k) || '؟';
        var st = k === uid ? 'أنتِ' : (R.peers[k] && R.peers[k].pc.connectionState === 'connected') ? (p.host ? 'الإدارة' : 'متصلة') : 'تتصل…';
        return '<div class="p" data-id="' + esc(k) + '"><div class="av">' + esc(nm.charAt(0)) + '</div><b>' + esc(nm) + '</b><small>' + esc(st) + ((k === uid ? R.muted : p.muted) ? ' · الصوت مقفل' : '') + '</small></div>';
      }).join('') + '</div>' +
      (m.agenda ? '<div><div class="sub" style="margin-bottom:6px">الأجندة</div><div class="ag">' + esc(m.agenda) + '</div></div>' : '') +
      '<div class="ctl"><button class="btn' + (R.muted ? ' on' : '') + '" type="button" data-t="mute">' + (R.muted ? 'تشغيل المايك' : 'قفل المايك') + '</button>' +
      (R.recordMe ? '<button class="btn end" type="button" data-t="end"' + (R.ending ? ' disabled' : '') + '>' + (R.ending ? 'جاري حفظ التسجيل…' : 'إنهاء الاجتماع للجميع') + '</button>'
        : '<button class="btn end" type="button" data-t="leave">مغادرة</button>') + '</div></div>';
    var audios = Array.prototype.slice.call(roomEl.querySelectorAll('audio'));
    roomEl.innerHTML = h; audios.forEach(function (a) { roomEl.appendChild(a); });
  }

  /* ---------- clicks ---------- */
  var T = {
    join: function (el) { join(el.dataset.id); },
    openm: function (el) { var id = el.dataset.id; location.hash = 'crm'; setTimeout(function () { document.dispatchEvent(new CustomEvent('crm:open', { detail: id })); }, 250); },
    tocrm: function () { location.hash = 'crm'; },
    new: openSheet, close: closeSheet, save: saveMeeting,
    askcancel: function (el) { S.confirm = 'c' + el.dataset.id; draw(); },
    cancel: function (el) { cancelMeeting(el.dataset.id); },
    mute: toggleMute, end: endMeeting, leave: function () { leave(''); }
  };
  function onClick(e) {
    var el = e.target.closest && e.target.closest('[data-t]'); if (!el || el.disabled) return;
    var f = T[el.dataset.t]; if (!f) return; e.preventDefault(); f(el);
  }

  /* ---------- wiring ---------- */
  function setup() {
    if (todayEl) return;
    todayEl = document.getElementById('myday'); mgrEl = document.getElementById('teammeet');
    sheetEl = document.createElement('div'); sheetEl.id = 'team-sheet'; sheetEl.dir = 'rtl'; sheetEl.hidden = true; document.body.appendChild(sheetEl);
    roomEl = document.createElement('div'); roomEl.id = 'meet-room'; roomEl.dir = 'rtl'; roomEl.lang = 'ar'; roomEl.hidden = true;
    roomEl.setAttribute('role', 'dialog'); roomEl.setAttribute('aria-label', 'غرفة الاجتماع'); document.body.appendChild(roomEl);
    [todayEl, mgrEl, sheetEl, roomEl].forEach(function (el) { if (el) el.addEventListener('click', onClick); });
  }
  function auth() {
    var a = window.officeAuth; if (!a || sb) return;
    sb = a.sb; uid = a.uid || ''; role = a.role || ''; full = !!a.full; myName = a.name || '';
    live(); load();
    tick = setInterval(function () {
      if (R) return;
      upcoming().forEach(function (m) {
        var left = new Date(m.starts_at).getTime() - Date.now();
        if (left > 0 && left <= WINDOW_MIN * 60000 && !warned[m.id] && (full || (m.invitees || []).indexOf(uid) >= 0)) {
          warned[m.id] = 1; toast('اجتماع «' + m.title + '» يبدأ بعد ' + span(Math.max(1, mins(left))) + '. تقدرين تدخلين الحين.');
        }
      });
      draw();
    }, 20000);
  }
  document.addEventListener('office:auth', auth);
  document.addEventListener('office:view', function (e) {
    setup(); auth();
    view = e.detail;
    if (todayEl) todayEl.hidden = view !== 'today';
    if (mgrEl) mgrEl.hidden = !(view === 'meeting' && full);
    draw();
  });
  if (window.officeAuth) auth();
})();
