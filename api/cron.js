// Morning runner (Vercel Cron). Runs the scheduled tasks whose delivery time has passed,
// so the deliverables are waiting for the manager even when the page is closed.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const SB = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const dueAt = d => new Date(d.due + 'T' + (d.dueTime || '08:00') + ':00+03:00');   // Riyadh time

async function save(path, collection, data) {
  const r = await fetch(SB + '/rest/v1/docs?on_conflict=path', { method: 'POST',
    headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({ path, collection, data, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error('save ' + r.status);
}
async function runOne(row) {
  const d = row.data, id = row.path.split('/')[1];
  await save(row.path, 'tasks', Object.assign({}, d, { status: 'doing', updatedAt: new Date().toISOString() }));
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: d.prompt }] }) });
    if (!r.ok) throw new Error('anthropic ' + r.status);
    const j = await r.json();
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!text.trim()) throw new Error('empty');
    const now = new Date().toISOString();
    await save(row.path, 'tasks', Object.assign({}, d, { status: 'review', output: text, truncated: j.stop_reason === 'max_tokens', lastRunAt: now, updatedAt: now }));
    const aid = require('crypto').randomUUID().replace(/-/g, '');
    await save('alerts/' + aid, 'alerts', { type: 'task_ready', ref: id, text: (d.empName || 'الموظف') + ' سلّم: ' + d.title, at: now, read: false });
    return true;
  } catch (e) {
    await save(row.path, 'tasks', Object.assign({}, d, { status: 'new', updatedAt: new Date().toISOString() })).catch(() => {});
    return false;
  }
}
module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (!SB || !KEY || !process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'missing env' }); return; }
  const q = 'docs?select=path,data&collection=eq.tasks&' + encodeURIComponent('data->>status') + '=eq.new&' + encodeURIComponent('data->>auto') + '=eq.true';
  const r = await fetch(SB + '/rest/v1/' + q, { headers: H });
  if (!r.ok) { res.status(502).json({ error: 'db' }); return; }
  const rows = (await r.json()).filter(x => x.data && x.data.prompt && x.data.due && dueAt(x.data) <= new Date())
    .sort((a, b) => dueAt(a.data) - dueAt(b.data)).slice(0, 5);
  const out = await Promise.all(rows.map(runOne));
  res.status(200).json({ ran: out.filter(Boolean).length, failed: out.filter(x => !x).length });
};
