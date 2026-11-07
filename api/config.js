// Public settings the browser needs (these two values are safe to expose).
module.exports = (req, res) => {
  const url = (process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/+$/, '');
  const anon = (process.env.SUPABASE_ANON_KEY || '').trim();
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ url, anon });
};
