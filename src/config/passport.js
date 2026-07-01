const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('../db/pool'); // adjust to your actual db pool export

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const googleId = profile.id;
    const email = profile.emails[0].value;

    // 1. Already linked by google_id — existing OAuth user
    let result = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    if (result.rows.length > 0) {
      return done(null, result.rows[0]);
    }

    // 2. Email exists from a password-based signup — link accounts
    result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      const updated = await pool.query(
        'UPDATE users SET google_id = $1 WHERE email = $2 RETURNING *',
        [googleId, email]
      );
      return done(null, updated.rows[0]);
    }

    // 3. Brand new user
    const created = await pool.query(
      'INSERT INTO users (email, google_id, password_hash) VALUES ($1, $2, NULL) RETURNING *',
      [email, googleId]
    );
    return done(null, created.rows[0]);
  } catch (err) {
    return done(err, null);
  }
}));

module.exports = passport;