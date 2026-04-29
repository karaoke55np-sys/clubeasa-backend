const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    plan: {
        type: String,
        enum: ['monthly', 'quarterly', 'yearly'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'NPR'
    },
    paymentMethod: {
        type: String,
        enum: ['khalti', 'stripe', 'esewa'],
        required: true
    },
    paymentId: String,
    pidx: String,
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'cancelled', 'refunded'],
        default: 'active'
    }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);