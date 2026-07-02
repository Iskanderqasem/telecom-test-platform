function errorHandler(err, req, res, next) {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
}
function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}
module.exports = { errorHandler, notFound };
