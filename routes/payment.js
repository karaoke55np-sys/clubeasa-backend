const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// ── Plan config ──────────────────────────────────────────────
const PLANS = {
    monthly:   { variantId: process.env.LS_VARIANT_MONTHLY,   durationDays: 30,  label: '1 Month'  },
    bimonthly: { variantId: process.env.LS_VARIANT_BIMONTHLY, durationDays: 60,  label: '2 Months' },
    quarterly: { variantId: process.env.LS_VARIANT_QUARTERLY, durationDays: 90,  label: '3 Months' },
};

// ── Helper: LemonSqueezy API call ────────────────────────────
async function lsRequest(method, path, data = null) {
    const config = {
        method,
        url: `https://api.lemonsqueezy.com/v1${path}`,
        headers: {
            'Accept':        'application/vnd.api+json',
            'Content-Type':  'application/vnd.api+json',
            'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        },
    };
    if (data) config.data = data;
    const res = await axios(config);
    return res.data;
}

// ── POST /api/payment/create-checkout ───────────────────────
// Requires: Authorization header with JWT token
// Body: { plan: 'monthly' | 'bimonthly' | 'quarterly' }
router.post('/create-checkout', authMiddleware, async (req, res) => {
    try {
        const { plan } = req.body;
        const userId = req.user.userId;

        if (!plan || !PLANS[plan]) {
            return res.status(400).json({ error: 'Invalid plan. Choose: monthly, bimonthly, or quarterly.' });
        }

        const planConfig = PLANS[plan];

        if (!planConfig.variantId) {
            return res.status(500).json({ error: `Variant ID for "${plan}" not set in .env` });
        }

        // Get user email
        const user = await User.findById(userId).select('email name');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Create checkout via LemonSqueezy API
        const payload = {
            data: {
                type: 'checkouts',
                attributes: {
                    checkout_data: {
                        email: user.email,
                        name:  user.name,
                        custom: {
                            user_id: String(userId),
                            plan:    plan,
                        },
                    },
                    product_options: {
                        redirect_url:     `${process.env.FRONTEND_URL}/payment-success.html`,
                        receipt_link_url: `${process.env.FRONTEND_URL}/payment-success.html`,
                    },
                    checkout_options: {
                        button_color: '#4CAF50',
                    },
                    expires_at: null,
                },
                relationships: {
                    store: {
                        data: { type: 'stores', id: String(process.env.LEMONSQUEEZY_STORE_ID) },
                    },
                    variant: {
                        data: { type: 'variants', id: String(planConfig.variantId) },
                    },
                },
            },
        };

        const response = await lsRequest('POST', '/checkouts', payload);
        const checkoutUrl = response?.data?.attributes?.url;

        if (!checkoutUrl) {
            console.error('LS checkout response:', JSON.stringify(response, null, 2));
            return res.status(500).json({ error: 'Failed to get checkout URL from LemonSqueezy.' });
        }

        res.json({
            url:   checkoutUrl,
            plan:  plan,
            label: planConfig.label,
        });

    } catch (err) {
        console.error('❌ create-checkout error:', err?.response?.data || err.message);
        res.status(500).json({ error: 'Failed to create checkout session.' });
    }
});

// ── POST /api/payment/webhook ────────────────────────────────
// Called automatically by LemonSqueezy after payment
// Set this URL in LS Dashboard → Settings → Webhooks
// Note: This route uses raw body (set in server.js before express.json)
router.post('/webhook', async (req, res) => {
    try {
        // Verify webhook signature
        const secret    = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
        const signature = req.headers['x-signature'];

        if (secret && signature) {
            const hmac   = crypto.createHmac('sha256', secret);
            const digest = Buffer.from(hmac.update(req.body).digest('hex'), 'utf8');
            const sigBuf = Buffer.from(signature, 'utf8');

            if (digest.length !== sigBuf.length || !crypto.timingSafeEqual(digest, sigBuf)) {
                console.warn('⚠️  Webhook signature mismatch — request rejected');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        const event      = JSON.parse(req.body.toString());
        const eventName  = event.meta?.event_name;
        const customData = event.meta?.custom_data || {};
        const userId     = customData.user_id;
        const plan       = customData.plan;

        console.log(`📦 Webhook: ${eventName} | plan=${plan} | userId=${userId}`);

        // Activate subscription when payment is confirmed
        if (eventName === 'order_created' && userId && plan && PLANS[plan]) {
            const now    = new Date();
            const expiry = new Date(now.getTime() + PLANS[plan].durationDays * 24 * 60 * 60 * 1000);

            await User.findByIdAndUpdate(userId, {
                isSubscribed:       true,
                subscriptionPlan:   plan,
                subscriptionExpiry: expiry,
                subscriptionStart:  now,
                lsOrderId:          String(event.data?.id || ''),
            });

            console.log(`✅ Subscription activated: userId=${userId} plan=${plan} expires=${expiry.toISOString()}`);
        }

        res.status(200).json({ received: true });

    } catch (err) {
        console.error('❌ Webhook error:', err.message);
        res.status(500).json({ error: 'Webhook processing failed.' });
    }
});

// ── GET /api/payment/status ──────────────────────────────────
// Returns current subscription status for logged-in user
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select('isSubscribed subscriptionPlan subscriptionExpiry');

        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Auto-expire if past expiry
        const now = new Date();
        if (user.isSubscribed && user.subscriptionExpiry && now > user.subscriptionExpiry) {
            await User.findByIdAndUpdate(req.user.userId, { isSubscribed: false });
            return res.json({ isSubscribed: false, expired: true });
        }

        res.json({
            isSubscribed: user.isSubscribed  || false,
            plan:         user.subscriptionPlan   || null,
            expiry:       user.subscriptionExpiry || null,
        });

    } catch (err) {
        console.error('❌ status error:', err.message);
        res.status(500).json({ error: 'Failed to fetch subscription status.' });
    }
});

module.exports = router;
