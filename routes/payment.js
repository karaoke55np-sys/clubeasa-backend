const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const router = express.Router();

const PLANS = {
    monthly: { days: 30, price: 500, price_usd: 5 },
    quarterly: { days: 90, price: 1350, price_usd: 12 },
    yearly: { days: 365, price: 4500, price_usd: 42 }
};

// INITIATE KHALTI PAYMENT
router.post('/initiate', auth, async (req, res) => {
    try {
        const { plan } = req.body;
        
        if (!PLANS[plan]) {
            return res.status(400).json({ error: 'Invalid plan selected' });
        }
        
        const planDetails = PLANS[plan];
        const amountInPaise = planDetails.price * 100;
        
        const response = await axios.post(`${process.env.KHALTI_BASE_URL}/epayment/initiate/`, {
            return_url: `${process.env.FRONTEND_URL}/payment-success?plan=${plan}`,
            website_url: process.env.FRONTEND_URL,
            amount: amountInPaise,
            purchase_order_id: `CLUBEASA_${Date.now()}_${req.user._id}`,
            purchase_order_name: `${plan}_subscription`,
            customer_info: {
                name: req.user.name,
                email: req.user.email
            }
        }, {
            headers: {
                'Authorization': `Key ${process.env.KHALTI_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Store pidx temporarily
        await User.findByIdAndUpdate(req.user._id, {
            'paymentHistory': {
                $push: {
                    pidx: response.data.pidx,
                    plan: plan,
                    amount: planDetails.price,
                    status: 'pending'
                }
            }
        });
        
        res.json({
            success: true,
            payment_url: response.data.payment_url,
            pidx: response.data.pidx
        });
        
    } catch (error) {
        console.error('Payment initiation error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Payment initiation failed. Please try again.' });
    }
});

// VERIFY PAYMENT (Webhook callback)
router.post('/verify', async (req, res) => {
    try {
        const { pidx, status, transaction_id, plan } = req.body;
        
        if (status === 'Completed') {
            // Find user by pidx from paymentHistory
            const user = await User.findOne({ 'paymentHistory.pidx': pidx });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            const planDetails = PLANS[plan];
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + planDetails.days);
            
            // Update user subscription
            user.subscription = {
                plan: plan,
                startDate: startDate,
                endDate: endDate,
                status: 'active'
            };
            
            // Update payment history
            const paymentEntry = user.paymentHistory.find(p => p.pidx === pidx);
            if (paymentEntry) {
                paymentEntry.status = 'completed';
                paymentEntry.transactionId = transaction_id;
            }
            
            await user.save();
            
            // Create subscription record
            await Subscription.create({
                userId: user._id,
                plan: plan,
                amount: planDetails.price,
                paymentMethod: 'khalti',
                paymentId: transaction_id,
                pidx: pidx,
                startDate: startDate,
                endDate: endDate
            });
            
            res.json({ success: true, message: 'Subscription activated' });
        } else {
            res.json({ success: false, message: 'Payment not completed' });
        }
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// CHECK SUBSCRIPTION STATUS
router.get('/status', auth, async (req, res) => {
    const hasActive = req.user.hasActiveSubscription();
    res.json({
        hasActiveSubscription: hasActive,
        subscription: req.user.subscription,
        expiresIn: req.user.subscription.endDate ? 
            Math.max(0, Math.floor((new Date(req.user.subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0
    });
});

module.exports = router;