const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Payments are taken with Khalti and confirmed manually over WhatsApp.
// Access is granted from the admin page (POST /api/admin/grant-access).
// This route only reports what a user currently has unlocked.

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
