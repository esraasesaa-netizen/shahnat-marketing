// /_blob/<id>  ->  the attachment file in Supabase Storage (bucket "attachments").
module.exports = (req, res) => {
  const id = String((req.query && req.query.id) || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!id || !process.env.SUPABASE_URL) { res.status(404).end(); return; }
  res.statusCode = 302;
  res.setHeader('Location', process.env.SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') + '/storage/v1/object/public/attachments/' + id);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end();
};
