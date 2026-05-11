const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const User    = require('../models/User');
const { sendVerificationEmail } = require('../utils/email');

// 24-hour verification token lifetime
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// ── POST /api/auth/register ──────────────────────────────────
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password are required.' });
        }

        // Basic email format check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            // If existing account is unverified and old, allow resend instead of blocking
            if (!existing.isVerified) {
                return res.status(400).json({
                    error:     'An unverified account with this email already exists. Please check your inbox or request a new verification link.',
                    unverified: true,
                });
            }
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        // Generate verification token
        const verificationToken       = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

        const user = new User({
            name,
            email: normalizedEmail,
            password,
            isVerified:              false,
            verificationToken,
            verificationTokenExpiry,
        });
        await user.save();

        // Build verification URL
        const verifyUrl = `${process.env.FRONTEND_URL}/verify-email.html?token=${verificationToken}`;

        // Send email (don't fail registration if email fails — user can resend later)
        try {
            await sendVerificationEmail(normalizedEmail, name, verifyUrl);
            console.log(`Verification email sent to ${normalizedEmail}`);
        } catch (mailErr) {
            console.error('Failed to send verification email:', mailErr.message);
            // Don't return error to user; account is created, they can resend
        }

        res.status(201).json({
            message:     'Account created! Please check your email to verify your account.',
            email:       normalizedEmail,
            needsVerification: true,
        });

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// ── GET /api/auth/verify-email?token=xxx ─────────────────────
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Verification token is required.' });

        const user = await User.findOne({
            verificationToken:       token,
            verificationTokenExpiry: { $gt: new Date() },
        });

        if (!user) {
            // Check if maybe already verified (user clicked link twice)
            const maybeVerified = await User.findOne({ verificationToken: null, email: { $exists: true } });
            return res.status(400).json({
                error: 'Verification link is invalid or has expired. Please request a new one.',
            });
        }

        user.isVerified              = true;
        user.verificationToken       = null;
        user.verificationTokenExpiry = null;
        await user.save();

        console.log(`Email verified for ${user.email}`);
        res.json({
            success: true,
            message: 'Email verified successfully! You can now log in.',
            email:   user.email,
        });

    } catch (err) {
        console.error('Verify-email error:', err);
        res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
});

// ── POST /api/auth/resend-verification ───────────────────────
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required.' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            // Don't reveal whether the email exists
            return res.json({ message: 'If an account exists with that email, a verification link has been sent.' });
        }

        if (user.isVerified) {
            return res.status(400).json({ error: 'This account is already verified. You can log in.' });
        }

        // Generate new token
        user.verificationToken       = crypto.randomBytes(32).toString('hex');
        user.verificationTokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
        await user.save();

        const verifyUrl = `${process.env.FRONTEND_URL}/verify-email.html?token=${user.verificationToken}`;

        try {
            await sendVerificationEmail(user.email, user.name, verifyUrl);
        } catch (mailErr) {
            console.error('Failed to send verification email:', mailErr.message);
            return res.status(500).json({ error: 'Failed to send email. Please try again later.' });
        }

        res.json({ message: 'Verification email sent! Please check your inbox.' });

    } catch (err) {
        console.error('Resend verification error:', err);
        res.status(500).json({ error: 'Failed to resend verification email.' });
    }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid email or password.' });

        // Auto-expire subscription if past expiry date
        if (user.isSubscribed && user.subscriptionExpiry && new Date() > user.subscriptionExpiry) {
            user.isSubscribed = false;
            await user.save();
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            message: 'Login successful!',
            token,
            user: {
                id:                 user._id,
                name:               user.name,
                email:              user.email,
                isVerified:         user.isVerified,
                isSubscribed:       user.isSubscribed,
                subscriptionPlan:   user.subscriptionPlan,
                subscriptionExpiry: user.subscriptionExpiry
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

module.exports = router;
