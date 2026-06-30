const crypto = require('crypto');

module.exports - function hashToken(token) {
  return crypto.
  createHash('sha256').
  update(token).
  digest('hex');
}