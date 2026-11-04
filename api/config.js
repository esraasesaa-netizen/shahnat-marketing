// Public settings the browser needs (these two values are safe to expose).
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ url: process.env.SUPABASE_URL || '', anon: process.env.SUPABASE_ANON_KEY || '' });
};
