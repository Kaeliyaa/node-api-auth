const required = [
    'DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN',
    'RESEND_API_KEY', 'EMAIL_FROM', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'
]

function validateEnv() {
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

module.exports = validateEnv;