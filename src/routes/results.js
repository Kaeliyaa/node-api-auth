const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// Helper — confirms a session belongs to the logged-in user
async function verifySessionOwnership(sessionId, userId) {
  const result = await pool.query(
    'SELECT session_id FROM sessions WHERE session_id = $1 AND user_id = $2',
    [sessionId, userId]
  );
  return result.rows.length > 0;
}

// GET /results/:sessionId — list all results for a session
router.get('/:sessionId', async (req, res, next) => {
  try {
    const owns = await verifySessionOwnership(req.params.sessionId, req.user.user_id);
    if (!owns) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await pool.query(
      `SELECT result_id, name, value, created_at
       FROM results
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [req.params.sessionId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /results/:sessionId — add a new result, enforcing 50-per-session cap
router.post('/:sessionId', async (req, res, next) => {
  try {
    const { name, value } = req.body;

    if (!name || value === undefined) {
      return res.status(400).json({ error: 'Name and value are required' });
    }

    if (typeof value !== 'number' || isNaN(value)) {
      return res.status(400).json({ error: 'Value must be a number' });
    }

    const owns = await verifySessionOwnership(req.params.sessionId, req.user.user_id);
    if (!owns) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Enforce max 50 results per session
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM results WHERE session_id = $1',
      [req.params.sessionId]
    );

    if (parseInt(countResult.rows[0].count, 10) >= 50) {
      return res.status(400).json({ error: 'Maximum of 50 results per session reached' });
    }

    const insertResult = await pool.query(
      `INSERT INTO results (session_id, name, value)
       VALUES ($1, $2, $3)
       RETURNING result_id, name, value, created_at`,
      [req.params.sessionId, name, value]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /results/:sessionId/:resultId
router.delete('/:sessionId/:resultId', async (req, res, next) => {
  try {
    const owns = await verifySessionOwnership(req.params.sessionId, req.user.user_id);
    if (!owns) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const deleteResult = await pool.query(
      `DELETE FROM results
       WHERE result_id = $1 AND session_id = $2
       RETURNING result_id`,
      [req.params.resultId, req.params.sessionId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Result not found' });
    }

    res.json({ message: 'Result deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;