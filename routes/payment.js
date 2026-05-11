const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const axios   = require('axios');
const User    = require('../models/User');
const authMiddleware = require('../middleware/auth');

// ── Duration days map ────────────────────────────────────────
function getDurationDays(months) {
    return parseInt(months || 1) * 30;
}

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

// ── POST /api/payment/create-checkout ────────────────────────
// Body: { variantId, modules, months, plan }
router.post('/create-checkout', authMiddleware, async (req, res) => {
    try {
        const { variantId, modules, months, plan } = req.body;
        const userId = req.user.userId;

        if (!variantId) {
            return res.status(400).json({ error: 'No variant selected. Please select a module and duration.' });
        }

        // Get user email
        const user = await User.findById(userId).select('email name');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const payload = {
            data: {
                type: 'checkouts',
                attributes: {
                    checkout_data: {
                        email: user.email,
                        name:  user.name,
                        custom: {
                            user_id: String(userId),
                            modules: JSON.stringify(modules || []),
                            months:  String(months || 1),
                            plan:    plan || 'custom',
                        },
                    },
                    product_options: {
                        redirect_url:     `${process.env.FRONTEND_URL}/payment-success.html`,
                        receipt_link_url: `${process.env.FRONTEND_URL}/payment-success.html`,
                    },
                    checkout_options: {
                        button_color: '#00d4ff',
                    },
                    expires_at: null,
                },
                relationships: {
                    store: {
                        data: { type: 'stores', id: String(process.env.LEMONSQUEEZY_STORE_ID) },
                    },
                    variant: {
                        data: { type: 'variants', id: String(variantId) },
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

        res.json({ url: checkoutUrl });

    } catch (err) {
        console.error('create-checkout error:', err?.response?.data || err.message);
        res.status(500).json({ error: 'Failed to create checkout session.' });
    }
});

// ── POST /api/payment/webhook ─────────────────────────────────
router.post('/webhook', async (req, res) => {
    try {
        const secret    = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
        const signature = req.headers['x-signature'];

        if (secret && signature) {
            const hmac   = crypto.createHmac('sha256', secret);
            const digest = Buffer.from(hmac.update(req.body).digest('hex'), 'utf8');
            const sigBuf = Buffer.from(signature, 'utf8');
            if (digest.length !== sigBuf.length || !crypto.timingSafeEqual(digest, sigBuf)) {
                console.warn('Webhook signature mismatch');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        const event      = JSON.parse(req.body.toString());
        const eventName  = event.meta?.event_name;
        const customData = event.meta?.custom_data || {};
        const userId     = customData.user_id;
        const months     = parseInt(customData.months || 1);
        const modules    = JSON.parse(customData.modules || '[]');

        console.log(`Webhook: ${eventName} | userId=${userId} | modules=${modules} | months=${months}`);

        if (eventName === 'order_created' && userId) {
            const now = new Date();

            // Load full user (we need moduleAccess Map)
            const existingUser = await User.findById(userId);
            if (!existingUser) {
                console.warn(`Webhook: user ${userId} not found`);
                return res.status(200).json({ received: true });
            }

            // For each purchased module, extend or set its own expiry
            const addMs = months * 30 * 24 * 60 * 60 * 1000;

            if (!existingUser.moduleAccess) existingUser.moduleAccess = new Map();

            for (const mod of modules) {
                const current = existingUser.moduleAccess.get(mod);
                const baseDate = (current && current.expiry && current.expiry > now)
                                 ? current.expiry
                                 : now;
                const newExpiry = new Date(baseDate.getTime() + addMs);

                existingUser.moduleAccess.set(mod, {
                    expiry:      newExpiry,
                    plan:        customData.plan || `${months}month`,
                    purchasedAt: now,
                    months:      months,
                });
            }

            // Recompute global fields from moduleAccess (kept for legacy clients)
            const activeMods = [];
            let latestExpiry = null;
            for (const [mod, info] of existingUser.moduleAccess.entries()) {
                if (info.expiry && info.expiry > now) {
                    activeMods.push(mod);
                    if (!latestExpiry || info.expiry > latestExpiry) latestExpiry = info.expiry;
                }
            }

            existingUser.isSubscribed       = activeMods.length > 0;
            existingUser.subscribedModules  = activeMods;
            existingUser.subscriptionExpiry = latestExpiry;
            existingUser.subscriptionPlan   = customData.plan || 'custom';
            existingUser.subscriptionStart  = existingUser.subscriptionStart || now;
            existingUser.lsOrderId          = String(event.data?.id || '');

            await existingUser.save();

            console.log(`Subscription activated: userId=${userId} modules=${activeMods} per-module access updated`);
        }

        res.status(200).json({ received: true });

    } catch (err) {
        console.error('Webhook error:', err.message);
        res.status(500).json({ error: 'Webhook processing failed.' });
    }
});

// ── GET /api/payment/status ───────────────────────────────────
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const now = new Date();

        // Build per-module access object, filtering out expired ones
        const moduleAccess = {};
        const activeModules = [];
        let latestExpiry = null;

        if (user.moduleAccess) {
            for (const [mod, info] of user.moduleAccess.entries()) {
                if (info.expiry && info.expiry > now) {
                    moduleAccess[mod] = {
                        expiry:      info.expiry,
                        plan:        info.plan,
                        purchasedAt: info.purchasedAt,
                        daysLeft:    Math.ceil((info.expiry - now) / (1000 * 60 * 60 * 24)),
                    };
                    activeModules.push(mod);
                    if (!latestExpiry || info.expiry > latestExpiry) latestExpiry = info.expiry;
                }
            }
        }

        // Sync legacy fields if they drifted
        const needsSync =
            user.isSubscribed       !== (activeModules.length > 0) ||
            user.subscribedModules?.length !== activeModules.length ||
            !activeModules.every(m => user.subscribedModules.includes(m));

        if (needsSync) {
            user.isSubscribed       = activeModules.length > 0;
            user.subscribedModules  = activeModules;
            user.subscriptionExpiry = latestExpiry;
            await user.save();
        }

        res.json({
            isSubscribed: activeModules.length > 0,
            plan:         user.subscriptionPlan || null,
            expiry:       latestExpiry,
            modules:      activeModules,
            moduleAccess,
        });

    } catch (err) {
        console.error('status error:', err.message);
        res.status(500).json({ error: 'Failed to fetch subscription status.' });
    }
});

module.exports = router;
