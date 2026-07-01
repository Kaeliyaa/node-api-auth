const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const hashToken = require('../utils/hashToken');
const { sendResetEmail } = require('../services/mailer');

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       201: { description: User created, returns user object and JWT }
 *       400: { description: Validation error }
 *       409: { description: Email already in use }
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email: rawEmail, password } = req.body;
    const email = rawEmail?.trim().toLowerCase();
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already exists
    const existing = await pool.query(
      'SELECT user_id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING user_id, email, created_at`,
      [email.toLowerCase(), password_hash]
    );

    const user = result.rows[0];

    // Issue JWT
    const token = jwt.sign(
      { user_id: user.user_id},
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({ user, token });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and receive a JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Returns user object and JWT }
 *       401: { description: Invalid credentials }
 */
router.post('/login', async (req, res, next) => {
    try {
      const { email: rawEmail, password } = req.body;
      const email = rawEmail?.trim().toLowerCase();
  
      // Validate input
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
  
      // Find user
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
  
      const user = result.rows[0];
  
      // Use same error message for both cases — don't leak which one failed
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
  
      // Create session
      const token = jwt.sign(
        { user_id: user.user_id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      await pool.query(
        `INSERT INTO sessions (user_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [user.user_id, tokenHash, expiresAt]
      );
  
      res.json({
        user: {
          user_id: user.user_id,
          email: user.email,
          created_at: user.created_at
        },
        token
      });
  
    } catch (err) {
      next(err);
    }
  });

  /**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out and invalidate the current session
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Logged out successfully }
 *       401: { description: No token provided or session not found }
 */
router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const tokenHash = hashToken(token);

    const result = await pool.query(
      'DELETE FROM sessions WHERE token = $1 RETURNING session_id',
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Session not found' });
    }

    res.json({ message: 'Logged out successfully' });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /auth/reset-password/request:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *     responses:
 *       200: { description: Generic confirmation message (does not reveal if email exists) }
 */
router.post('/reset-password/request', async (req, res, next) => {
  try {
    const { email: rawEmail } = req.body;
    const email = rawEmail?.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await pool.query(
      'SELECT user_id FROM users WHERE email = $1',
      [email]
    );

    const genericResponse = {
      message: 'If that email exists, a reset link has been sent'
    };

    if (result.rows.length === 0) {
      return res.json(genericResponse);
    }

    const user = result.rows[0];

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await pool.query(
      `UPDATE users
       SET reset_token_hash = $1, reset_token_expires_at = $2
       WHERE user_id = $3`,
      [resetTokenHash, expiresAt, user.user_id]
    );

    try {

      await sendResetEmail(email, resetToken);
    
    } catch (emailErr) {
    
      console.error('Failed to send reset email:', emailErr);
    
      // Don't leak email failure to client — still return generic response
    
    }
    res.json(genericResponse);

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /auth/reset-password/confirm:
 *   post:
 *     tags: [Auth]
 *     summary: Complete a password reset using the emailed token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken, newPassword]
 *             properties:
 *               resetToken: { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       200: { description: Password reset successfully }
 *       400: { description: Invalid or expired reset token }
 */
router.post('/reset-password/confirm', async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const tokenHash = hashToken(resetToken);

    const result = await pool.query(
      `SELECT user_id FROM users
       WHERE reset_token_hash = $1
       AND reset_token_expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = result.rows[0];
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(newPassword, salt);

    await pool.query(
      `UPDATE users
       SET password_hash = $1, reset_token_hash = NULL, reset_token_expires_at = NULL
       WHERE user_id = $2`,
      [password_hash, user.user_id]
    );

    await pool.query('DELETE FROM sessions WHERE user_id = $1', [user.user_id]);

    res.json({ message: 'Password reset successfully' });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
