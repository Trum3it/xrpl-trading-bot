const XRPLAMMChecker = require('../../filterAmmCreate');
const { checkLPBurnStatus } = require('../xrpl/amm');
const { getReadableCurrency } = require('../xrpl/utils');

/**
 * Check if account is a first-time AMM creator
 */
async function isFirstTimeAMMCreator(accountAddress) {
    try {
        const checker = new XRPLAMMChecker();
        await checker.connect();
        
        const result = await checker.getAccountAMMTransactions(accountAddress);
        const ammCreateCount = result.ammCreateTransactions.length;
        
        checker.close();
        
        // Return true if this is the first AMMCreate transaction (count <= 1)
        return ammCreateCount <= 1;
    } catch (error) {
        console.error('Error checking AMM creator history:', error.message);
        // If we can't check, be conservative and skip
        return false;
    }
}

/**
 * Evaluate token for sniping based on user criteria
 */
async function evaluateToken(client, user, tokenInfo) {
    const evaluation = {
        shouldSnipe: false,
        reasons: []
    };

    // Check if already owned
    const alreadyOwned = user.sniperPurchases?.some(p =>
        p.tokenAddress === tokenInfo.issuer && 
        p.tokenSymbol === tokenInfo.currency &&
        p.status === 'active'
    );

    if (alreadyOwned) {
        evaluation.reasons.push('Token already in active purchases');
        return evaluation;
    }

    // Whitelist check (if whitelist-only mode)
    if (user.selectedSniperBuyMode === false) {
        const isWhitelisted = user.whiteListedTokens?.some(token =>
            token.currency === tokenInfo.currency && token.issuer === tokenInfo.issuer
        );

        if (!isWhitelisted) {
            evaluation.reasons.push('Token not in whitelist');
            return evaluation;
        }
    }

    // Rugcheck (if auto-buy mode)
    if (user.selectedSniperBuyMode === true) {
        const minLiquidity = user.selectedMinimumPoolLiquidity || 100;
        
        if (tokenInfo.initialLiquidity === null) {
            // Accept tokens with null initial liquidity
            evaluation.reasons.push('Null initial liquidity accepted');
        } else if (tokenInfo.initialLiquidity < minLiquidity) {
            evaluation.reasons.push(`Insufficient liquidity: ${tokenInfo.initialLiquidity} XRP < ${minLiquidity} XRP`);
            return evaluation;
        } else {
            evaluation.reasons.push(`Liquidity check passed: ${tokenInfo.initialLiquidity} XRP`);
        }
    }

    // First-time creator check
    const isFirstTime = await isFirstTimeAMMCreator(tokenInfo.account);
    if (!isFirstTime) {
        evaluation.reasons.push('Not a first-time AMM creator');
        return evaluation;
    }
    evaluation.reasons.push('First-time creator check passed');

    // LP burn check
    const lpBurnCheck = await checkLPBurnStatus(client, tokenInfo);
    if (!lpBurnCheck.lpBurned) {
        evaluation.reasons.push(`LP tokens not burned yet (LP Balance: ${lpBurnCheck.lpBalance})`);
        return evaluation;
    }
    evaluation.reasons.push('LP burn check passed');

    // All checks passed
    evaluation.shouldSnipe = true;
    return evaluation;
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

module.exports = {
    isFirstTimeAMMCreator,
    evaluateToken,
    isTokenBlacklisted
};

