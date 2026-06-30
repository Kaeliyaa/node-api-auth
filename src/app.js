require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check — useful for verifying the server is up
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const authMiddleware = require('./middleware/auth');

app.get('/protected', authMiddleware, (req, res) => {
  res.json({ message: 'You are authenticated', user_id: req.user.user_id });
});

const sessionsRoutes = require('./routes/sessions');
app.use('/sessions', sessionsRoutes);

const resultsRoutes = require('./routes/results');
app.use('/results', resultsRoutes);

// Global error handler — always last
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});