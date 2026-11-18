// POST /api/lead : the "start shipping with Shahnat" form on shahnat.net sends here.
// The lead lands in the CRM (crm_public_lead does the checks, de-duplication and assignment).
const SB = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const ANON = (process.env.SUPABASE_ANON_KEY || '').trim();
const ALLOWED = ['https://shahnat.net', 'https://www.shahnat.net', 'https://marketing.shahnat.net'];

// best-effort limit per visitor: 5 sends per 10 minutes on the same server instance
const hits = new Map();
function tooMany(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(function (t) { return now - t < win; });
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}
function str(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n); }

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (ALLOWED.indexOf(origin) >= 0) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, code: 'method' }); return; }
  if (origin && ALLOWED.indexOf(origin) < 0) { res.status(403).json({ ok: false, code: 'origin' }); return; }
  if (!SB || !ANON) { res.status(500).json({ ok: false, code: 'config' }); return; }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = null; } }
  if (!b || typeof b !== 'object') { res.status(400).json({ ok: false, code: 'body' }); return; }

  // bots: the hidden field must stay empty, and a person takes more than 3 seconds to fill the form
  if (str(b.website, 200) || (Number(b.t) && Number(b.t) < 3000)) { res.status(200).json({ ok: true }); return; }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) { res.status(429).json({ ok: false, code: 'busy' }); return; }

  try {
    const r = await fetch(SB + '/rest/v1/rpc/crm_public_lead', {
      method: 'POST',
      headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_store: str(b.store, 120), p_name: str(b.name, 80), p_phone: str(b.phone, 30), p_city: str(b.city, 60),
        p_kind: str(b.kind, 60), p_volume: str(b.volume, 30), p_message: str(b.message, 1000),
        p_ref: str(b.ref, 40), p_page: str(b.page, 200)
      })
    });
    const code = r.ok ? await r.json() : 'error';
    if (code === 'ok') { res.status(200).json({ ok: true }); return; }
    res.status(code === 'busy' ? 429 : 400).json({ ok: false, code: String(code) });
  } catch (_) {
    res.status(502).json({ ok: false, code: 'error' });
  }
};
