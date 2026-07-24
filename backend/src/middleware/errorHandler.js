// Centralized error handler - keep this mounted last, after all routes.
const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error:', err);

  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with this value already exists' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
};

module.exports = { errorHandler, notFoundHandler };
