const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');

// ── Email transporter ────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// ── POST /api/password-reset/forgot-password ─────────────────
// Body: { email }
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required.' });

        const user = await User.findOne({ email });

        // Always return success to prevent email enumeration
        if (!user) {
            return res.json({ message: 'If that email exists, a reset link has been sent.' });
        }

        // Generate secure token
        const token  = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        user.resetPasswordToken  = token;
        user.resetPasswordExpiry = expiry;
        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL}/password.html?token=${token}`;

        await transporter.sendMail({
            from:    `"clubeasa" <${process.env.EMAIL_USER}>`,
            to:      email,
            subject: 'Reset your clubeasa password',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
                    <h2>Password Reset</h2>
                    <p>You requested a password reset for your clubeasa account.</p>
                    <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:12px 24px;background:#4CAF50;color:#fff;
                              text-decoration:none;border-radius:6px;margin:16px 0;">
                        Reset Password
                    </a>
                    <p style="color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
                </div>
            `,
        });

        console.log(`📧 Password reset email sent to ${email}`);
        res.json({ message: 'If that email exists, a reset link has been sent.' });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
    }
});

// ── POST /api/password-reset/reset-password ──────────────────
// Body: { token, newPassword }
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
            resetPasswordExpiry: { $gt: new Date() }, // not expired
        });

        if (!user) {
            return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
        }

        user.password            = newPassword; // hashed by pre-save hook
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
