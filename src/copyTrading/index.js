const { getClient } = require('../xrpl/client');
const { getWallet } = require('../xrpl/wallet');
const { User } = require('../database/models');
const { checkTraderTransactions } = require('./monitor');
const { 
    calculateCopyTradeAmount, 
    executeCopyBuyTrade, 
    executeCopySellTrade,
    isTokenBlacklisted,
    wasTransactionCopied
} = require('./executor');
const config = require('../config');

let copyTradingIntervals = new Map();
let isRunning = false;

/**
 * Start copy trading
 */
async function startCopyTrading(userId) {
    try {
        const user = await User.findOne({ userId });
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        if (user.copyTraderActive) {
            return { success: false, error: 'Copy trading is already active' };
        }

        // Validate settings
        if (!user.copyTradersAddresses || user.copyTradersAddresses.length === 0) {
            return { success: false, error: 'No traders added. Please add trader addresses first' };
        }

        user.copyTraderActive = true;
        user.copyTradingStartTime = new Date();
        await user.save();

        // Start monitoring interval
        const interval = setInterval(async () => {
            await monitorTraders(userId);
        }, config.copyTrading.checkInterval);

        copyTradingIntervals.set(userId, interval);
        isRunning = true;

        console.log(`✅ Copy trading started for user ${userId}`);
        console.log(`   Monitoring ${user.copyTradersAddresses.length} trader(s)`);
        
        return { success: true };
    } catch (error) {
        console.error('Error starting copy trading:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Stop copy trading
 */
async function stopCopyTrading(userId) {
    try {
        const interval = copyTradingIntervals.get(userId);
        if (interval) {
            clearInterval(interval);
            copyTradingIntervals.delete(userId);
        }

        const user = await User.findOne({ userId });
        if (user) {
            user.copyTraderActive = false;
            await user.save();
        }

        if (copyTradingIntervals.size === 0) {
            isRunning = false;
        }

        console.log(`⏹️ Copy trading stopped for user ${userId}`);
        return { success: true };
    } catch (error) {
        console.error('Error stopping copy trading:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Monitor traders for new transactions
 */
async function monitorTraders(userId) {
    try {
        const user = await User.findOne({ userId });
        if (!user || !user.copyTraderActive) {
            // Stop monitoring if user disabled copy trading
            const interval = copyTradingIntervals.get(userId);
            if (interval) {
                clearInterval(interval);
                copyTradingIntervals.delete(userId);
            }
            return;
        }

        if (!user.copyTradersAddresses || user.copyTradersAddresses.length === 0) {
            return;
        }

        const client = await getClient();

        // Monitor each trader
        for (const traderAddress of user.copyTradersAddresses) {
            await checkAndCopyTrades(client, user, traderAddress);
        }
    } catch (error) {
        console.error('Error monitoring traders:', error.message);
    }
}

/**
 * Check and copy trades from a trader
 */
async function checkAndCopyTrades(client, user, traderAddress) {
    try {
        const newTrades = await checkTraderTransactions(
            client,
            traderAddress,
            user.copyTradingStartTime
        );

        for (const tradeData of newTrades) {
            const { txHash, tx, meta, tradeInfo } = tradeData;

            // Check if already copied
            if (wasTransactionCopied(user.transactions, txHash)) {
                continue;
            }

            // Check blacklist
            if (isTokenBlacklisted(
                user.blackListedTokens,
                tradeInfo.currency,
                tradeInfo.issuer
            )) {
                console.log(`🚫 Skipping blacklisted token: ${tradeInfo.readableCurrency}`);
                continue;
            }

            // Calculate copy trade amount
            const tradeAmount = calculateCopyTradeAmount(user, tradeInfo);
            if (!tradeAmount || tradeAmount <= 0) {
                console.log(`⏭️ Skipping trade: calculated amount is ${tradeAmount}`);
                continue;
            }

            // Execute copy trade
            await executeCopyTrade(client, user, traderAddress, tradeInfo, tradeAmount, txHash);
        }
    } catch (error) {
        console.error(`Error checking trades for ${traderAddress}:`, error.message);
    }
}

/**
 * Execute copy trade
 */
async function executeCopyTrade(client, user, traderAddress, tradeInfo, tradeAmount, originalTxHash) {
    try {
        const wallet = getWallet();
        let copyResult;

        if (tradeInfo.type === 'buy') {
            copyResult = await executeCopyBuyTrade(client, wallet, user, tradeInfo, tradeAmount);
        } else if (tradeInfo.type === 'sell') {
            // For sell, we need to calculate token amount based on user's holdings
            // This is simplified - in production, you'd check user's token balance
            const tokenAmount = tradeAmount; // Simplified
            copyResult = await executeCopySellTrade(client, wallet, user, tradeInfo, tokenAmount);
        } else {
            console.log(`⏭️ Unknown trade type: ${tradeInfo.type}`);
            return;
        }

        if (copyResult && copyResult.success) {
            // Record transaction
            user.transactions.push({
                type: `copy_${tradeInfo.type}`,
                originalTxHash: originalTxHash,
                ourTxHash: copyResult.txHash,
                amount: tradeAmount,
                tokenSymbol: tradeInfo.readableCurrency,
                tokenAddress: tradeInfo.issuer,
                timestamp: new Date(),
                status: 'success',
                traderAddress: traderAddress,
                tokensReceived: copyResult.tokensReceived || 0,
                xrpSpent: copyResult.xrpSpent || tradeAmount,
                actualRate: copyResult.actualRate || '0'
            });

            await user.save();

            console.log(`✅ Copy trade successful!`);
            console.log(`   Trader: ${traderAddress.slice(0, 8)}...`);
            console.log(`   Token: ${tradeInfo.readableCurrency}`);
            console.log(`   Type: ${tradeInfo.type.toUpperCase()}`);
            console.log(`   Amount: ${tradeAmount} XRP`);
            console.log(`   TX: ${copyResult.txHash}`);
        } else {
            console.error(`❌ Copy trade failed: ${copyResult?.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error executing copy trade:', error);
    }
}

module.exports = {
    startCopyTrading,
    stopCopyTrading,
    isRunning: () => isRunning
};

