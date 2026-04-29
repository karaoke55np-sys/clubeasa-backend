const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.json({ 
                success: true, 
                message: 'If your email is registered, you will receive a reset link' 
            });
        }
        
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = Date.now() + 3600000;
        
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpiry;
        await user.save();
        
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;
        
        const mailOptions = {
            to: user.email,
            from: process.env.EMAIL_USER,
            subject: 'clubeasa - Password Reset Request',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #0a0a0f, #1a1a2e); color: #fff; border-radius: 16px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #00d4ff;">clubeasa</h1>
                        <p style="color: #00d4ff;">EASA Exam Preparation</p>
                    </div>
                    
                    <h2>Password Reset Request</h2>
                    <p>Hello ${user.name},</p>
                    <p>We received a request to reset your password for your clubeasa account.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background: linear-gradient(135deg, #00d4ff, #0099cc); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
                    </div>
                    
                    <p>Or copy this link: <a href="${resetUrl}" style="color: #00d4ff;">${resetUrl}</a></p>
                    
                    <p>This link will expire in <strong>1 hour</strong>.</p>
                    
                    <p>If you didn't request this, please ignore this email.</p>
                    
                    <hr style="border-color: rgba(255,255,255,0.1); margin: 20px 0;">
                    <p style="font-size: 12px; color: #888;">Stay safe,<br>The clubeasa Team</p>
                </div>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        res.json({ 
            success: true, 
            message: 'If your email is registered, you will receive a reset link' 
        });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Verify reset token
router.post('/verify-token', async (req, res) => {
    try {
        const { token } = req.body;
        
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
        
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }
        
        user.password = newPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();
        
        res.json({ success: true, message: 'Password has been reset successfully' });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

module.exports = router;