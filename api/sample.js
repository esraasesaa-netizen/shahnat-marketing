// Runs the AI employees. The Anthropic key stays on the server; only the office manager can run tasks.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');

async function roleOf(token) {
  const h = { apikey: process.env.SUPABASE_ANON_KEY || '', Authorization: 'Bearer ' + token };
  const u = await fetch(SB + '/auth/v1/user', { headers: h });
  if (!u.ok) return null;
  const user = await u.json();
  const p = await fetch(SB + '/rest/v1/profiles?select=role&id=eq.' + encodeURIComponent(user.id), { headers: h });
  if (!p.ok) return null;
  const rows = await p.json();
  return rows[0] ? rows[0].role : null;
}
function codeFor(status) {
  if (status === 429 || status === 529) return 'rate_limited';
  if (status === 401 || status === 403) return 'sampling_disabled';
  if (status === 413) return 'prompt_too_large';
  return 'error';
}
function parseJSON(t) {
  t = String(t || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) {} }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ code: 'error' }); return; }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !SB) { res.status(401).json({ code: 'session_expired' }); return; }
  const role = await roleOf(token).catch(() => null);
  if (!role) { res.status(401).json({ code: 'session_expired' }); return; }
  if (role !== 'manager') { res.status(403).json({ code: 'not_granted' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ code: 'sampling_disabled' }); return; }

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const prompt = String(body.prompt || '');
  if (!prompt.trim()) { res.status(400).json({ code: 'empty_completion' }); return; }
  if (prompt.length > 150000) { res.status(413).json({ code: 'prompt_too_large' }); return; }

  const headers = { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };

  if (body.json) {   // weekly meeting: one JSON answer
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify({
      model: MODEL, max_tokens: 4000,
      system: 'أعد JSON صالحاً فقط، بدون أي نص قبله أو بعده، وبدون علامات ```.',
      messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) { res.status(502).json({ code: codeFor(r.status) }); return; }
    const j = await r.json();
    const data = parseJSON((j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
    if (!data) { res.status(502).json({ code: 'invalid_json' }); return; }
    res.status(200).json({ data });
    return;
  }

  // task delivery: stream the text back as it is written
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify({
    model: MODEL, max_tokens: 8000, stream: true, messages: [{ role: 'user', content: prompt }] }) });
  if (!r.ok || !r.body) { res.status(502).json({ code: codeFor(r.status) }); return; }
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const evt = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = evt.split('\n').find(l => l.startsWith('data:'));
        if (!line) continue;
        let m; try { m = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
        if (m.type === 'content_block_delta' && m.delta && m.delta.type === 'text_delta') res.write(JSON.stringify({ d: m.delta.text }) + '\n');
        else if (m.type === 'message_delta' && m.delta && m.delta.stop_reason === 'max_tokens') truncated = true;
        else if (m.type === 'error') res.write(JSON.stringify({ error: 'error' }) + '\n');
      }
    }
    res.write(JSON.stringify({ done: true, truncated }) + '\n');
  } catch (_) {
    res.write(JSON.stringify({ error: 'network' }) + '\n');
  }
  res.end();
};
