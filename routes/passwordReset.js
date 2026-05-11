const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/email');

// ── POST /api/password-reset/forgot-password ─────────────────
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required.' });

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        // Always respond with the same generic message (don't leak whether email exists)
        const genericMessage = 'If an account exists with that email, a password reset link has been sent.';

        if (!user) {
            return res.json({ success: true, message: genericMessage });
        }

        const token  = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        user.resetPasswordToken  = token;
        user.resetPasswordExpiry = expiry;
        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL}/password.html?token=${token}`;

        try {
            await sendPasswordResetEmail(user.email, user.name, resetUrl);
            console.log(`Password reset email sent to ${user.email}`);
        } catch (mailErr) {
            console.error('Failed to send reset email:', mailErr.message);
            return res.status(500).json({ error: 'Failed to send reset email. Please try again later.' });
        }

        res.json({ success: true, message: genericMessage });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Failed to send reset link. Please try again.' });
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

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await User.findByIdAndUpdate(user._id, {
            password:            hashedPassword,
            resetPasswordToken:  null,
            resetPasswordExpiry: null,
        });

        console.log(`Password reset successfully for ${user.email}`);
        res.json({ message: 'Password reset successfully! You can now log in.' });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }
});

module.exports = router;
