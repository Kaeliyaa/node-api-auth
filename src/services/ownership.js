const pool = require('../db/pool');

async function verifySessionOwnership(sessionId, userId) {
  const result = await pool.query(
    'SELECT session_id FROM sessions WHERE session_id = $1 AND user_id = $2',
    [sessionId, userId]
  );
  return result.rows.length > 0;
}

module.exports = { verifySessionOwnership };