const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

// SYNC BOOKMARKS
router.post('/sync/bookmarks', auth, async (req, res) => {
    try {
        const { module, bookmarks } = req.body;
        
        if (module === 'module07') {
            req.user.progress.module07.bookmarks = bookmarks;
        } else if (module === 'module10') {
            req.user.progress.module10.bookmarks = bookmarks;
        }
        
        await req.user.save();
        res.json({ success: true, message: 'Bookmarks synced' });
    } catch (error) {
        res.status(500).json({ error: 'Sync failed' });
    }
});

// SYNC FLAGS
router.post('/sync/flags', auth, async (req, res) => {
    try {
        const { module, flags } = req.body;
        
        if (module === 'module07') {
            req.user.progress.module07.flags = flags;
        } else if (module === 'module10') {
            req.user.progress.module10.flags = flags;
        }
        
        await req.user.save();
        res.json({ success: true, message: 'Flags synced' });
    } catch (error) {
        res.status(500).json({ error: 'Sync failed' });
    }
});

// SYNC NOTES
router.post('/sync/notes', auth, async (req, res) => {
    try {
        const { module, notes } = req.body;
        
        if (module === 'module07') {
            req.user.progress.module07.notes = notes;
        } else if (module === 'module10') {
            req.user.progress.module10.notes = notes;
        }
        
        await req.user.save();
        res.json({ success: true, message: 'Notes synced' });
    } catch (error) {
        res.status(500).json({ error: 'Sync failed' });
    }
});

// GET ALL USER DATA
router.get('/data', auth, async (req, res) => {
    res.json({
        profile: {
            name: req.user.name,
            email: req.user.email,
            joined: req.user.createdAt,
            lastLogin: req.user.lastLogin
        },
        subscription: {
            plan: req.user.subscription.plan,
            endDate: req.user.subscription.endDate,
            isActive: req.user.hasActiveSubscription(),
            daysRemaining: req.user.subscription.endDate ?
                Math.max(0, Math.floor((new Date(req.user.subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0
        },
        progress: req.user.progress,
        paymentHistory: req.user.paymentHistory
    });
});

module.exports = router;