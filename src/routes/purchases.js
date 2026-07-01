const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const stripe = require('../services/stripe');
const { verifySessionOwnership } = require('../services/ownership');

const router = express.Router();

router.use(authMiddleware);

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

// POST /purchases/checkout — creates a real Stripe PaymentIntent
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