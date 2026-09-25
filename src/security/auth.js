const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PASSWORD_ROUNDS = 12;
const TOKEN_EXPIRES_IN = '1h';

function hashPassword(password) {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function createToken(user) {
  const jwtSecret = process.env.JWT_SECRET || 'development-only-jwt-secret';
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
    },
    jwtSecret,
    {
      expiresIn: TOKEN_EXPIRES_IN,
      issuer: 'ramz-al-ibdaa',
      audience: 'ramz-al-ibdaa-users',
    },
  );
}

function verifyToken(token) {
  const jwtSecret = process.env.JWT_SECRET || 'development-only-jwt-secret';
  return jwt.verify(token, jwtSecret, {
    issuer: 'ramz-al-ibdaa',
    audience: 'ramz-al-ibdaa-users',
  });
}

function generateOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

module.exports = {
  createToken,
  generateOtpCode,
  hashPassword,
  verifyPassword,
  verifyToken,
};
