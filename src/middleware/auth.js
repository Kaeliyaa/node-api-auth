const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

module.exports = async (req, res, next) => {
  try {
    // Extract token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const tokenHash = hashToken(token);

    // Verify JWT signature and expiry
    const decoded = jwt.verify(tokenHash, process.env.JWT_SECRET);
    
    // Check token exists in sessions table and isn't expired
    const result = await pool.query(
      `SELECT * FROM sessions 
       WHERE token = $1 
       AND user_id = $2 
       AND expires_at > NOW()`,
      [tokenHash, decoded.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Session invalid or expired' });
    }

    // Attach user_id to request for downstream routes
    req.user = { user_id: decoded.user_id };

    next();

  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(err);
  }
};