// utils/email.js — Resend HTTPS API
const { Resend } = require('resend');

let resendClient = null;

function getClient() {
    if (resendClient) return resendClient;
    if (!process.env.RESEND_API_KEY) {
        console.warn('⚠️  RESEND_API_KEY not configured — email sending disabled');
        return null;
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
}

// Default "from" address.
// Until you verify your own domain (clubeasa.com) at https://resend.com/domains,
// Resend only lets you send FROM onboarding@resend.dev.
// Once domain is verified, set EMAIL_FROM env var to e.g. "clubeasa <noreply@clubeasa.com>"
const FROM = process.env.EMAIL_FROM || 'clubeasa <onboarding@resend.dev>';

// ── Send verification email ──────────────────────────────────
async function sendVerificationEmail(to, name, verifyUrl) {
    const client = getClient();
    if (!client) throw new Error('Email service not configured');

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;padding:24px;background:#0a0e27;color:#fff;">
        <div style="text-align:center;padding-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <h1 style="margin:0;color:#00d4ff;font-size:28px;letter-spacing:1px;">clubeasa</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:13px;">EASA Aviation Exam Prep</p>
        </div>
        <div style="padding:32px 16px;">
            <h2 style="color:#fff;font-size:20px;">Hi ${escapeHtml(name)},</h2>
            <p style="color:rgba(255,255,255,0.85);line-height:1.6;font-size:15px;">
                Welcome to clubeasa! Please verify your email address to activate your account
                and unlock full features.
            </p>
            <div style="text-align:center;margin:36px 0;">
                <a href="${verifyUrl}"
                   style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#00d4ff,#0099cc);
                          color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;
                          letter-spacing:0.5px;">
                    Verify My Email
                </a>
            </div>
            <p style="color:rgba(255,255,255,0.6);font-size:13px;line-height:1.6;">
                Or copy and paste this link into your browser:<br>
                <span style="color:#00d4ff;word-break:break-all;">${verifyUrl}</span>
            </p>
            <p style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:24px;">
                This link will expire in 24 hours. If you did not create a clubeasa account,
                you can safely ignore this email.
            </p>
        </div>
        <div style="text-align:center;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);
                    color:rgba(255,255,255,0.4);font-size:12px;">
            © ${new Date().getFullYear()} clubeasa · Aviation training, simplified
        </div>
    </div>`;

    const text = `Hi ${name},

Welcome to clubeasa! Please verify your email address by clicking the link below:

${verifyUrl}

This link expires in 24 hours.

If you did not create a clubeasa account, you can safely ignore this email.

— clubeasa`;

    const { data, error } = await client.emails.send({
        from:    FROM,
        to,
        subject: 'Verify your clubeasa email',
        text,
        html,
    });

    if (error) {
        console.error('Resend send error:', error);
        throw new Error(error.message || 'Failed to send email');
    }
    return data;
}

// ── Send password reset email ────────────────────────────────
async function sendPasswordResetEmail(to, name, resetUrl) {
    const client = getClient();
    if (!client) throw new Error('Email service not configured');

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;padding:24px;background:#0a0e27;color:#fff;">
        <div style="text-align:center;padding-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <h1 style="margin:0;color:#00d4ff;font-size:28px;letter-spacing:1px;">clubeasa</h1>
        </div>
        <div style="padding:32px 16px;">
            <h2 style="color:#fff;font-size:20px;">Hi ${escapeHtml(name || 'there')},</h2>
            <p style="color:rgba(255,255,255,0.85);line-height:1.6;font-size:15px;">
                We received a request to reset your password. Click the button below to set a new one.
            </p>
            <div style="text-align:center;margin:36px 0;">
                <a href="${resetUrl}"
                   style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#ff6b6b,#ee5253);
                          color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
                    Reset Password
                </a>
            </div>
            <p style="color:rgba(255,255,255,0.6);font-size:13px;line-height:1.6;">
                Or copy and paste this link:<br>
                <span style="color:#00d4ff;word-break:break-all;">${resetUrl}</span>
            </p>
            <p style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:24px;">
                This link will expire in 1 hour. If you did not request a password reset,
                you can safely ignore this email — your password will not be changed.
            </p>
        </div>
        <div style="text-align:center;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);
                    color:rgba(255,255,255,0.4);font-size:12px;">
            © ${new Date().getFullYear()} clubeasa
        </div>
    </div>`;

    const text = `Hi ${name || 'there'},

We received a request to reset your clubeasa password. Click the link below:

${resetUrl}

This link expires in 1 hour. If you did not request this, you can safely ignore this email.

— clubeasa`;

    const { data, error } = await client.emails.send({
        from:    FROM,
        to,
        subject: 'Reset your clubeasa password',
        text,
        html,
    });

    if (error) {
        console.error('Resend send error:', error);
        throw new Error(error.message || 'Failed to send email');
    }
    return data;
}

function escapeHtml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
