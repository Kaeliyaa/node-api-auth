require('dotenv').config();
const validateEnv = require('./config/validateEnv');
validateEnv();

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const stripe = require('./services/stripe');
const pool = require('./db/pool');

const app = express();

app.set('trust proxy', 1);

app.use(cors());

// Stripe webhook needs raw body — register BEFORE express.json()
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      await pool.query(
        `UPDATE purchases SET status = 'paid' WHERE stripe_payment_intent_id = $1`,
        [paymentIntent.id]
      );
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      await pool.query(
        `UPDATE purchases SET status = 'failed' WHERE stripe_payment_intent_id = $1`,
        [paymentIntent.id]
      );
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.use(express.json());
app.use(express.static('public'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec))

// Health check — useful for verifying the server is up
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const { authLimiter, apiLimiter } = require('./middleware/rateLimiters');
const authRoutes = require('./routes/auth');
app.use('/auth', authLimiter, authRoutes);

const authMiddleware = require('./middleware/auth');

app.get('/protected', authMiddleware, (req, res) => {
  res.json({ message: 'You are authenticated', user_id: req.user.user_id });
});


const sessionsRoutes = require('./routes/sessions');
app.use('/sessions', apiLimiter, sessionsRoutes);

const resultsRoutes = require('./routes/results');
app.use('/results', apiLimiter, resultsRoutes);

const purchasesRoutes = require('./routes/purchases');
app.use('/purchases', apiLimiter, purchasesRoutes)

// Global error handler — always last
// bottom of src/app.js, replacing your current error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || statusCode < 500;

  console.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(statusCode).json({
    error: isOperational ? err.message : 'Something went wrong. Please try again.'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});