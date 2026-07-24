const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'zelo-dev-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'zelo-dev-refresh-change-me';

const generateToken = (user) => {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
};

const generateRefreshToken = (user) => {
  return jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '30d' });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = { generateToken, generateRefreshToken, verifyToken, verifyRefreshToken };
