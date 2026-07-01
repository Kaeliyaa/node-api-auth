const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const { verifySessionOwnership } = require('../services/ownership');

const router = express.Router();

router.use(authMiddleware);

/**
 * @swagger
 * /results/{sessionId}:
 *   get:
 *     tags: [Results]
 *     summary: List all results for a session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of result objects }
 *       404: { description: Session not found }
 */
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

/**
 * @swagger
 * /results/{sessionId}:
 *   post:
 *     tags: [Results]
 *     summary: Add a named numerical result to a session (max 50 per session)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, value]
 *             properties:
 *               name: { type: string }
 *               value: { type: number }
 *     responses:
 *       201: { description: Result created }
 *       400: { description: Validation error or 50-result cap reached }
 *       404: { description: Session not found }
 */
router.post('/:sessionId', async (req, res, next) => {
  try {
    const { name, value } = req.body;

    if (!name || value === undefined) {
      return res.status(400).json({ error: 'Name and value are required' });
    }

    if (typeof value !== 'number' || isNaN(value)) {
      return res.status(400).json({ error: 'Value must be a number' });
    }

    if (name.length > 100) {
        return res.status(400).json({ error: 'Name must be 100 characters or fewer' });
    }

    if (Math.abs(value) > 1e15) {
        return res.status(400).json({ error: 'Value out of acceptable range' });
    }
    
    const owns = await verifySessionOwnership(req.params.sessionId, req.user.user_id);
    if (!owns) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const insertResult = await pool.query(
      `INSERT INTO results (session_id, name, value)
       VALUES ($1, $2, $3)
       RETURNING result_id, name, value, created_at`,
      [req.params.sessionId, name, value]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    if (err.message.includes('Maximum of 50 results')) {
      return res.status(400).json({ error: 'Maximum of 50 results per session reached' });
    }
    next(err);
  }
});

/**
 * @swagger
 * /results/{sessionId}/{resultId}:
 *   delete:
 *     tags: [Results]
 *     summary: Delete a specific result
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: resultId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Result deleted }
 *       404: { description: Session or result not found }
 */
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