/* Shahnat marketing office — CRM (إدارة علاقات العملاء)
   Merchants, their contact log and follow-up tasks, stored in the Supabase tables
   crm_merchants / crm_activities / crm_tasks. Needs no API key.
   Lives in its own <section id="crm"> so the office's re-renders never touch it. */
(function () {
  'use strict';

  var STAGES = [
    ['lead', 'عميل محتمل'], ['contacted', 'تم التواصل'], ['interested', 'مهتم'], ['registered', 'سجّل'],
    ['first_shipment', 'أول شحنة'], ['active', 'نشط'], ['inactive', 'متوقف'], ['lost', 'خسرناه']
  ];
  var STAGE = {}; STAGES.forEach(function (s) { STAGE[s[0]] = s[1]; });
  var STAGE_CLS = { lead: 'p-new', contacted: 'p-doing', interested: 'p-review', registered: 'p-doing',
    first_shipment: 'p-review', active: 'p-done', inactive: 'p-new', lost: 'c-lost' };
  var ACT = { call: 'مكالمة', whatsapp: 'واتساب', email: 'إيميل', meeting: 'اجتماع', visit: 'زيارة', note: 'ملاحظة', stage_change: 'تغيير مرحلة' };
  var CARRIERS = ['SMSA', 'Aramex', 'J&T', 'RedBox', 'iMile', 'أي مكان'];
  var SOURCES = ['خرائط قوقل', 'انستقرام', 'إكس', 'تيك توك', 'إحالة', 'الموقع', 'واتساب', 'معرض أو فعالية', 'تواصل مباشر', 'أخرى'];
  /* ready-made WhatsApp messages: warm, professional, no prices or bank details. The office manager can edit them. */
  var DEFAULT_TPL = [
    { t: 'رسالة تعريف', b: 'السلام عليكم ورحمة الله، حياكم الله {المسؤول}.\nمعك {اسمي} من منصة شحنات. مرّينا على {المحل} وحبينا نعرّفكم علينا: شحنات منصة تجمع لكم أكبر شركات الشحن في مكان واحد، مثل سمسا وأرامكس وJ&T وريدبوكس، وتوصل شحناتكم من الباب للباب داخل المملكة.\nوميزتنا إن فريق خدمة العملاء ينشئ الشحنة عنكم، بدون ما تحتاجون تتعاملون مع أي نظام.\nيناسبكم أرسل لكم التفاصيل؟ وتقدرون تسجّلون اهتمامكم مباشرة من هنا: {رابطي}' },
    { t: 'متابعة بعد أيام', b: 'السلام عليكم {المسؤول}، معك {اسمي} من شحنات.\nتواصلنا معكم قبل كم يوم بخصوص الشحن، وحبيت أطمّن إذا عندكم أي سؤال.\nولو حابين نجرب معكم أول شحنة، نرتبها لكم من البداية للنهاية.' },
    { t: 'ترحيب بعد التسجيل', b: 'حياكم الله {المسؤول}، سعدنا بانضمام {المحل} لشحنات.\nأول ما تكون عندكم شحنة، أرسلوا لنا تفاصيلها هنا ونجهّزها لكم.\nوأنا {اسمي} بالخدمة لأي استفسار.' },
    { t: 'تذكير بأول شحنة', b: 'مساء الخير {المسؤول}، معك {اسمي} من شحنات.\nحسابكم جاهز عندنا، وإذا عندكم طلب يحتاج يوصل لعميل، أرسلوا لنا بياناته ونتكفل بالباقي.' }
  ];

  var S = { loaded: false, loading: false, err: '', merchants: [], tasks: [], people: [], acts: {},
    stage: 'all', q: '', sheet: null, busy: false, confirm: false, importRows: null, tpl: null, team: null };
  var sb = null, full = false, role = '', uid = '', myName = '', root = null, sheetEl = null, chan = null, reloadT = null;

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { var el = $('#toast'); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3200); }
  var DF = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short' });
  var DTF = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  function fd(iso) { return iso ? DF.format(new Date(iso)) : ''; }
  function fdt(iso) { return iso ? DTF.format(new Date(iso)) : ''; }
  function dayStart(d) { d = d ? new Date(d) : new Date(); d.setHours(0, 0, 0, 0); return d; }
  function endOfToday() { var d = dayStart(); d.setDate(d.getDate() + 1); return d; }
  function isDue(iso) { return !!iso && new Date(iso) < endOfToday(); }
  function isLate(iso) { return !!iso && new Date(iso) < dayStart(); }
  function dateInput(iso) { if (!iso) return ''; var d = new Date(iso); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fromDateInput(v) { if (!v) return null; var p = v.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 9, 0, 0).toISOString(); }
  function plusDays(n) { var d = dayStart(); d.setDate(d.getDate() + n); return dateInput(d); }
  function waPhone(p) {
    var d = String(p || '').replace(/[^\d]/g, '');
    if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1);
    else if (/^5\d{8}$/.test(d)) d = '966' + d;
    else if (/^00/.test(d)) d = d.slice(2);
    return d;
  }
  function myRef() { var p = S.people.filter(function (x) { return x.id === uid; })[0]; return p && p.ref_code ? p.ref_code : ''; }
  function refLink(code) { return 'https://shahnat.net/?ref=' + encodeURIComponent(code); }
  function person(id) { var p = S.people.filter(function (x) { return x.id === id; })[0]; return p ? (p.name || 'بدون اسم') : ''; }
  function canEdit(m) { return full || (role === 'marketer' && !!m && m.owner_id === uid); }
  var canAdd = function () { return full || role === 'marketer'; };
  function merchant(id) { return S.merchants.filter(function (m) { return m.id === id; })[0]; }
  function errMsg(e) {
    var m = (e && (e.message || e.code)) || '';
    if (/row-level|permission|42501/i.test(m)) return 'ما عندك صلاحية لهذا التعديل.';
    if (/fetch|network/i.test(m)) return 'الاتصال انقطع. تأكدي من الإنترنت وجربي مرة ثانية.';
    return 'صار خطأ: ' + m;
  }

  /* ---------- styles (built on the office's own variables and classes) ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#crm{padding-bottom:20px}' +
    '#crm .pipe{display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:10px}' +
    '#crm .pipe .chip b{font-variant-numeric:tabular-nums;margin-inline-start:6px}' +
    '#crm .today{background:var(--navy);color:var(--navy-ink);border-radius:6px;padding:14px 16px;display:grid;gap:8px;margin-bottom:16px}' +
    '#crm .today h3{margin:0;font:700 16px var(--display)}' +
    '#crm .today .fitem{display:flex;justify-content:space-between;gap:10px;width:100%;text-align:start;background:rgba(255,255,255,.09);border:0;border-radius:4px;padding:9px 12px;color:var(--navy-ink);cursor:pointer;font:inherit}' +
    '#crm .today .fitem small{flex:none;opacity:.85;font-size:12.5px}' +
    '#crm .today p{margin:0;font-size:14px;opacity:.85}' +
    '#crm .search{margin-bottom:12px}' +
    '#crm .goals{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;border-top:1px solid var(--line);margin-top:8px;padding-top:10px}#crm .goals>b{width:100%;font-size:14px}' +
    '#crm .goals label{display:grid;gap:4px;font-size:13.5px}#crm .goals input{width:90px}' +
    '#crm .mylink{background:var(--surface);border:1px solid var(--line);border-inline-start:4px solid var(--bright,#F85F22);border-radius:6px;padding:12px 14px;margin-bottom:16px;display:grid;gap:8px}' +
    '#crm .mylink small{display:block;color:var(--muted);font-size:13px}#crm .mylink .lrow{display:flex;gap:8px}#crm .mylink input{flex:1;min-width:0;font-size:14px}' +
    '#crm .team{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:12px 14px;margin-bottom:16px}' +
    '#crm .team h3{margin:0 0 8px;font:700 16px var(--display)}#crm .team h3 small{font-weight:400;color:var(--muted);font-size:13px}' +
    '#crm .trow{display:grid;grid-template-columns:minmax(0,1.5fr) repeat(5,minmax(0,1fr));gap:6px;padding:7px 0;border-top:1px solid var(--line);font-size:14.5px;align-items:center}' +
    '#crm .trow.th{border-top:0;color:var(--muted);font-size:12.5px;padding-top:0}#crm .trow b{font-variant-numeric:tabular-nums;text-align:center}#crm .trow.th span:not(:first-child){text-align:center}' +
    '#crm-sheet .tpl{display:grid;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:12px}' +
    '#crm .foot{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}' +
    '.c-lost{background:#F9E3E1;color:var(--bad)}' +
    '#crm-sheet{position:fixed;inset:0;z-index:45;background:var(--bg);overflow-y:auto;overscroll-behavior:contain;' +
    'padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-bottom:env(safe-area-inset-bottom,0px)}' +
    '#crm-sheet[hidden]{display:none}' +
    '#crm-sheet .quick{display:flex;flex-wrap:wrap;gap:8px}' +
    '#crm-sheet .quick a{text-decoration:none;color:inherit}' +
    '#crm-sheet .tl{display:grid;gap:8px}' +
    '#crm-sheet .tl .it{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:10px 12px;font-size:14.5px}' +
    '#crm-sheet .tl .it small{display:block;color:var(--muted);font-size:12.5px}' +
    '#crm-sheet .ctask{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:8px 12px}' +
    '#crm-sheet .ctask input{width:22px;height:22px;min-height:0;flex:none}' +
    '#crm-sheet .ctask span{flex:1;min-width:0;overflow-wrap:anywhere}' +
    '#crm-sheet .ctask.done span{text-decoration:line-through;color:var(--muted)}' +
    '#crm-sheet .carriers{display:flex;flex-wrap:wrap;gap:8px 14px}' +
    '#crm-sheet .carriers label{display:flex;align-items:center;gap:6px;font-weight:500}' +
    '#crm-sheet .carriers input{width:20px;height:20px;min-height:0}' +
    '#crm-sheet .stagebar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
    '#crm-sheet .stagebar select{width:auto;flex:1;min-width:160px}' +
    '@media (max-width:480px){#crm-sheet .two{grid-template-columns:1fr}}';
  document.head.appendChild(css);

  /* ---------- data ---------- */
  async function load() {
    if (!sb || S.loading) return;
    S.loading = true;
    try {
      var r = await Promise.all([
        sb.from('crm_merchants').select('*').order('updated_at', { ascending: false }),
        sb.from('crm_tasks').select('*').eq('done', false).order('due_at', { ascending: true, nullsFirst: false }),
        sb.from('profiles').select('id,name,role,ref_code,weekly_goal'),
        sb.from('docs').select('data').eq('path', 'config/crm_templates').maybeSingle(),
        full ? sb.from('crm_activities').select('created_by,type,merchant_id').neq('type', 'stage_change').gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()) : Promise.resolve({ data: null })
      ]);
      if (r[0].error) throw r[0].error;
      if (r[1].error) throw r[1].error;
      S.merchants = r[0].data || []; S.tasks = r[1].data || []; S.people = r[2].data || [];
      var tl = r[3].data && r[3].data.data && r[3].data.data.list;
      S.tpl = (tl && tl.length) ? tl : DEFAULT_TPL;
      S.team = r[4].data;
      S.err = ''; S.loaded = true;
      if (S.sheet && S.sheet.type === 'merchant') await loadMerchant(S.sheet.id, true);
    } catch (e) { S.err = errMsg(e); }
    S.loading = false;
    draw();
  }
  async function loadMerchant(id, quiet) {
    var r = await Promise.all([
      sb.from('crm_activities').select('*').eq('merchant_id', id).order('created_at', { ascending: false }).limit(100),
      sb.from('crm_tasks').select('*').eq('merchant_id', id).order('done').order('due_at', { ascending: true, nullsFirst: false })
    ]);
    S.acts[id] = { list: r[0].data || [], tasks: r[1].data || [] };
    if (!quiet) drawSheet();
  }
  function live() {
    if (chan || !sb) return;
    function later() { clearTimeout(reloadT); reloadT = setTimeout(load, 400); }
    chan = sb.channel('office-crm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_merchants' }, later)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_tasks' }, later)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_activities' }, later)
      .subscribe();
  }

  /* ---------- main view ---------- */
  function filtered() {
    var q = S.q.trim().toLowerCase();
    return S.merchants.filter(function (m) {
      if (S.stage === 'due') { if (!isDue(m.next_follow_up_at)) return false; }
      else if (S.stage !== 'all' && m.stage !== S.stage) return false;
      if (!q) return true;
      return [m.name, m.contact_name, m.phone, m.email, m.city, m.sector, m.notes].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function dueItems() {
    var out = [];
    S.tasks.forEach(function (t) {
      if (isDue(t.due_at)) { var m = merchant(t.merchant_id); out.push({ at: t.due_at, txt: t.title + (m ? ' · ' + m.name : ''), mid: t.merchant_id, late: isLate(t.due_at) }); }
    });
    S.merchants.forEach(function (m) {
      if (isDue(m.next_follow_up_at) && m.stage !== 'lost') out.push({ at: m.next_follow_up_at, txt: 'متابعة ' + m.name, mid: m.id, late: isLate(m.next_follow_up_at) });
    });
    return out.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  }
  function draw() {
    if (!root) return;
    if (!S.loaded) {
      root.innerHTML = S.err ? '<div class="empty">' + esc(S.err) + '<br><button class="btn" type="button" data-c="reload" style="margin-top:12px">حاولي مرة ثانية</button></div>'
        : '<div class="empty"><span class="spin"></span> نفتح العملاء…</div>';
      return;
    }
    var counts = { all: S.merchants.length, due: 0 };
    S.merchants.forEach(function (m) { counts[m.stage] = (counts[m.stage] || 0) + 1; if (isDue(m.next_follow_up_at)) counts.due++; });
    var h = '<div class="rowhead"><h2>العملاء</h2>' + (canAdd() ? '<button class="btn pri" type="button" data-c="new">+ تاجر جديد</button>' : '') + '</div>';
    var due = dueItems();
    h += '<section class="today" aria-label="متابعات اليوم"><h3>متابعات اليوم' + (due.length ? ' (' + due.length + ')' : '') + '</h3>';
    if (!due.length) h += '<p>ما فيه متابعات مستحقة اليوم.</p>';
    else h += due.slice(0, 6).map(function (d) {
      return '<button type="button" class="fitem" data-c="open" data-id="' + esc(d.mid) + '"><span>' + esc(d.txt) + '</span><small>' + (d.late ? 'متأخرة · ' : '') + esc(fd(d.at)) + '</small></button>';
    }).join('') + (due.length > 6 ? '<p>و' + (due.length - 6) + ' غيرها.</p>' : '');
    h += '</section>';
    if (myRef()) h += '<section class="mylink" aria-label="رابطك الخاص"><div><b>رابطك الخاص</b><small>أي تاجر يسجّل من هذا الرابط ينضاف لك تلقائياً.</small></div>' +
      '<div class="lrow"><input readonly dir="ltr" id="crm-mylink" value="' + esc(refLink(myRef())) + '"><button class="btn" type="button" data-c="copylink">نسخ</button></div></section>';
    if (full) h += teamCard();
    h += '<div class="pipe" role="group" aria-label="المراحل">' + [['all', 'الكل'], ['due', 'مستحق اليوم']].concat(STAGES).map(function (s) {
      return '<button type="button" class="chip" data-c="stage" data-s="' + s[0] + '" aria-pressed="' + (S.stage === s[0]) + '">' + s[1] + '<b>' + (counts[s[0]] || 0) + '</b></button>';
    }).join('') + '</div>';
    h += '<input class="search" id="crm-q" type="search" placeholder="ابحثي بالاسم أو الجوال أو المدينة" value="' + esc(S.q) + '">';
    h += '<div id="crm-list"></div>';
    h += '<div class="foot">' + (full ? '<button class="btn" type="button" data-c="import">استيراد من إكسل (CSV)</button><button class="btn" type="button" data-c="tpls">رسائل واتساب الجاهزة</button>' : '') +
      '<button class="btn" type="button" data-c="export"' + (S.merchants.length ? '' : ' disabled') + '>تصدير القائمة</button></div>';
    root.innerHTML = h;
    drawList();
  }
  function teamCard() {
    var by = {}, acts = S.team || [];
    function row(id) { return by[id] = by[id] || { merchants: 0, won: 0, contacts: 0, reached: {}, site: 0 }; }
    S.merchants.forEach(function (m) {
      var r = row(m.owner_id || '-'); r.merchants++; if (m.source === 'الموقع') r.site++;
      if (['registered', 'first_shipment', 'active'].indexOf(m.stage) >= 0) r.won++;
    });
    acts.forEach(function (a) { var r = row(a.created_by || '-'); r.contacts++; r.reached[a.merchant_id] = 1; });
    var ids = Object.keys(by).filter(function (k) { return k !== '-'; });
    var mk = S.people.filter(function (p) { return p.role === 'marketer'; });
    var goals = mk.length ? '<div class="goals"><b>هدف الأسبوع (عدد التواصل)</b>' + mk.map(function (p) {
      return '<label>' + esc(p.name || 'بدون اسم') + '<input type="number" min="0" max="1000" inputmode="numeric" class="goal-in" data-id="' + esc(p.id) + '" value="' + (p.weekly_goal == null ? 20 : p.weekly_goal) + '"></label>';
    }).join('') + '<button class="btn" type="button" data-c="savegoals">حفظ الأهداف</button></div>' : '';
    if (!ids.length) return mk.length ? '<section class="team" aria-label="أداء الفريق"><h3>أداء الفريق</h3><p class="muted" style="margin:0 0 8px;font-size:14px">ما فيه نشاط للحين.</p>' + goals + '</section>' : '';
    ids.sort(function (a, b) { return by[b].contacts - by[a].contacts; });
    return '<section class="team" aria-label="أداء الفريق"><h3>أداء الفريق <small>آخر 7 أيام</small></h3><div class="trow th"><span>الاسم</span><span>تواصل</span><span>محلات</span><span>عندها</span><span>من الموقع</span><span>تحوّلوا</span></div>' +
      ids.map(function (k) { var r = by[k];
        return '<div class="trow"><span>' + esc(person(k) || 'غير معروف') + '</span><b>' + r.contacts + '</b><b>' + Object.keys(r.reached).length + '</b><b>' + r.merchants + '</b><b>' + r.site + '</b><b>' + r.won + '</b></div>';
      }).join('') + goals + '</section>';
  }
  function drawList() {
    var el = $('#crm-list'); if (!el) return;
    var list = filtered();
    if (!S.merchants.length) { el.innerHTML = '<div class="empty">ما فيه تجار للحين. أضيفي أول تاجر، أو استوردي قائمتكم من إكسل.</div>'; return; }
    if (!list.length) { el.innerHTML = '<div class="empty">ما فيه نتائج.</div>'; return; }
    el.innerHTML = '<div class="tasks">' + list.map(function (m) {
      var fu = m.next_follow_up_at ? '<span class="' + (isLate(m.next_follow_up_at) ? 'late' : isDue(m.next_follow_up_at) ? 'hot' : '') + '">المتابعة: ' + esc(fd(m.next_follow_up_at)) + '</span>' : '';
      return '<button type="button" class="task" data-c="open" data-id="' + esc(m.id) + '"><span class="tt">' + esc(m.name) + '</span>' +
        '<span class="pill ' + (STAGE_CLS[m.stage] || 'p-new') + '">' + esc(STAGE[m.stage] || m.stage) + '</span>' +
        '<span class="tm">' + [m.contact_name, m.city, m.sector].filter(Boolean).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') +
        (m.expected_monthly_shipments ? '<span>' + m.expected_monthly_shipments + ' شحنة/شهر</span>' : '') + fu +
        (m.last_contact_at ? '<span>آخر تواصل: ' + esc(fd(m.last_contact_at)) + '</span>' : '') + '</span></button>';
    }).join('') + '</div>';
  }

  /* ---------- sheets ---------- */
  function openSheet(s) { S.sheet = s; S.confirm = false; drawSheet(); sheetEl.scrollTop = 0; }
  function closeSheet() { S.sheet = null; S.importRows = null; drawSheet(); }
  function drawSheet() {
    if (!sheetEl) return;
    if (!S.sheet) { sheetEl.hidden = true; sheetEl.innerHTML = ''; document.body.style.overflow = ''; return; }
    var st = sheetEl.scrollTop, body = '';
    if (S.sheet.type === 'new') body = head('تاجر جديد') + detailsForm({ stage: 'lead', preferred_carriers: [], owner_id: uid, source: role === 'marketer' ? 'خرائط قوقل' : '' }, true);
    else if (S.sheet.type === 'tpls') body = head('رسائل واتساب الجاهزة') + tplEditor();
    else if (S.sheet.type === 'import') body = head('استيراد تجار') + importView();
    else {
      var m = merchant(S.sheet.id);
      if (!m) { closeSheet(); return; }
      body = head(m.name) + merchantView(m);
    }
    sheetEl.innerHTML = '<div class="sin">' + body + '</div>';
    sheetEl.hidden = false; document.body.style.overflow = 'hidden'; sheetEl.scrollTop = st;
  }
  function head(t) {
    return '<div class="shead"><h2 style="font:700 21px var(--display);margin:0;min-width:0;overflow-wrap:anywhere">' + esc(t) + '</h2>' +
      '<button class="x" type="button" data-c="close">إغلاق</button></div>';
  }
  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }

  function merchantView(m) {
    var a = S.acts[m.id], h = '', can = canEdit(m);
    h += '<div class="stagebar"><span class="pill ' + (STAGE_CLS[m.stage] || 'p-new') + '">' + esc(STAGE[m.stage]) + '</span>' +
      (can ? '<select id="cm-stage" aria-label="تغيير المرحلة">' + STAGES.map(function (s) { return opt(s[0], s[1], m.stage); }).join('') + '</select>' : '') + '</div>';
    var meta = [m.contact_name && 'المسؤول: ' + m.contact_name, m.city, m.sector, m.source && 'المصدر: ' + m.source,
      m.owner_id && 'متابعة: ' + person(m.owner_id), m.last_contact_at && 'آخر تواصل: ' + fd(m.last_contact_at),
      m.next_follow_up_at && 'المتابعة الجاية: ' + fd(m.next_follow_up_at)].filter(Boolean);
    h += '<p class="meta" style="margin:12px 0 0">' + meta.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</p>';
    var wa = waPhone(m.phone);
    h += '<div class="quick" style="margin-top:12px">' +
      (m.phone ? '<a class="btn" href="tel:' + esc(m.phone.replace(/\s/g, '')) + '">اتصال</a>' : '') +
      (wa ? '<a class="btn" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + '">واتساب</a>' : '') +
      (m.email ? '<a class="btn" href="mailto:' + esc(m.email) + '">إيميل</a>' : '') +
      (m.store_url ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(/^https?:\/\//.test(m.store_url) ? m.store_url : 'https://' + m.store_url) + '">المتجر</a>' : '') +
      (m.maps_url ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(/^https?:\/\//.test(m.maps_url) ? m.maps_url : 'https://' + m.maps_url) + '">الموقع على الخريطة</a>' : '') + '</div>';
    if (can && wa && S.tpl && S.tpl.length) {
      h += '<div class="block"><h3>رسالة واتساب جاهزة</h3><p class="muted" style="margin:0;font-size:14px">تنفتح الرسالة في واتساب باسم المحل، وتقدرين تعدّلينها قبل الإرسال. وتنسجل في السجل تلقائياً.</p><div class="quick">' +
        S.tpl.map(function (t, i) { return '<button class="btn" type="button" data-c="wa" data-i="' + i + '">' + esc(t.t) + '</button>'; }).join('') + '</div></div>';
    }
    if (m.stage === 'lost' && m.lost_reason) h += '<p class="paper" style="margin-top:12px">سبب الخسارة: ' + esc(m.lost_reason) + '</p>';

    if (can) {
      h += '<div class="block"><h3>سجّلي تواصل</h3><div class="form">' +
        '<div class="two"><label>النوع<select id="ca-type">' + ['call', 'whatsapp', 'email', 'meeting', 'visit', 'note'].map(function (k) { return opt(k, ACT[k], 'call'); }).join('') + '</select></label>' +
        '<label>المتابعة الجاية<input id="ca-next" type="date" value="' + esc(plusDays(3)) + '"></label></div>' +
        '<label>وش صار؟<textarea id="ca-sum" style="min-height:90px" placeholder="مثال: كلمته وطلب عرض أسعار لشحن الرياض وجدة"></textarea></label>' +
        '<button class="btn pri" type="button" data-c="logact"' + (S.busy ? ' disabled' : '') + '>حفظ التواصل</button></div></div>';
    }

    h += '<div class="block"><h3>مهام المتابعة</h3>';
    if (!a) h += '<div class="empty"><span class="spin"></span></div>';
    else {
      h += a.tasks.length ? '<div class="tl">' + a.tasks.map(function (t) {
        return '<div class="ctask' + (t.done ? ' done' : '') + '"><input type="checkbox" data-c="tdone" data-id="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + (can ? '' : ' disabled') + ' aria-label="تم">' +
          '<span>' + esc(t.title) + (t.due_at ? ' <small class="' + (!t.done && isLate(t.due_at) ? 'late' : 'muted') + '">· ' + esc(fd(t.due_at)) + '</small>' : '') +
          (t.assigned_to ? ' <small class="muted">· ' + esc(person(t.assigned_to)) + '</small>' : '') + '</span>' +
          (can ? '<button class="btn danger" type="button" data-c="tdel" data-id="' + esc(t.id) + '" aria-label="حذف المهمة">حذف</button>' : '') + '</div>';
      }).join('') + '</div>' : '<p class="muted" style="margin:0">ما فيه مهام.</p>';
      if (can) h += '<div class="form" style="margin-top:4px"><div class="two"><label>مهمة جديدة<input id="ct-title" placeholder="مثال: أرسل عرض الأسعار"></label>' +
        '<label>موعدها<input id="ct-due" type="date" value="' + esc(plusDays(1)) + '"></label></div>' +
        (full ? '<label>المسؤول<select id="ct-who">' + opt('', 'بدون', '') + S.people.map(function (p) { return opt(p.id, p.name || 'بدون اسم', uid); }).join('') + '</select></label>' : '') +
        '<button class="btn" type="button" data-c="addtask">إضافة المهمة</button></div>';
    }
    h += '</div>';

    h += '<div class="block"><h3>السجل</h3>';
    if (a) h += a.list.length ? '<div class="tl">' + a.list.map(function (x) {
      var t = x.type === 'stage_change' ? 'من «' + (STAGE[x.from_stage] || x.from_stage || '') + '» إلى «' + (STAGE[x.to_stage] || x.to_stage || '') + '»' : x.summary;
      return '<div class="it"><small>' + esc(ACT[x.type] || x.type) + ' · ' + esc(fdt(x.created_at)) + (x.created_by ? ' · ' + esc(person(x.created_by)) : '') + '</small>' + esc(t) + '</div>';
    }).join('') + '</div>' : '<p class="muted" style="margin:0">ما فيه تواصل مسجّل للحين.</p>';
    h += '</div>';

    if (m.notes) h += '<div class="block"><h3>ملاحظات</h3><div class="paper brief">' + esc(m.notes) + '</div></div>';
    if (can) h += '<div class="block"><h3>بيانات التاجر</h3>' + detailsForm(m, false) + '</div>';
    if (full) {
      h += '<div class="block">' + (S.confirm ? '<p class="err">متأكدة؟ بينحذف التاجر وكل سجله ومهامه.</p><div class="actions"><button class="btn danger" type="button" data-c="del">إي، احذفي</button><button class="btn" type="button" data-c="nodel">تراجع</button></div>'
        : '<button class="btn danger" type="button" data-c="askdel">حذف التاجر</button>') + '</div>';
    }
    return h;
  }

  function detailsForm(m, isNew) {
    var c = m.preferred_carriers || [];
    return '<div class="form" id="cm-form">' +
      '<label>اسم المتجر أو الشركة *<input id="cm-name" value="' + esc(m.name) + '" required></label>' +
      '<div class="two"><label>اسم المسؤول<input id="cm-contact" value="' + esc(m.contact_name) + '"></label>' +
      '<label>الجوال<input id="cm-phone" type="tel" dir="ltr" value="' + esc(m.phone) + '" placeholder="05xxxxxxxx"></label></div>' +
      '<div class="two"><label>الإيميل<input id="cm-email" type="email" dir="ltr" value="' + esc(m.email) + '"></label>' +
      '<label>رابط المتجر<input id="cm-url" dir="ltr" value="' + esc(m.store_url) + '"></label></div>' +
      '<label>رابط خرائط قوقل<input id="cm-maps" dir="ltr" value="' + esc(m.maps_url) + '" placeholder="https://maps.app.goo.gl/..."></label>' +
      '<div class="two"><label>المدينة<input id="cm-city" value="' + esc(m.city) + '"></label>' +
      '<label>نشاط المتجر<input id="cm-sector" value="' + esc(m.sector) + '" placeholder="ملابس، عطور، إلكترونيات…"></label></div>' +
      '<div class="two"><label>مصدر العميل<select id="cm-source">' + opt('', 'اختاري', m.source || '') + SOURCES.map(function (s) { return opt(s, s, m.source); }).join('') +
      (m.source && SOURCES.indexOf(m.source) < 0 ? opt(m.source, m.source, m.source) : '') + '</select></label>' +
      '<label>الشحنات الشهرية المتوقعة<input id="cm-vol" type="number" inputmode="numeric" min="0" value="' + esc(m.expected_monthly_shipments == null ? '' : m.expected_monthly_shipments) + '"></label></div>' +
      '<div class="two">' + (isNew ? '<label>المرحلة<select id="cm-stage0">' + STAGES.map(function (s) { return opt(s[0], s[1], m.stage); }).join('') + '</select></label>' : '') +
      (full ? '<label>مين يتابعه<select id="cm-owner">' + opt('', 'بدون', m.owner_id || '') + S.people.map(function (p) { return opt(p.id, p.name || 'بدون اسم', m.owner_id); }).join('') + '</select></label>' : '') +
      '<label>المتابعة الجاية<input id="cm-next" type="date" value="' + esc(dateInput(m.next_follow_up_at)) + '"></label></div>' +
      '<fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:700;font-size:14.5px;margin-bottom:6px">شركات الشحن اللي يفضّلها</legend><div class="carriers">' +
      CARRIERS.map(function (k, i) { return '<label><input type="checkbox" class="cm-car" id="cm-car-' + i + '" value="' + esc(k) + '"' + (c.indexOf(k) >= 0 ? ' checked' : '') + '>' + esc(k) + '</label>'; }).join('') + '</div></fieldset>' +
      ((m.stage === 'lost' || isNew) ? '<label>سبب الخسارة (إذا خسرناه)<input id="cm-lost" value="' + esc(m.lost_reason) + '"></label>' : '') +
      '<label>ملاحظات<textarea id="cm-notes" style="min-height:90px">' + esc(m.notes) + '</textarea></label>' +
      '<p class="err" id="cm-err"></p>' +
      '<button class="btn pri wide" type="button" data-c="' + (isNew ? 'create' : 'save') + '"' + (S.busy ? ' disabled' : '') + '>' + (isNew ? 'إضافة التاجر' : 'حفظ التعديلات') + '</button></div>';
  }
  function readForm() {
    function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    var vol = v('cm-vol'), row = {
      name: v('cm-name'), contact_name: v('cm-contact'), phone: v('cm-phone'), email: v('cm-email'), store_url: v('cm-url'),
      city: v('cm-city'), sector: v('cm-sector'), source: v('cm-source'), notes: v('cm-notes'),
      expected_monthly_shipments: vol === '' ? null : Math.max(0, parseInt(vol, 10) || 0),
      maps_url: v('cm-maps'), owner_id: full ? (v('cm-owner') || null) : uid, next_follow_up_at: fromDateInput(v('cm-next')),
      preferred_carriers: Array.prototype.slice.call(sheetEl.querySelectorAll('.cm-car:checked')).map(function (x) { return x.value; })
    };
    if (document.getElementById('cm-lost')) row.lost_reason = v('cm-lost');
    if (document.getElementById('cm-stage0')) row.stage = v('cm-stage0');
    return row;
  }

  /* ---------- CSV import / export ---------- */
  var COLS = {
    name: ['name', 'store', 'company', 'الاسم', 'اسم المتجر', 'المتجر', 'الشركة', 'اسم الشركة', 'اسم التاجر', 'التاجر'],
    contact_name: ['contact', 'contact_name', 'المسؤول', 'اسم المسؤول', 'الشخص', 'اسم العميل'],
    phone: ['phone', 'mobile', 'الجوال', 'الهاتف', 'رقم الجوال', 'الرقم', 'جوال', 'واتساب'],
    email: ['email', 'الإيميل', 'الايميل', 'البريد', 'البريد الإلكتروني'],
    city: ['city', 'المدينة'],
    sector: ['sector', 'category', 'النشاط', 'القطاع', 'التصنيف', 'نشاط المتجر'],
    store_url: ['url', 'website', 'store_url', 'الرابط', 'الموقع', 'رابط المتجر'],
    source: ['source', 'المصدر'],
    notes: ['notes', 'ملاحظات', 'الملاحظات'],
    expected_monthly_shipments: ['shipments', 'الشحنات', 'عدد الشحنات', 'الشحنات الشهرية'],
    maps_url: ['maps', 'google maps', 'الخريطة', 'رابط الخريطة', 'قوقل ماب', 'خرائط قوقل', 'الموقع على الخريطة']
  };
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '', sep = (first.split(';').length > first.split(',').length) ? ';' : (first.indexOf('\t') >= 0 && first.indexOf(',') < 0 ? '\t' : ',');
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
    if (rows.length < 2) return { rows: [], miss: true };
    var hdr = rows[0].map(function (h) { return h.trim().toLowerCase(); }), map = {};
    Object.keys(COLS).forEach(function (k) { var i = hdr.findIndex(function (h) { return COLS[k].indexOf(h) >= 0; }); if (i >= 0) map[k] = i; });
    if (map.name == null) return { rows: [], miss: true };
    return { rows: rows.slice(1).map(function (r) {
      var o = { stage: 'lead' };
      Object.keys(map).forEach(function (k) { o[k] = (r[map[k]] || '').trim(); });
      o.expected_monthly_shipments = o.expected_monthly_shipments ? (parseInt(String(o.expected_monthly_shipments).replace(/[^\d]/g, ''), 10) || null) : null;
      return o;
    }).filter(function (o) { return o.name; }) };
  }
  function importView() {
    var h = '<div class="form"><p class="muted" style="margin:0">من إكسل: ملف ← حفظ باسم ← CSV UTF-8. أول سطر لازم يكون أسماء الأعمدة، وأهمها عمود <b>الاسم</b> (اسم المتجر). الأعمدة اللي أفهمها: الاسم، المسؤول، الجوال، الإيميل، المدينة، النشاط، الرابط، المصدر، الشحنات، ملاحظات.</p>' +
      '<label>اختاري الملف<input id="ci-file" type="file" accept=".csv,text/csv,text/plain"></label>' +
      '<label>أو الصقي البيانات هنا<textarea id="ci-text" style="min-height:110px" dir="auto" placeholder="الاسم,الجوال,المدينة&#10;متجر الورد,0550000000,الرياض"></textarea></label>' +
      '<button class="btn" type="button" data-c="parse">قراءة البيانات</button>';
    if (S.importRows) {
      if (S.importRows.miss) h += '<p class="err">ما لقيت عمود الاسم. تأكدي إن أول سطر فيه أسماء الأعمدة، وواحد منها «الاسم».</p>';
      else {
        var names = {}; S.merchants.forEach(function (m) { names[m.name.trim()] = 1; });
        var dup = S.importRows.rows.filter(function (r) { return names[r.name]; }).length;
        h += '<div class="paper">لقيت <b>' + S.importRows.rows.length + '</b> تاجر' + (dup ? '، منهم ' + dup + ' موجودين بنفس الاسم وبيتم تجاهلهم' : '') + '.<br>' +
          esc(S.importRows.rows.slice(0, 5).map(function (r) { return r.name; }).join('، ')) + (S.importRows.rows.length > 5 ? '…' : '') + '</div>' +
          '<button class="btn pri wide" type="button" data-c="doimport"' + (S.busy || S.importRows.rows.length === dup ? ' disabled' : '') + '>استيراد ' + (S.importRows.rows.length - dup) + ' تاجر</button>';
      }
    }
    return h + '</div>';
  }
  function exportCSV() {
    var cols = [['name', 'الاسم'], ['contact_name', 'المسؤول'], ['phone', 'الجوال'], ['email', 'الإيميل'], ['city', 'المدينة'], ['sector', 'النشاط'],
      ['stage', 'المرحلة'], ['source', 'المصدر'], ['expected_monthly_shipments', 'الشحنات الشهرية'], ['preferred_carriers', 'شركات الشحن'],
      ['last_contact_at', 'آخر تواصل'], ['next_follow_up_at', 'المتابعة الجاية'], ['notes', 'ملاحظات']];
    function cell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var lines = [cols.map(function (c) { return c[1]; }).join(',')].concat(filtered().map(function (m) {
      return cols.map(function (c) {
        var v = m[c[0]];
        if (c[0] === 'stage') v = STAGE[v] || v;
        if (c[0] === 'preferred_carriers') v = (v || []).join(' / ');
        if (/_at$/.test(c[0])) v = v ? dateInput(v) : '';
        return cell(v);
      }).join(',');
    }));
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'shahnat-crm-' + dateInput(new Date()) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- WhatsApp templates ---------- */
  function fillTpl(text, m) {
    return String(text)
      .replace(/\{المحل\}/g, m.name || '')
      .replace(/\{المسؤول\}/g, m.contact_name || '')
      .replace(/\{اسمي\}/g, myName || '')
      .replace(/\{رابطي\}/g, myRef() ? refLink(myRef()) : 'https://shahnat.net')
      .replace(/[ \t]+([،,.!؟])/g, '$1').replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').trim();
  }
  function tplEditor() {
    var list = S.tplDraft || (S.tplDraft = (S.tpl || DEFAULT_TPL).map(function (t) { return { t: t.t, b: t.b }; }));
    return '<div class="form"><p class="muted" style="margin:0">تقدرين تستخدمين داخل الرسالة: <b>{المحل}</b> لاسم المحل، و<b>{المسؤول}</b> لاسم صاحبه، و<b>{اسمي}</b> لاسم المسوّقة اللي ترسل، و<b>{رابطي}</b> لرابطها الخاص في موقع شحنات. إذا ما فيه اسم مسؤول، تنشال الكلمة تلقائياً.</p>' +
      list.map(function (t, i) {
        return '<div class="tpl"><label>عنوان الرسالة<input id="tp-t-' + i + '" value="' + esc(t.t) + '"></label>' +
          '<label>نص الرسالة<textarea id="tp-b-' + i + '" style="min-height:150px">' + esc(t.b) + '</textarea></label>' +
          '<button class="btn danger" type="button" data-c="deltpl" data-i="' + i + '">حذف هذي الرسالة</button></div>';
      }).join('') +
      '<button class="btn" type="button" data-c="addtpl">+ رسالة جديدة</button>' +
      '<p class="err" id="cm-err"></p><button class="btn pri wide" type="button" data-c="savetpl"' + (S.busy ? ' disabled' : '') + '>حفظ الرسائل</button>' +
      '<button class="btn ghost" type="button" data-c="resettpl">رجّعي الرسائل الأصلية</button></div>';
  }
  function readTplDraft() {
    (S.tplDraft || []).forEach(function (t, i) {
      var a = document.getElementById('tp-t-' + i), b = document.getElementById('tp-b-' + i);
      if (a) t.t = a.value.trim(); if (b) t.b = b.value.trim();
    });
  }

  /* ---------- actions ---------- */
  async function run(fn) {
    if (S.busy) return; S.busy = true; drawSheet();
    try { await fn(); } catch (e) { var el = $('#cm-err'); if (el) el.textContent = errMsg(e); toast(errMsg(e)); }
    S.busy = false; drawSheet();
  }
  var C = {
    reload: function () { S.err = ''; draw(); load(); },
    stage: function (el) { S.stage = el.dataset.s; draw(); },
    open: function (el) { var id = el.dataset.id; openSheet({ type: 'merchant', id: id }); loadMerchant(id); },
    new: function () { openSheet({ type: 'new' }); },
    import: function () { S.importRows = null; openSheet({ type: 'import' }); },
    tpls: function () { S.tplDraft = null; openSheet({ type: 'tpls' }); },
    addtpl: function () { readTplDraft(); S.tplDraft.push({ t: '', b: '' }); drawSheet(); },
    deltpl: function (el) { readTplDraft(); S.tplDraft.splice(+el.dataset.i, 1); drawSheet(); },
    resettpl: function () { S.tplDraft = DEFAULT_TPL.map(function (t) { return { t: t.t, b: t.b }; }); drawSheet(); },
    savetpl: function () {
      readTplDraft();
      var list = S.tplDraft.filter(function (t) { return t.t && t.b; });
      if (!list.length) { $('#cm-err').textContent = 'لازم تكون فيه رسالة وحدة على الأقل بعنوان ونص.'; return; }
      run(async function () {
        var r = await sb.from('docs').upsert({ path: 'config/crm_templates', collection: 'config', data: { list: list }, updated_at: new Date().toISOString() });
        if (r.error) throw r.error;
        S.tpl = list; S.tplDraft = null; S.sheet = null; toast('انحفظت الرسائل');
      });
    },
    wa: function (el) {
      var m = merchant(S.sheet.id), t = S.tpl[+el.dataset.i]; if (!m || !t) return;
      var text = fillTpl(t.b, m);
      window.open('https://wa.me/' + waPhone(m.phone) + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
      var id = m.id;
      sb.from('crm_activities').insert({ merchant_id: id, type: 'whatsapp', summary: 'رسالة واتساب جاهزة: ' + t.t }).then(async function (r) {
        if (r.error) return;
        if (m.stage === 'lead') {
          var u = await sb.from('crm_merchants').update({ stage: 'contacted' }).eq('id', id).select().single();
          if (!u.error) S.merchants = S.merchants.map(function (x) { return x.id === id ? u.data : x; });
        }
        await loadMerchant(id, true); draw(); drawSheet();
      });
    },
    export: exportCSV,
    savegoals: function () {
      var ins = Array.prototype.slice.call(root.querySelectorAll('.goal-in'));
      Promise.all(ins.map(function (i) { return sb.rpc('set_weekly_goal', { p_user: i.dataset.id, p_goal: Math.max(0, parseInt(i.value, 10) || 0) }); }))
        .then(function (rs) { if (rs.some(function (r) { return r.error; })) throw 0; toast('انحفظت الأهداف'); load(); }, function () { toast('تعذر حفظ الأهداف'); })
        .catch(function () { toast('تعذر حفظ الأهداف'); });
    },
    copylink: function () {
      var el = $('#crm-mylink'); if (!el) return;
      (navigator.clipboard ? navigator.clipboard.writeText(el.value) : Promise.reject()).then(function () { toast('انسخ الرابط'); }, function () { el.select(); document.execCommand('copy'); toast('انسخ الرابط'); });
    },
    close: closeSheet,
    create: function () {
      var row = readForm();
      if (!row.name) { $('#cm-err').textContent = 'اكتبي اسم المتجر.'; return; }
      run(async function () {
        var r = await sb.from('crm_merchants').insert(row).select().single();
        if (r.error) throw r.error;
        S.merchants.unshift(r.data); toast('انضاف التاجر'); S.sheet = { type: 'merchant', id: r.data.id };
        await loadMerchant(r.data.id, true); draw();
      });
    },
    save: function () {
      var row = readForm(), id = S.sheet.id;
      if (!row.name) { $('#cm-err').textContent = 'اكتبي اسم المتجر.'; return; }
      run(async function () {
        var r = await sb.from('crm_merchants').update(row).eq('id', id).select().single();
        if (r.error) throw r.error;
        S.merchants = S.merchants.map(function (m) { return m.id === id ? r.data : m; }); toast('انحفظت التعديلات'); draw();
      });
    },
    logact: function () {
      var id = S.sheet.id, sum = $('#ca-sum').value.trim(), type = $('#ca-type').value, nxt = fromDateInput($('#ca-next').value);
      if (!sum) { toast('اكتبي وش صار في التواصل.'); return; }
      run(async function () {
        var r = await sb.from('crm_activities').insert({ merchant_id: id, type: type, summary: sum });
        if (r.error) throw r.error;
        var m = merchant(id), upd = { next_follow_up_at: nxt };
        if (m && m.stage === 'lead' && type !== 'note') upd.stage = 'contacted';
        var u = await sb.from('crm_merchants').update(upd).eq('id', id).select().single();
        if (!u.error) S.merchants = S.merchants.map(function (x) { return x.id === id ? u.data : x; });
        await loadMerchant(id, true); toast('انحفظ التواصل'); draw();
      });
    },
    addtask: function () {
      var id = S.sheet.id, title = $('#ct-title').value.trim();
      if (!title) { toast('اكتبي عنوان المهمة.'); return; }
      var row = { merchant_id: id, title: title, due_at: fromDateInput($('#ct-due').value), assigned_to: full ? ($('#ct-who').value || null) : uid };
      run(async function () {
        var r = await sb.from('crm_tasks').insert(row); if (r.error) throw r.error;
        await loadMerchant(id, true); load();
      });
    },
    tdone: function (el) {
      var id = S.sheet.id, done = el.checked;
      run(async function () {
        var r = await sb.from('crm_tasks').update({ done: done }).eq('id', el.dataset.id); if (r.error) throw r.error;
        await loadMerchant(id, true); load();
      });
    },
    tdel: function (el) {
      var id = S.sheet.id;
      run(async function () {
        var r = await sb.from('crm_tasks').delete().eq('id', el.dataset.id); if (r.error) throw r.error;
        await loadMerchant(id, true); load();
      });
    },
    askdel: function () { S.confirm = true; drawSheet(); },
    nodel: function () { S.confirm = false; drawSheet(); },
    del: function () {
      var id = S.sheet.id;
      run(async function () {
        var r = await sb.from('crm_merchants').delete().eq('id', id); if (r.error) throw r.error;
        S.merchants = S.merchants.filter(function (m) { return m.id !== id; }); S.sheet = null; toast('انحذف التاجر'); draw();
      });
    },
    parse: async function () {
      var f = $('#ci-file').files[0], text = $('#ci-text').value;
      if (f) text = await f.text();
      if (!text.trim()) { toast('اختاري ملف أو الصقي البيانات.'); return; }
      S.importRows = parseCSV(text); drawSheet();
    },
    doimport: function () {
      var names = {}; S.merchants.forEach(function (m) { names[m.name.trim()] = 1; });
      var rows = S.importRows.rows.filter(function (r) { if (names[r.name]) return false; names[r.name] = 1; return true; });
      run(async function () {
        for (var i = 0; i < rows.length; i += 200) {
          var r = await sb.from('crm_merchants').insert(rows.slice(i, i + 200)); if (r.error) throw r.error;
        }
        toast('انضاف ' + rows.length + ' تاجر'); S.sheet = null; S.importRows = null; await load();
      });
    }
  };

  function onClick(e) {
    var el = e.target.closest && e.target.closest('[data-c]');
    if (!el || el.disabled) return;
    var f = C[el.dataset.c]; if (!f) return;
    if (el.type !== 'checkbox') e.preventDefault();
    f(el);
  }

  /* ---------- stage change from the select ---------- */
  function onChange(e) {
    if (e.target.id !== 'cm-stage' || !S.sheet) return;
    var id = S.sheet.id, stage = e.target.value, upd = { stage: stage };
    if (stage === 'lost') { var why = prompt('وش سبب خسارة التاجر؟ (اختياري)') || ''; upd.lost_reason = why; }
    run(async function () {
      var r = await sb.from('crm_merchants').update(upd).eq('id', id).select().single(); if (r.error) throw r.error;
      S.merchants = S.merchants.map(function (m) { return m.id === id ? r.data : m; });
      await loadMerchant(id, true); toast('صار التاجر: ' + STAGE[stage]); draw();
    });
  }

  /* ---------- wiring ---------- */
  function setup() {
    root = document.getElementById('crm');
    if (!root) return;
    sheetEl = document.createElement('div'); sheetEl.id = 'crm-sheet'; sheetEl.dir = 'rtl'; sheetEl.lang = 'ar'; sheetEl.hidden = true;
    document.body.appendChild(sheetEl);
    root.addEventListener('click', onClick); sheetEl.addEventListener('click', onClick);
    sheetEl.addEventListener('change', onChange);
    root.addEventListener('input', function (e) { if (e.target.id === 'crm-q') { S.q = e.target.value; drawList(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.sheet) closeSheet(); });
  }
  function auth() {
    var a = window.officeAuth; if (!a || sb) return;
    sb = a.sb; full = !!a.full; role = a.role || ''; uid = a.uid || ''; myName = a.name || '';
    if (root && !root.hidden && !S.loaded && !S.loading) { live(); draw(); load(); }
  }
  document.addEventListener('office:auth', auth);
  document.addEventListener('crm:open', function (e) {
    var id = e.detail; if (!id) return;
    function go() { if (merchant(id)) { openSheet({ type: 'merchant', id: id }); loadMerchant(id); } }
    if (S.loaded) { Promise.resolve(load()).then(go); } else { var n = 0, t = setInterval(function () { if (S.loaded || ++n > 40) { clearInterval(t); go(); } }, 250); }
  });
  document.addEventListener('office:view', function (e) {
    if (!root) setup();
    if (!root) return;
    var on = e.detail === 'crm';
    root.hidden = !on;
    if (!on) { if (S.sheet) closeSheet(); return; }
    auth();
    if (!sb) { root.innerHTML = '<div class="empty"><span class="spin"></span> نفتح العملاء…</div>'; return; }
    live();
    if (!S.loaded && !S.loading) { draw(); load(); }
  });
  /* the office may have rendered the CRM view before this file finished loading */
  if (document.readyState !== 'loading' && location.hash === '#crm') setTimeout(function () { document.dispatchEvent(new CustomEvent('office:view', { detail: 'crm' })); }, 0);
})();
