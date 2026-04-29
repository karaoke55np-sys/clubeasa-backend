const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const nodemailer = require('nodemailer');

// Email transporter (will be set up when server starts)
let transporter;

// Function to create test email account
async function setupEmailTransporter() {
    try {
        // Create a fake test account on Ethereal
        const testAccount = await nodemailer.createTestAccount();
        
        // Set up the transporter using the test account
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
        
        console.log('✅ Email system ready (using Ethereal test email)');
        console.log('📧 Test email account:', testAccount.user);
        console.log('🔑 Test email password:', testAccount.pass);
        console.log('💡 Password reset emails will show preview URL in logs');
        
    } catch (error) {
        console.error('❌ Failed to setup email:', error.message);
    }
}

// Call this when server starts
setupEmailTransporter();

// Request password reset - Step 1: User enters email
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
        
        // Generate password reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = Date.now() + 3600000; // 1 hour from now
        
        // Save token to user record
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpiry;
        await user.save();
        
        // Create reset URL
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password.html?token=${resetToken}`;
        
        // Email content
        const mailOptions = {
            to: user.email,
            subject: 'clubeasa - Password Reset Request',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #0a0a0f, #1a1a2e); color: #fff; border-radius: 16px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #00d4ff; margin: 0;">clubeasa</h1>
                        <p style="color: #00d4ff; margin: 0;">EASA Exam Preparation</p>
                    </div>
                    
                    <h2>Password Reset Request</h2>
                    <p>Hello ${user.name},</p>
                    <p>We received a request to reset your password for your clubeasa account.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background: linear-gradient(135deg, #00d4ff, #0099cc); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
                    </div>
                    
                    <p>Or copy this link: <a href="${resetUrl}" style="color: #00d4ff;">${resetUrl}</a></p>
                    
                    <p>This link will expire in <strong>1 hour</strong>.</p>
                    
                    <p>If you didn't request this, please ignore this email.</p>
                    
                    <hr style="border-color: rgba(255,255,255,0.1); margin: 20px 0;">
                    <p style="font-size: 12px; color: #888;">Stay safe,<br>The clubeasa Team</p>
                </div>
            `
        };
        
        // Send the email
        const info = await transporter.sendMail(mailOptions);
        
        // Get the preview URL (Ethereal specific)
        const previewUrl = nodemailer.getTestMessageUrl(info);
        
        console.log('📧 Password reset email sent to:', user.email);
        console.log('🔗 Preview URL (copy this to see the email):', previewUrl);
        
        // Return success with preview URL (for testing)
        res.json({ 
            success: true, 
            message: 'Reset link ready! Check the Render logs for the preview URL.',
            previewUrl: previewUrl
        });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ 
            error: 'Failed to send reset email. Please try again later.' 
        });
    }
});

// Verify reset token - Step 2: Check if token is valid
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

// Reset password - Step 3: Set new password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        // Find user with valid token
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