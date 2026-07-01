const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes here require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /sessions:
 *   get:
 *     tags: [Sessions]
 *     summary: List current user's active sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Array of session objects }
 */
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

/**
 * @swagger
 * /sessions/{id}:
 *   delete:
 *     tags: [Sessions]
 *     summary: Revoke a specific session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Session revoked }
 *       404: { description: Session not found }
 */
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