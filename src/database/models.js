const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    walletAddress: { type: String, required: true, unique: true },
    seed: { type: String, required: true },
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true },
    
    balance: {
        XRP: { type: Number, default: 0 },
        USD: { type: Number, default: 0 }
    },
    
    tokens: [{
        currency: String,
        issuer: String,
        balance: String,
        lastUpdated: { type: Date, default: Date.now }
    }],
    
    transactions: [{
        type: { type: String },
        originalTxHash: { type: String },
        ourTxHash: { type: String },
        amount: { type: Number },
        tokenSymbol: { type: String },
        tokenAddress: { type: String },
        timestamp: { type: Date, default: Date.now },
        status: { type: String },
        traderAddress: { type: String },
        tokensReceived: { type: Number, default: 0 },
        actualRate: { type: String, default: '0' },
        xrpSpent: { type: Number, default: 0 },
        originalMethod: { type: String },
        originalXrpAmount: { type: Number }
    }],

    selectedSlippage: {
        type: Number,
        default: 4.0,
        min: 0.1,
        max: 50.0
    },

    // Copy Trading Settings
    copyTradersAddresses: { type: [String], default: [] },
    copyTraderActive: { type: Boolean, default: false },
    copyTradingStartTime: { type: Date, default: Date.now },
    selectedTradingAmountMode: String,
    selectedMatchTraderPercentage: Number,
    selectedMaxSpendPerTrade: Number,
    selectedFixedAmountForCopyTrading: Number,

    // Sniper Settings
    sniperActive: { type: Boolean, default: false },
    sniperStartTime: { type: Date },
    selectedSniperBuyMode: { type: Boolean, default: false },
    selectedSnipeAmount: String,
    selectedCustomSnipeAmount: String,
    selectedMinimumPoolLiquidity: Number,
    selectedRiskScore: String,
    selectedSniperTransactionDevides: Number,
    sniperPurchases: [{
        tokenSymbol: String,
        tokenAddress: String,
        amount: Number,
        timestamp: { type: Date, default: Date.now },
        txHash: String
    }],

    // Token Lists
    whiteListedTokens: [{
        currency: String,
        issuer: String,
        balance: String,
        lastUpdated: { type: Date, default: Date.now }
    }],
    
    blackListedTokens: [{
        currency: { type: String, required: true },
        issuer: { type: String, required: true },
        readableCurrency: { type: String },
        lastUpdated: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

const User = mongoose.model('User', userSchema);

module.exports = {
    User
};

