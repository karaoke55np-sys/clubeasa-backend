const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    subscription: {
        plan: {
            type: String,
            enum: ['free', 'monthly', 'quarterly', 'yearly'],
            default: 'free'
        },
        startDate: Date,
        endDate: Date,
        status: {
            type: String,
            enum: ['active', 'expired', 'cancelled'],
            default: 'active'
        }
    },
    progress: {
        module07: {
            bookmarks: { type: Object, default: {} },
            flags: { type: Array, default: [] },
            notes: { type: Object, default: {} },
            quizHistory: { type: Array, default: [] }
        },
        module10: {
            bookmarks: { type: Object, default: {} },
            flags: { type: Array, default: [] },
            notes: { type: Object, default: {} },
            quizHistory: { type: Array, default: [] }
        }
    },
    paymentHistory: [{
        transactionId: String,
        pidx: String,
        plan: String,
        amount: Number,
        date: { type: Date, default: Date.now },
        status: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: Date
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Compare password
userSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

// Check if subscription is active
userSchema.methods.hasActiveSubscription = function() {
    if (this.subscription.plan === 'free') return false;
    if (this.subscription.status !== 'active') return false;
    if (this.subscription.endDate && new Date() > this.subscription.endDate) {
        this.subscription.status = 'expired';
        return false;
    }
    return true;
};

module.exports = mongoose.model('User', userSchema);