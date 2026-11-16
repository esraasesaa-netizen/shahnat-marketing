// /_blob/<id>  ->  a short-lived link to the attachment in Supabase Storage (private bucket "attachments").
// Only signed-in office members get the file: their session token comes in the ob_t cookie set by shim.js.
const SB = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

function cookie(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function deny(res, status) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>الملف غير متاح</title>' +
    '<body style="font-family:Tahoma,sans-serif;display:grid;place-items:center;min-height:90vh;color:#13213C">' +
    '<p>' + (status === 404 ? 'الملف غير موجود.' : 'الملف متاح لأعضاء المكتب فقط. سجّلي دخولك في المكتب وافتحيه من هناك.') + '</p></body></html>');
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!id || !SB) { deny(res, 404); return; }
  const token = cookie(req, 'ob_t');
  if (!token) { deny(res, 401); return; }
  try {
    const r = await fetch(SB + '/storage/v1/object/sign/attachments/' + encodeURIComponent(id), {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_ANON_KEY || '', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 300 })
    });
    if (!r.ok) { deny(res, r.status === 404 || r.status === 400 ? 404 : 401); return; }
    const j = await r.json();
    const url = j.signedURL || j.signedUrl;
    if (!url) { deny(res, 404); return; }
    res.statusCode = 302;
    res.setHeader('Location', SB + '/storage/v1' + (url.charAt(0) === '/' ? url : '/' + url));
    res.setHeader('Cache-Control', 'private, no-store');
    res.end();
  } catch (_) { deny(res, 502); }
};
