const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// ── CORS: accept multiple origins ────────────────────────────
// CORS_ORIGINS can be a single URL or a comma-separated list.
// Falls back to FRONTEND_URL (used for email links) then localhost.
// Example on Render: CORS_ORIGINS=https://club66pro.xyz,https://club66pro.netlify.app,http://localhost:3000
const rawOrigins = process.env.CORS_ORIGINS
    || process.env.FRONTEND_URL
    || 'http://localhost:3000';
const allowedOrigins = rawOrigins.split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
// Accept both https://example.com and https://www.example.com for every listed origin
for (const o of [...allowedOrigins]) {
    const m = o.match(/^(https?:\/\/)(www\.)?(.+)$/i);
    if (m) {
        const alt = m[2] ? `${m[1]}${m[3]}` : `${m[1]}www.${m[3]}`;
        if (!allowedOrigins.includes(alt)) allowedOrigins.push(alt);
    }
}

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (e.g. curl, server-to-server, mobile apps)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // Also allow any *.netlify.app subdomain (deploy previews) so Netlify branch deploys
        // and PR previews still work without needing to add each to the env var
        if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(origin)) {
            return callback(null, true);
        }

        console.warn(`CORS blocked request from origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/payment',        require('./routes/payment'));
app.use('/api/user',           require('./routes/user'));
app.use('/api/password-reset', require('./routes/passwordReset'));
app.use('/api/admin',          require('./routes/admin'));

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
    console.log(`📡 CORS allowed origins: ${allowedOrigins.join(', ')} (+ *.netlify.app)`);
});
