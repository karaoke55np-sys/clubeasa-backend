const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const User    = require('../models/User');

const VALID_MODULES = ['04', '06', '07', '08', '10', '13'];
const MS_PER_MONTH  = 30 * 24 * 60 * 60 * 1000; // 30-day month

// ── Tiny in-memory login throttle (5 failures / 15 min per IP) ──
const attempts = new Map();
function throttled(ip) {
    const now = Date.now();
    const rec = attempts.get(ip) || { count: 0, first: now };
    if (now - rec.first > 15 * 60 * 1000) { attempts.set(ip, { count: 0, first: now }); return false; }
    return rec.count >= 5;
}
function recordFailure(ip) {
    const now = Date.now();
    const rec = attempts.get(ip) || { count: 0, first: now };
    rec.count += 1;
    attempts.set(ip, rec);
}

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

// ── Middleware: admin token required ─────────────────────────
function requireAdmin(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing admin token.' });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.isAdmin !== true) return res.status(401).json({ error: 'Not authorized.' });
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired admin token.' });
    }
}

// Shape used by admin.html
function serializeUser(user) {
    const now = new Date();
    const modules = [];
    const moduleAccess = {};
    let latest = null;
    if (user.moduleAccess) {
        for (const [mod, info] of user.moduleAccess.entries()) {
            moduleAccess[mod] = { expiry: info.expiry, plan: info.plan, months: info.months, note: info.note };
            if (info.expiry && info.expiry > now) {
                modules.push(mod);
                if (!latest || info.expiry > latest) latest = info.expiry;
            }
        }
    }
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        isVerified: user.isVerified,
        isSubscribed: modules.length > 0,
        modules,
        expiry: latest,
        moduleAccess,
    };
}

// ── POST /api/admin/login  { password } ──────────────────────
router.post('/login', (req, res) => {
    const ip = req.ip;
    if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'Admin not configured.' });
    if (throttled(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });

    const { password } = req.body || {};
    if (!password || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
        recordFailure(ip);
        return res.status(401).json({ error: 'Incorrect password.' });
    }
    const token = jwt.sign({ isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
});

// ── GET /api/admin/user?email= ───────────────────────────────
router.get('/user', requireAdmin, async (req, res) => {
    try {
        const email = String(req.query.email || '').toLowerCase().trim();
        if (!email) return res.status(400).json({ error: 'Email required.' });
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json({ user: serializeUser(user) });
    } catch (err) {
        console.error('admin lookup error:', err.message);
        res.status(500).json({ error: 'Lookup failed.' });
    }
});

// ── POST /api/admin/grant-access  { email, modules[], months, note } ──
router.post('/grant-access', requireAdmin, async (req, res) => {
    try {
        const email   = String(req.body.email || '').toLowerCase().trim();
        const months  = parseInt(req.body.months, 10);
        const modules = Array.isArray(req.body.modules) ? req.body.modules.map(String) : [];
        const note    = String(req.body.note || '').slice(0, 200);

        if (!email || !modules.length || !months) {
            return res.status(400).json({ error: 'email, modules[] and months are required.' });
        }
        if (months < 1 || months > 12) return res.status(400).json({ error: 'months must be 1–12.' });
        if (!modules.every(m => VALID_MODULES.includes(m))) {
            return res.status(400).json({ error: `Invalid module. Allowed: ${VALID_MODULES.join(', ')}` });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const now = new Date();
        if (!user.moduleAccess) user.moduleAccess = new Map();

        // Extend from the current expiry if the module is still active
        for (const mod of modules) {
            const current  = user.moduleAccess.get(mod);
            const base     = (current && current.expiry && current.expiry > now) ? current.expiry : now;
            const newExpiry = new Date(base.getTime() + months * MS_PER_MONTH);
            user.moduleAccess.set(mod, {
                expiry: newExpiry,
                plan: 'khalti-manual',
                purchasedAt: now,
                months,
                note,
            });
        }

        // Recompute legacy global fields
        const active = [];
        let latest = null;
        for (const [mod, info] of user.moduleAccess.entries()) {
            if (info.expiry && info.expiry > now) {
                active.push(mod);
                if (!latest || info.expiry > latest) latest = info.expiry;
            }
        }
        user.isSubscribed       = active.length > 0;
        user.subscribedModules  = active;
        user.subscriptionExpiry = latest;
        user.subscriptionPlan   = 'khalti-manual';
        user.subscriptionStart  = user.subscriptionStart || now;

        await user.save();
        console.log(`ADMIN GRANT: ${email} modules=${modules} months=${months} note="${note}"`);

        res.json({ success: true, user: serializeUser(user) });
    } catch (err) {
        console.error('admin grant error:', err.message);
        res.status(500).json({ error: 'Could not grant access.' });
    }
});

module.exports = router;
