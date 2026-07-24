const pool = require('../config/db');
const { verifyToken } = require('../utils/jwt');
const { calculateAge } = require('../utils/password');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const result = await pool.query(
      'SELECT id, phone, email, role, status FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    if (user.status === 'suspended' || user.status === 'blocked') {
      return res.status(403).json({ error: 'Account is suspended' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// Minimum age enforced platform-wide; motorized drivers get a stricter check
// at the driver-routes layer since licensing law requires it specifically for them.
const ageVerificationMiddleware = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const result = await pool.query('SELECT date_of_birth FROM users WHERE id = $1', [req.user.id]);

  if (result.rows.length === 0 || !result.rows[0].date_of_birth) {
    return res.status(403).json({
      error: 'Age verification required',
      message: 'Please provide your date of birth to continue',
    });
  }

  const age = calculateAge(result.rows[0].date_of_birth);
  const minAge = parseInt(process.env.MIN_DRIVER_AGE_BICYCLE || '17');
  if (age < minAge) {
    return res.status(403).json({
      error: 'Age restriction',
      message: `You must be at least ${minAge} years old to use this platform`,
    });
  }

  next();
};

const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role,
      });
    }
    next();
  };
};

module.exports = { authMiddleware, ageVerificationMiddleware, roleMiddleware };
