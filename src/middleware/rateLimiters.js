const rateLimit = require('express-rate-limit');

// Strict limit on auth endpoints — these are brute-force targets
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again later' }
  });

  // Looser limit for general authenticated API usage
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' }
  });
  
  module.exports = { authLimiter, apiLimiter };