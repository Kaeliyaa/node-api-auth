const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const stripe = require('../services/stripe');
const { verifySessionOwnership } = require('../services/ownership');

const router = express.Router();

router.use(authMiddleware);

/**
 * @swagger
 * /purchases:
 *   get:
 *     tags: [Purchases]
 *     summary: List current user's purchases
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Array of purchase objects }
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM purchases WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.user_id]
    );
    res.json(result.rows);  
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /purchases/{id}:
 *   get:
 *     tags: [Purchases]
 *     summary: Get a single purchase
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200: { description: Purchase object }
 *       404: { description: Purchase not found }
 */
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM purchases WHERE purchase_id = $1 AND user_id = $2`,
      [req.params.id, req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /purchases/checkout:
 *   post:
 *     tags: [Purchases]
 *     summary: Create a Stripe PaymentIntent and a pending purchase record
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [session_id, amount]
 *             properties:
 *               session_id: { type: string }
 *               amount: { type: number }
 *     responses:
 *       201: { description: Returns purchase object and Stripe client_secret }
 *       400: { description: Validation error }
 *       404: { description: Session not found }
 */
router.post('/checkout', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { session_id, amount } = req.body;

    if (!session_id || !amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'session_id and a positive amount are required' });
    }

    const owns = await verifySessionOwnership(session_id, req.user.user_id);
    if (!owns) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Create the PaymentIntent with Stripe — this is the source of truth
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe uses cents
      currency: 'usd',
      metadata: {
        user_id: req.user.user_id,
        session_id
      }
    });

    // Transaction: insert purchase row tied to this PaymentIntent
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO purchases (user_id, session_id, stripe_payment_intent_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [req.user.user_id, session_id, paymentIntent.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      purchase: result.rows[0],
      client_secret: paymentIntent.client_secret // frontend needs this to confirm payment
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;