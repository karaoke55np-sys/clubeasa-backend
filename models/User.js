const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Per-module subscription record
const moduleAccessSchema = new mongoose.Schema({
    expiry:      { type: Date,   required: true },
    plan:        { type: String, default: null },
    purchasedAt: { type: Date,   default: Date.now },
    months:      { type: Number, default: 1 },
}, { _id: false });

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },

    // Legacy / global fields (kept for backward compatibility)
    isSubscribed: { type: Boolean, default: false },
    subscriptionPlan: { type: String, default: null },
    subscriptionStart: { type: Date, default: null },
    subscriptionExpiry: { type: Date, default: null },
    subscribedModules: { type: [String], default: [] },
    lsOrderId: { type: String, default: null },

    // NEW: per-module access (key = module id, e.g. '07', '10')
    moduleAccess: { type: Map, of: moduleAccessSchema, default: {} },

    resetPasswordToken: { type: String, default: null },
    resetPasswordExpiry: { type: Date, default: null }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Returns array of currently-active module ids
userSchema.methods.getActiveModules = function () {
    const now = new Date();
    const active = [];
    if (this.moduleAccess) {
        for (const [mod, info] of this.moduleAccess.entries()) {
            if (info.expiry && info.expiry > now) active.push(mod);
        }
    }
    return active;
};

module.exports = mongoose.model('User', userSchema);