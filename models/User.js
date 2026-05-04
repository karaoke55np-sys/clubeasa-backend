const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// ── GET /api/user/profile ────────────────────────────────────
// Returns profile + subscription info for logged-in user
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select('-password -resetPasswordToken -resetPasswordExpiry');

        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Auto-expire subscription check
        if (user.isSubscribed && user.subscriptionExpiry && new Date() > user.subscriptionExpiry) {
            user.isSubscribed = false;
            await user.save();
        }

        res.json({ user });

    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});

// ── PUT /api/user/profile ────────────────────────────────────
// Update name only (email changes not allowed)
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required.' });

        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { name },
            { new: true, select: '-password -resetPasswordToken -resetPasswordExpiry' }
        );

        res.json({ message: 'Profile updated!', user });

    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

module.exports = router;
