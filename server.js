const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// ── Webhook route needs raw body BEFORE express.json() ──────
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/payment',        require('./routes/payment'));
app.use('/api/user',           require('./routes/user'));
app.use('/api/password-reset', require('./routes/passwordReset'));

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'clubeasa API is running', timestamp: new Date() });
});

// ── MongoDB ──────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    family: 4
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 clubeasa API running on port ${PORT}`);
});
