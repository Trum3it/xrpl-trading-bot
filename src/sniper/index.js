const { getClient } = require('../xrpl/client');
const { getWallet } = require('../xrpl/wallet');
const { executeAMMBuy } = require('../xrpl/amm');
const { User } = require('../database/models');
const { detectNewTokensFromAMM } = require('./monitor');
const { evaluateToken, isTokenBlacklisted } = require('./evaluator');
const config = require('../config');

let sniperInterval = null;
let isRunning = false;

/**
 * Start the sniper
 */
async function startSniper(userId) {
    if (isRunning) {
        console.log('⚠️ Sniper is already running');
        return { success: false, error: 'Sniper is already running' };
    }

    try {
        const user = await User.findOne({ userId });
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        // Validate sniper settings
        if (!user.selectedSniperBuyMode && (!user.whiteListedTokens || user.whiteListedTokens.length === 0)) {
            return { success: false, error: 'No whitelisted tokens for whitelist-only mode' };
        }

        const snipeAmount = parseFloat(
            user.selectedSnipeAmount === 'custom' 
                ? user.selectedCustomSnipeAmount 
                : user.selectedSnipeAmount
        ) || 1;

        if (snipeAmount > config.trading.maxSnipeAmount) {
            return { 
                success: false, 
                error: `Snipe amount too high. Maximum: ${config.trading.maxSnipeAmount} XRP` 
            };
        }

        // Initialize sniper purchases array if needed
        if (!user.sniperPurchases) {
            user.sniperPurchases = [];
        }

        user.sniperActive = true;
        user.sniperStartTime = new Date();
        await user.save();

        isRunning = true;
        sniperInterval = setInterval(async () => {
            await monitorTokenMarkets(userId);
        }, config.sniper.checkInterval);

        console.log(`✅ Sniper started for user ${userId}`);
        return { success: true };
    } catch (error) {
        console.error('Error starting sniper:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Stop the sniper
 */
async function stopSniper(userId) {
    try {
        if (sniperInterval) {
            clearInterval(sniperInterval);
            sniperInterval = null;
        }

        const user = await User.findOne({ userId });
        if (user) {
            user.sniperActive = false;
            await user.save();
        }

        isRunning = false;
        console.log(`⏹️ Sniper stopped for user ${userId}`);
        return { success: true };
    } catch (error) {
        console.error('Error stopping sniper:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Monitor token markets and execute snipes
 */
async function monitorTokenMarkets(userId) {
    try {
        const user = await User.findOne({ userId });
        if (!user || !user.sniperActive) {
            if (sniperInterval) {
                clearInterval(sniperInterval);
                sniperInterval = null;
            }
            isRunning = false;
            return;
        }

        const client = await getClient();
        const newTokens = await detectNewTokensFromAMM(client);

        // Process up to MAX_TOKENS_PER_SCAN tokens
        for (let i = 0; i < Math.min(newTokens.length, config.sniper.maxTokensPerScan); i++) {
            const tokenInfo = newTokens[i];
            await evaluateAndSnipeToken(client, user, tokenInfo);
        }
    } catch (error) {
        console.error('❌ Monitor error:', error.message);
    }
}

/**
 * Evaluate and snipe a token
 */
async function evaluateAndSnipeToken(client, user, tokenInfo) {
    try {
        // Evaluate token
        const evaluation = await evaluateToken(client, user, tokenInfo);

        if (!evaluation.shouldSnipe) {
            console.log(`⏭️ Skipping ${tokenInfo.readableCurrency}: ${evaluation.reasons.join(', ')}`);
            return;
        }

        console.log(`✅ All checks passed for ${tokenInfo.readableCurrency}, executing snipe...`);

        // Execute snipe
        await executeSnipe(client, user, tokenInfo);
    } catch (error) {
        console.error(`❌ Error evaluating ${tokenInfo?.readableCurrency}:`, error.message);
    }
}

/**
 * Execute snipe transaction
 */
async function executeSnipe(client, user, tokenInfo) {
    try {
        const wallet = getWallet();
        
        // Get snipe amount
        let snipeAmount;
        if (user.selectedSnipeAmount === 'custom') {
            if (!user.selectedCustomSnipeAmount || isNaN(parseFloat(user.selectedCustomSnipeAmount))) {
                console.error('Invalid custom snipe amount');
                return;
            }
            snipeAmount = parseFloat(user.selectedCustomSnipeAmount);
        } else {
            snipeAmount = parseFloat(user.selectedSnipeAmount) || 1;
        }

        if (isNaN(snipeAmount) || snipeAmount <= 0) {
            console.error('Invalid snipe amount');
            return;
        }

        if (snipeAmount > config.trading.maxSnipeAmount) {
            console.error(`Snipe amount exceeds maximum: ${snipeAmount} > ${config.trading.maxSnipeAmount}`);
            return;
        }

        // Check balance
        const accountInfo = await client.request({
            command: 'account_info',
            account: wallet.address
        });

        const xrpBalance = parseFloat(accountInfo.result.account_data.Balance) / 1000000;
        const totalRequired = snipeAmount + 0.5; // Reserve 0.5 XRP for fees

        if (xrpBalance < totalRequired) {
            console.error(`Insufficient balance: ${xrpBalance} XRP < ${totalRequired} XRP required`);
            return;
        }

        // Check blacklist
        if (isTokenBlacklisted(user.blackListedTokens, tokenInfo.currency, tokenInfo.issuer)) {
            console.log(`🚫 Token ${tokenInfo.readableCurrency} is blacklisted`);
            return;
        }

        // Execute buy
        const buyResult = await executeAMMBuy(
            client,
            wallet,
            tokenInfo,
            snipeAmount,
            user.selectedSlippage || config.trading.defaultSlippage
        );

        if (buyResult.success) {
            // Record purchase
            if (!user.sniperPurchases) {
                user.sniperPurchases = [];
            }

            user.sniperPurchases.push({
                tokenSymbol: tokenInfo.readableCurrency,
                tokenAddress: tokenInfo.issuer,
                currency: tokenInfo.currency,
                issuer: tokenInfo.issuer,
                amount: snipeAmount,
                tokensReceived: buyResult.tokensReceived,
                timestamp: new Date(),
                txHash: buyResult.txHash,
                status: 'active'
            });

            // Record transaction
            user.transactions.push({
                type: 'snipe_buy',
                ourTxHash: buyResult.txHash,
                amount: snipeAmount,
                tokenSymbol: tokenInfo.readableCurrency,
                tokenAddress: tokenInfo.issuer,
                timestamp: new Date(),
                status: 'success',
                tokensReceived: buyResult.tokensReceived,
                xrpSpent: snipeAmount,
                actualRate: buyResult.actualRate
            });

            await user.save();

            console.log(`🎯 Snipe successful! ${tokenInfo.readableCurrency}`);
            console.log(`   TX: ${buyResult.txHash}`);
            console.log(`   Tokens: ${buyResult.tokensReceived}`);
            console.log(`   Rate: ${buyResult.actualRate} tokens/XRP`);
        } else {
            console.error(`❌ Snipe failed: ${buyResult.error}`);
        }
    } catch (error) {
        console.error('Error executing snipe:', error);
    }
}

module.exports = {
    startSniper,
    stopSniper,
    isRunning: () => isRunning
};

