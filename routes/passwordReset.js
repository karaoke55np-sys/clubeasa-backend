const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const User    = require('../models/User');

// ── POST /api/password-reset/forgot-password ─────────────────
// Returns reset link directly — no email needed
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required.' });

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ error: 'No account found with that email.' });
        }

        // Generate secure token
        const token  = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        user.resetPasswordToken  = token;
        user.resetPasswordExpiry = expiry;
        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL}/password.html?token=${token}`;

        console.log(`Password reset link generated for ${email}`);

        // Return the reset URL directly to the frontend
        res.json({
            success:  true,
            resetUrl: resetUrl,
            message:  'Reset link generated! Click the link below to reset your password.'
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Failed to generate reset link. Please try again.' });
    }
});

// ── POST /api/password-reset/reset-password ──────────────────
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const user = await User.findOne({
            resetPasswordToken:  token,
            resetPasswordExpiry: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
        }

        user.password            = newPassword;
        user.resetPasswordToken  = null;
        user.resetPasswordExpiry = null;
        await user.save();

        res.json({ message: 'Password reset successfully! You can now log in.' });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }
});

module.exports = router;
