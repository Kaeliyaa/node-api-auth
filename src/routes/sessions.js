const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes here require authentication
router.use(authMiddleware);

// GET /sessions — list current user's sessions
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT session_id, expires_at, created_at
       FROM sessions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.user_id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// DELETE /sessions/:id — revoke a specific session (e.g. "log out other device")
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM sessions
       WHERE session_id = $1 AND user_id = $2
       RETURNING session_id`,
      [req.params.id, req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ message: 'Session revoked' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;