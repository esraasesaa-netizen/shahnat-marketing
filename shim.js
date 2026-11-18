/* Shahnat marketing office: data, login and files through Supabase,
   and a small server function (/api/sample) for the team's work. */
(function () {
  'use strict';
  var LOGIN_DOMAIN = 'shahnat.team';            // "esraa" -> esraa@shahnat.team
  var MANAGER_ONLY = ['newtask', 'create', 'start', 'stop', 'approve', 'revise', 'reopen', 'deltask', 'rmatt', 'pickfile',
    'dellesson', 'savecompany', 'meetstart', 'meetstop', 'meetadd', 'meetnotes', 'tpl'];
  var CEO_ALLOWED = ['meetstart', 'meetstop', 'meetnotes'];   /* the executive director controls the meeting room only */
  var ROLE_NAME = { manager: 'مديرة المكتب', ceo: 'المدير التنفيذي', admin: 'الرئيس التنفيذي', marketer: 'مسوّق' };
  function isFull() { return !!profile && (profile.role === 'manager' || profile.role === 'admin'); }   /* full permissions */

  var sb = null, profile = null, authResolve;
  /* password recovery: the email link comes back as  /?reset=1#access_token=...&type=recovery  */
  var RAW_URL = location.search + '&' + location.hash.replace(/^#/, '');
  var RECOVERY = /(^|[?&])type=recovery(&|$)/.test(RAW_URL) || /(^|[?&])reset=1(&|$)/.test(RAW_URL);
  var LINK_ERR = /(^|[?&])error(_code)?=/.test(RAW_URL);
  var PUBLIC_ORIGIN = 'https://marketing.shahnat.net';
  /* recovery links always come back to marketing.shahnat.net; on the Vercel test link (or local testing)
     they come back to the same test address, so the flow can be tried before the DNS is ready */
  function resetRedirect() {
    var testHost = /\.vercel\.app$/.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    return (testHost ? location.origin : PUBLIC_ORIGIN) + '/?reset=1';
  }
  function cleanUrl() { history.replaceState(null, '', location.pathname); }
  var authReady = new Promise(function (r) { authResolve = r; });

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  async function token() { var s = (await sb.auth.getSession()).data.session; return s ? s.access_token : ''; }

  /* ---------------- login screen ---------------- */
  var css = document.createElement('style');
  css.textContent =
    '#gate{position:fixed;inset:0;z-index:999;background:var(--bg,#F2F4F9);display:grid;place-items:center;padding:24px;font-family:var(--body)}' +
    '#gate[hidden]{display:none}' +
    '#gate .door{position:relative;width:min(400px,100%);background:#fff;border:1px solid var(--line,#D8DEEA);border-top:4px solid var(--bright,#F85F22);border-radius:10px;padding:30px 24px 30px;box-shadow:0 10px 30px rgba(19,33,60,.08)}' +
    '#gate h1{font:700 26px/1.25 var(--display);margin:0 0 4px;color:var(--ink,#13213C)}' +
    '#gate p.sub{margin:0 0 22px;color:var(--muted,#56647F);font-size:14.5px}' +
    '#gate label{display:block;font-weight:700;font-size:14px;margin:14px 0 6px}' +
    '#gate input{width:100%;min-height:48px;border:1.5px solid var(--line,#D8DEEA);border-radius:4px;padding:0 12px;font:inherit;font-size:16px;background:#fff}' +
    '#gate input:focus{outline:none;border-color:var(--outline,#17294D);box-shadow:0 0 0 3px rgba(23,41,77,.15)}' +
    '#gate button{margin-top:22px;width:100%;min-height:50px;border:0;border-radius:4px;background:var(--navy,#17294D);color:#fff;font:700 16px var(--display);cursor:pointer}' +
    '#gate button:disabled{opacity:.6;cursor:wait}' +
    '#gate .msg{margin:14px 0 0;color:var(--bad,#B3261E);font-size:14px;min-height:1em}' +
    '#gate .msg.ok{color:var(--s-done,#17724B)}' +
    '#gate button.link{display:block;width:auto;margin-top:10px;min-height:36px;padding:2px 0;background:none;color:var(--accent-text,#B34505);text-decoration:underline;font:700 14px var(--body)}' +
    '.who{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--muted,#56647F);margin-top:6px;flex-wrap:wrap}' +
    '.who b{color:var(--ink,#13213C)}' +
    '.who button{border:0;background:none;color:var(--accent-text,#B34505);font:700 13.5px var(--body);cursor:pointer;padding:4px 0;text-decoration:underline}' +
    '.ro-note{margin:0 0 12px;padding:10px 14px;border:1.5px dashed var(--outline,#17294D);border-radius:4px;font-size:14px;color:var(--ink,#13213C)}' +
    MANAGER_ONLY.map(function (a) { return 'body.ro [data-act="' + a + '"]'; }).join(',') + '{display:none!important}' +
    MANAGER_ONLY.filter(function (a) { return CEO_ALLOWED.indexOf(a) < 0; }).map(function (a) { return 'body.ro-ceo [data-act="' + a + '"]'; }).join(',') + '{display:none!important}' +
    'body.ro #file-in,body.ro .block p.err,body.ro .nudge{display:none!important}' +
    'body.ro #view textarea,body.ro #sheet textarea{pointer-events:none;background:var(--soft,#E8ECF4)}';
  document.head.appendChild(css);

  var gate = document.createElement('div');
  gate.id = 'gate'; gate.dir = 'rtl'; gate.lang = 'ar';
  var mode = 'login';
  var FORMS = {
    login:
      '<form class="door" data-mode="login" autocomplete="on">' +
      '<img src="/logo.jpg" alt="شحنات" style="display:block;max-width:230px;max-height:90px;margin:0 auto 14px"><h1 style="font-size:21px;text-align:center">المكتب التسويقي لمنصة شحنات</h1><p class="sub" style="text-align:center">حيّاك الله، الدخول باسم المستخدم وكلمة المرور.</p>' +
      '<label for="g-user">اسم المستخدم</label><input id="g-user" name="username" autocomplete="username" required dir="ltr">' +
      '<label for="g-pass">كلمة المرور</label><input id="g-pass" name="password" type="password" autocomplete="current-password" required dir="ltr">' +
      '<button type="button" class="link" data-go="forgot">نسيت كلمة المرور؟</button>' +
      '<button type="submit">دخول</button>' +
      '<p class="msg" id="g-msg" role="alert"></p></form>',
    forgot:
      '<form class="door" data-mode="forgot">' +
      '<h1>استعادة كلمة المرور</h1><p class="sub">الإيميل المسجّل في المكتب، وبيوصل عليه رابط لتعيين كلمة مرور جديدة.</p>' +
      '<label for="g-email">الإيميل</label><input id="g-email" type="email" autocomplete="email" required dir="ltr">' +
      '<button type="submit">أرسل الرابط</button>' +
      '<button type="button" class="link" data-go="login">رجوع لتسجيل الدخول</button>' +
      '<p class="msg" id="g-msg" role="alert"></p></form>',
    reset:
      '<form class="door" data-mode="reset" novalidate>' +
      '<h1>كلمة مرور جديدة</h1><p class="sub">كلمة مرور جديدة من 8 أحرف على الأقل.</p>' +
      '<label for="g-new">كلمة المرور الجديدة</label><input id="g-new" type="password" autocomplete="new-password" minlength="8" required dir="ltr">' +
      '<label for="g-new2">تأكيد كلمة المرور</label><input id="g-new2" type="password" autocomplete="new-password" minlength="8" required dir="ltr">' +
      '<button type="submit">حفظ كلمة المرور</button>' +
      '<p class="msg" id="g-msg" role="alert"></p></form>'
  };
  function setMode(m, msg, ok) {
    mode = m; gate.innerHTML = FORMS[m];
    if (!gate.parentNode) document.body.appendChild(gate);
    gate.hidden = false;
    var el = document.getElementById('g-msg'); el.textContent = msg || ''; el.className = 'msg' + (ok ? ' ok' : '');
    var first = gate.querySelector('input'); if (first) first.focus();
  }
  function showGate(msg) { setMode('login', msg); }
  function lockMsg(until) {
    var mins = Math.max(1, Math.ceil((new Date(until) - Date.now()) / 60000));
    return 'الدخول مقفل مؤقتاً بعد 3 محاولات خاطئة. المحاولة متاحة بعد ' + mins + ' دقيقة، أو عن طريق «نسيت كلمة المرور؟».';
  }
  /* attachments are private: /_blob/<id> needs the signed-in user's token, kept in a cookie limited to that path */
  function blobCookie(session) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = session ? 'ob_t=' + session.access_token + '; Path=/_blob; Max-Age=3600; SameSite=Strict' + secure
                              : 'ob_t=; Path=/_blob; Max-Age=0; SameSite=Strict' + secure;
  }
  gate.addEventListener('click', function (e) {
    var go = e.target.closest && e.target.closest('[data-go]');
    if (go) { e.preventDefault(); setMode(go.dataset.go); }
  });
  gate.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var btn = gate.querySelector('button[type=submit]'), msg = document.getElementById('g-msg');
    function say(t, ok) { msg.textContent = t; msg.className = 'msg' + (ok ? ' ok' : ''); }
    if (!sb) { say('الإعدادات لم تكتمل بعد.'); return; }
    btn.disabled = true; say('');
    try {
      if (mode === 'login') {
        var u = document.getElementById('g-user').value.trim(), p = document.getElementById('g-pass').value;
        var email = u.indexOf('@') >= 0 ? u : u.toLowerCase() + '@' + LOGIN_DOMAIN;
        var lock = await sb.rpc('login_status', { p_email: email });
        if (lock.data) { say(lockMsg(lock.data)); return; }
        var r = await sb.auth.signInWithPassword({ email: email, password: p });
        if (r.error) {
          if (/rate|too many/i.test(r.error.message || '')) { say('محاولات كثيرة. الدخول متاح بعد دقائق.'); return; }
          var f = await sb.rpc('login_failed', { p_email: email });
          say(f.data ? lockMsg(f.data) : 'اسم المستخدم أو كلمة المرور غير صحيحة.');
          return;
        }
        sb.rpc('login_ok').then(function () {}, function () {});
        afterLogin(r.data.session);
      } else if (mode === 'forgot') {
        var em = document.getElementById('g-email').value.trim();
        var f = await sb.auth.resetPasswordForEmail(em, { redirectTo: resetRedirect() });
        if (f.error && /rate|limit|seconds/i.test(f.error.message || '')) { say('انرسل رابط قبل قليل. الطلب الجديد يكون متاح بعد دقيقة.'); return; }
        say('إذا كان الإيميل مسجّل عندنا، بيوصل رابط الاستعادة خلال دقائق. يفضّل التأكد من مجلد الرسائل غير المرغوبة.', true);
      } else if (mode === 'reset') {
        var a1 = document.getElementById('g-new').value, a2 = document.getElementById('g-new2').value;
        if (a1.length < 8) { say('كلمة المرور لازم تكون 8 أحرف على الأقل.'); return; }
        if (a1 !== a2) { say('كلمتا المرور غير متطابقتين.'); return; }
        var up = await sb.auth.updateUser({ password: a1 });
        if (up.error) {
          var m = up.error.message || '';
          say(/different|same/i.test(m) ? 'كلمة المرور الجديدة لازم تختلف عن القديمة.' :
              /session|expired|jwt/i.test(m) ? 'انتهت صلاحية الرابط. يلزم طلب رابط جديد من «نسيت كلمة المرور؟».' : 'تعذر حفظ كلمة المرور، والمحاولة مرة ثانية ممكنة.');
          return;
        }
        await sb.auth.signOut();
        cleanUrl();
        setMode('login', 'تم تغيير كلمة المرور. الدخول الآن بكلمة المرور الجديدة.', true);
      }
    } finally { btn.disabled = false; }
  });

  async function afterLogin(session) {
    var r = await sb.from('profiles').select('role,name').eq('id', session.user.id).maybeSingle();
    if (r.error || !r.data) {
      await sb.auth.signOut();
      showGate('هذا الحساب غير مضاف للمكتب، والإضافة تكون عن طريق مديرة المكتب.');
      return;
    }
    profile = r.data;
    blobCookie(session);
    gate.hidden = true;
    if (profile.role === 'ceo') document.body.classList.add('ro-ceo');
    else if (!isFull()) document.body.classList.add('ro');
    var top = document.querySelector('.top .brand > div:last-child');
    if (top && !document.getElementById('who')) {
      var w = document.createElement('div'); w.className = 'who'; w.id = 'who';
      w.innerHTML = '<span><b>' + esc(profile.name || session.user.email) + '</b>، ' + esc(ROLE_NAME[profile.role] || '') + '</span>' +
        '<button type="button" id="logout">خروج</button>';
      top.appendChild(w);
      document.getElementById('logout').onclick = async function () { blobCookie(null); await sb.auth.signOut(); location.reload(); };
    }
    window.officeAuth = { sb: sb, profile: profile, uid: session.user.id, full: isFull(), role: profile.role, name: profile.name || '' };   /* used by crm.js */
    document.dispatchEvent(new CustomEvent('office:auth'));
    authResolve();
  }

  /* read-only roles: block every action that changes data */
  document.addEventListener('click', function (e) {
    if (!profile || isFull()) return;
    var el = e.target.closest && e.target.closest('[data-act]');
    if (el && MANAGER_ONLY.indexOf(el.dataset.act) >= 0 && !(profile.role === 'ceo' && CEO_ALLOWED.indexOf(el.dataset.act) >= 0)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  /* ---------------- db (Firestore-like API on one Supabase table) ---------------- */
  var colL = {}, docL = {}, timers = {}, live = false;
  function snapDoc(row) { return { id: row.path.split('/').slice(1).join('/'), exists: true, data: function () { return row.data || {}; } }; }
  async function pushCollection(name) {
    var ls = colL[name]; if (!ls || !ls.length) return;
    var r = await sb.from('docs').select('path,data').eq('collection', name);
    if (r.error) { ls.forEach(function (l) { l.err && l.err(r.error); }); return; }
    var snap = { docs: r.data.map(snapDoc), size: r.data.length, empty: !r.data.length };
    ls.forEach(function (l) { try { l.cb(snap); } catch (x) { console.error(x); } });
  }
  async function pushDoc(path) {
    var ls = docL[path]; if (!ls || !ls.length) return;
    var r = await sb.from('docs').select('path,data').eq('path', path).maybeSingle();
    if (r.error) { ls.forEach(function (l) { l.err && l.err(r.error); }); return; }
    var snap = r.data ? snapDoc(r.data) : { id: path.split('/').slice(1).join('/'), exists: false, data: function () { return undefined; } };
    ls.forEach(function (l) { try { l.cb(snap); } catch (x) { console.error(x); } });
  }
  function changed(path) {
    var c = path.split('/')[0];
    clearTimeout(timers[c]); timers[c] = setTimeout(function () { pushCollection(c); }, 120);
    clearTimeout(timers[path]); timers[path] = setTimeout(function () { pushDoc(path); }, 120);
  }
  function goLive() {
    if (live) return; live = true;
    sb.channel('office-docs').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, function (p) {
      var path = (p.new && p.new.path) || (p.old && p.old.path);
      if (path) changed(path);
      else { Object.keys(colL).forEach(pushCollection); Object.keys(docL).forEach(pushDoc); }
    }).subscribe();
  }
  function stamp() { return new Date().toISOString(); }
  function docRef(path) {
    var coll = path.split('/')[0];
    return {
      id: path.split('/').slice(1).join('/'), path: path,
      set: async function (data) {
        var r = await sb.from('docs').upsert({ path: path, collection: coll, data: data || {}, updated_at: stamp() });
        if (r.error) throw r.error; changed(path);
      },
      update: async function (data) {
        var cur = await sb.from('docs').select('data').eq('path', path).maybeSingle();
        if (cur.error) throw cur.error;
        if (!cur.data) throw { code: 'not_found' };
        var r = await sb.from('docs').update({ data: Object.assign({}, cur.data.data || {}, data || {}), updated_at: stamp() }).eq('path', path);
        if (r.error) throw r.error; changed(path);
      },
      delete: async function () { var r = await sb.from('docs').delete().eq('path', path); if (r.error) throw r.error; changed(path); },
      onSnapshot: function (cb, err) {
        var l = { cb: cb, err: err }; (docL[path] = docL[path] || []).push(l); pushDoc(path);
        return function () { docL[path] = (docL[path] || []).filter(function (x) { return x !== l; }); };
      }
    };
  }
  var db = {
    doc: docRef,
    collection: function (name) {
      return {
        doc: function (id) { return docRef(name + '/' + (id || uid())); },
        onSnapshot: function (cb, err) {
          var l = { cb: cb, err: err }; (colL[name] = colL[name] || []).push(l); pushCollection(name);
          return function () { colL[name] = (colL[name] || []).filter(function (x) { return x !== l; }); };
        }
      };
    }
  };

  /* ---------------- sample (AI employees through /api/sample) ---------------- */
  async function post(body, signal) {
    var res;
    try {
      res = await fetch('/api/sample', { method: 'POST', signal: signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await token()) }, body: JSON.stringify(body) });
    } catch (e) { throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'network' }; }
    if (!res.ok) { var j = {}; try { j = await res.json(); } catch (_) {} throw { code: j.code || 'error' }; }
    return res;
  }
  async function sample(prompt, opts) {
    opts = opts || {};
    var res = await post({ prompt: String(prompt) }, opts.signal);
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', text = '', truncated = false, bad = null;
    try {
      for (;;) {
        var x = await reader.read(); if (x.done) break;
        buf += dec.decode(x.value, { stream: true });
        var lines = buf.split('\n'); buf = lines.pop();
        lines.forEach(function (line) {
          if (!line.trim()) return; var m; try { m = JSON.parse(line); } catch (_) { return; }
          if (m.d) { text += m.d; if (opts.onText) opts.onText({ text: text }); }
          if (m.done) truncated = !!m.truncated;
          if (m.error) bad = m.error;
        });
      }
    } catch (e) { throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'network' }; }
    if (bad) throw { code: bad };
    if (!text.trim()) throw { code: 'empty_completion' };
    return { text: text, truncated: truncated };
  }
  sample.json = async function (prompt, opts) {
    var res = await post({ prompt: String(prompt), json: true }, (opts || {}).signal);
    var j = await res.json();
    return j.data;
  };

  /* ---------------- assets (task attachments in Supabase Storage) ---------------- */
  var assets = {
    upload: async function (file, opt) {
      if (file.size > 20 * 1024 * 1024) throw { code: 'too_large' };
      var ext = ((file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)) || 'bin';
      var id = uid() + '.' + ext, type = (opt && opt.type) || file.type || 'application/octet-stream';
      var r = await sb.storage.from('attachments').upload(id, file, { contentType: type, upsert: false });
      if (r.error) throw { code: 'upload_failed' };
      return { id: id, contentType: type, sizeBytes: file.size };
    },
    delete: async function (id) { await sb.storage.from('attachments').remove([id]); }
  };

  /* ---------------- the window.claude.use bridge the office code expects ---------------- */
  window.claude = {
    use: async function (name) {
      await authReady;
      if (name === 'db') { goLive(); return db; }
      if (name === 'user') return { role: profile.role, canEdit: function () { return isFull(); }, isOwner: function () { return isFull(); } };
      if (name === 'sample' && profile.role === 'ceo') return sample;   /* the weekly meeting only; the server enforces it */
      if (!isFull()) throw { code: 'not_granted' };
      if (name === 'sample') return sample;
      if (name === 'assets') return assets;
      throw { code: 'unknown_service' };
    }
  };

  /* ---------------- boot ---------------- */
  (async function () {
    var cfg = {};
    try { cfg = await (await fetch('/api/config', { cache: 'no-store' })).json(); } catch (_) {}
    if (document.readyState === 'loading') await new Promise(function (r) { document.addEventListener('DOMContentLoaded', r); });
    if (!cfg.url || !cfg.anon || !window.supabase) { showGate('الإعدادات ناقصة: أضيفي SUPABASE_URL و SUPABASE_ANON_KEY في Vercel.'); return; }
    sb = window.supabase.createClient(cfg.url, cfg.anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
    var recoveryShown = false;
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'TOKEN_REFRESHED' && session && profile) blobCookie(session);
      if (event === 'SIGNED_OUT') blobCookie(null);
      if (event === 'PASSWORD_RECOVERY' && !recoveryShown) { recoveryShown = true; setMode('reset'); }
    });
    if (LINK_ERR) {
      cleanUrl();
      setMode('forgot', 'رابط الاستعادة منتهي أو مستخدم من قبل. يلزم طلب رابط جديد.');
      return;
    }
    if (RECOVERY) {
      var qs = new URLSearchParams(location.search), th = qs.get('token_hash'), code = qs.get('code'), vr = null;
      if (th) vr = await sb.auth.verifyOtp({ token_hash: th, type: 'recovery' });
      else if (code) vr = await sb.auth.exchangeCodeForSession(code);
      if (vr && vr.error) { cleanUrl(); setMode('forgot', 'رابط الاستعادة منتهي أو مستخدم من قبل. يلزم طلب رابط جديد.'); return; }
    }
    var s = (await sb.auth.getSession()).data.session;
    if (RECOVERY) {
      if (s) { if (!recoveryShown) { recoveryShown = true; setMode('reset'); } }
      else if (!recoveryShown) setMode('forgot', 'رابط الاستعادة غير صالح. يلزم طلب رابط جديد.');
      return;                        // never open the office from a recovery link
    }
    if (s) afterLogin(s); else showGate('');
  })();
})();
