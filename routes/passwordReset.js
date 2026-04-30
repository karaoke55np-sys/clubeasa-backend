const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');

// Request password reset - Returns reset link directly (no email needed)
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Find user (case-insensitive)
        const user = await User.findOne({ email: email.toLowerCase() });
        
        // For security, don't reveal if email exists
        if (!user) {
            return res.json({ 
                success: true, 
                message: 'If your email is registered, you will receive a reset link' 
            });
        }
        
        // Check if there's already a valid token
        if (user.resetPasswordToken && user.resetPasswordExpires > Date.now()) {
            // Calculate remaining time
            const remainingMs = user.resetPasswordExpires - Date.now();
            const remainingMinutes = Math.ceil(remainingMs / 60000);
            const remainingHours = Math.floor(remainingMinutes / 60);
            const remainingMins = remainingMinutes % 60;
            
            let timeMessage = '';
            if (remainingHours > 0) {
                timeMessage = `${remainingHours} hour${remainingHours > 1 ? 's' : ''} and ${remainingMins} minute${remainingMins > 1 ? 's' : ''}`;
            } else {
                timeMessage = `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
            }
            
            return res.json({ 
                success: false,
                error: `A reset link was already sent. Please try again after ${timeMessage}.`,
                remainingMinutes: remainingMinutes
            });
        }
        
        // Generate new password reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = Date.now() + 3600000; // 1 hour from now
        
        // Save token to user record
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpiry;
        await user.save();
        
        // Create reset URL - USING password.html
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/password.html?token=${resetToken}`;
        
        console.log('🔐 Password reset token generated for:', user.email);
        console.log('🔗 Reset link:', resetUrl);
        
        // Return the reset link directly in the response
        res.json({ 
            success: true, 
            message: 'Reset link generated successfully! Use the link below.',
            resetUrl: resetUrl
        });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ 
            error: 'Failed to generate reset link. Please try again.' 
        });
    }
});

// Verify reset token
router.post('/verify-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }
        
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }
        
        res.json({ success: true, message: 'Token is valid' });
        
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({ error: 'Failed to verify token' });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }
        
        // Update password
        user.password = newPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();
        
        console.log('✅ Password reset successfully for:', user.email);
        
        res.json({ success: true, message: 'Password has been reset successfully' });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

module.exports = router;