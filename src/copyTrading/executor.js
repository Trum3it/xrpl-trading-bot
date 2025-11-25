const { executeAMMBuy, executeAMMSell } = require('../xrpl/amm');
const { getReadableCurrency } = require('../xrpl/utils');
const config = require('../config');

/**
 * Calculate copy trade amount based on user settings
 */
function calculateCopyTradeAmount(user, tradeInfo) {
    try {
        const mode = user.selectedTradingAmountMode;

        if (mode === 'fixed') {
            const fixedAmount = user.selectedFixedAmountForCopyTrading || 1;
            return fixedAmount;
        }

        if (mode === 'percentage') {
            const percentage = user.selectedMatchTraderPercentage || 10;
            const traderAmount = tradeInfo.xrpAmount || 0;
            const calculatedAmount = (traderAmount * percentage) / 100;

            // Apply max spend limit if set
            const maxSpend = user.selectedMaxSpendPerTrade;
            if (maxSpend && calculatedAmount > maxSpend) {
                return maxSpend;
            }

            return calculatedAmount;
        }

        // Default: use fixed amount or 10% of trader's amount
        const defaultAmount = user.selectedFixedAmountForCopyTrading || 
                             ((tradeInfo.xrpAmount || 0) * 0.1);
        return defaultAmount;
    } catch (error) {
        console.error('Error calculating copy trade amount:', error);
        return 0;
    }
}

/**
 * Execute copy buy trade
 */
async function executeCopyBuyTrade(client, wallet, user, tradeInfo, xrpAmount) {
    try {
        const tokenInfo = {
            currency: tradeInfo.currency,
            issuer: tradeInfo.issuer,
            readableCurrency: tradeInfo.readableCurrency
        };

        const buyResult = await executeAMMBuy(
            client,
            wallet,
            tokenInfo,
            xrpAmount,
            user.selectedSlippage || config.trading.defaultSlippage
        );

        if (buyResult.success) {
            return {
                success: true,
                txHash: buyResult.txHash,
                tokensReceived: buyResult.tokensReceived,
                actualRate: buyResult.actualRate,
                xrpSpent: buyResult.xrpSpent || xrpAmount
            };
        } else {
            console.error(`Copy buy failed: ${buyResult.error}`);
            return {
                success: false,
                error: buyResult.error
            };
        }
    } catch (error) {
        console.error('Error executing copy buy trade:', error);
        return {
            success: false,
            error: error.message || 'Copy buy execution failed'
        };
    }
}

/**
 * Execute copy sell trade
 */
async function executeCopySellTrade(client, wallet, user, tradeInfo, tokenAmount) {
    try {
        const tokenInfo = {
            currency: tradeInfo.currency,
            issuer: tradeInfo.issuer,
            readableCurrency: tradeInfo.readableCurrency
        };

        const sellResult = await executeAMMSell(
            client,
            wallet,
            tokenInfo,
            tokenAmount,
            user.selectedSlippage || config.trading.defaultSlippage
        );

        if (sellResult.success) {
            return {
                success: true,
                txHash: sellResult.txHash,
                xrpReceived: sellResult.xrpReceived,
                tokensSold: sellResult.tokensSold,
                actualRate: sellResult.actualRate
            };
        } else {
            console.error(`Copy sell failed: ${sellResult.error}`);
            return {
                success: false,
                error: sellResult.error
            };
        }
    } catch (error) {
        console.error('Error executing copy sell trade:', error);
        return {
            success: false,
            error: error.message || 'Copy sell execution failed'
        };
    }
}

/**
 * Check if token is blacklisted
 */
function isTokenBlacklisted(blackListedTokens, currency, issuer) {
    if (!blackListedTokens || blackListedTokens.length === 0) {
        return false;
    }

    return blackListedTokens.some(token =>
        token.currency === currency && token.issuer === issuer
    );
}

/**
 * Check if transaction was already copied
 */
function wasTransactionCopied(transactions, originalTxHash) {
    return transactions.some(t => t.originalTxHash === originalTxHash);
}

module.exports = {
    calculateCopyTradeAmount,
    executeCopyBuyTrade,
    executeCopySellTrade,
    isTokenBlacklisted,
    wasTransactionCopied
};

