const { hexToString } = require('../xrpl/utils');

/**
 * Detect new tokens from AMM create transactions
 */
async function detectNewTokensFromAMM(client) {
    try {
        const response = await client.request({
            command: 'ledger',
            ledger_index: 'validated',
            transactions: true,
            expand: true
        });

        const newTokens = [];
        const allTransactions = [];

        // Check last 4 ledgers
        for (let i = 0; i <= 3; i++) {
            try {
                const ledgerResponse = i === 0 ? response : await client.request({
                    command: 'ledger',
                    ledger_index: response.result.ledger.ledger_index - i,
                    transactions: true,
                    expand: true
                });
                
                const txWrappers = ledgerResponse.result.ledger.transactions || [];
                const txs = txWrappers
                    .filter(wrapper => wrapper.tx_json && wrapper.meta)
                    .map(wrapper => ({
                        ...wrapper.tx_json,
                        meta: wrapper.meta
                    }));

                allTransactions.push(...txs);
            } catch (error) {
                continue;
            }
        }

        // Extract AMMCreate transactions
        for (const tx of allTransactions) {
            if (tx.TransactionType === 'AMMCreate' && tx.meta?.TransactionResult === 'tesSUCCESS') {
                const tokenInfo = extractTokenFromAMMCreate(tx);
                if (tokenInfo) {
                    newTokens.push(tokenInfo);
                }
            }
        }

        return newTokens;
    } catch (error) {
        console.error('Error detecting AMM tokens:', error);
        return [];
    }
}

/**
 * Extract token information from AMMCreate transaction
 */
function extractTokenFromAMMCreate(tx) {
    try {
        const { Amount, Amount2 } = tx;
        let xrpAmount, tokenInfo;

        if (typeof Amount === 'string') {
            xrpAmount = parseInt(Amount) / 1000000; // Convert drops to XRP
            tokenInfo = Amount2;
        } else {
            xrpAmount = parseInt(Amount2) / 1000000;
            tokenInfo = Amount;
        }

        if (!tokenInfo || typeof tokenInfo === 'string') {
            return null;
        }

        return {
            currency: tokenInfo.currency,
            issuer: tokenInfo.issuer,
            readableCurrency: hexToString(tokenInfo.currency),
            initialLiquidity: xrpAmount,
            tokenAmount: tokenInfo.value,
            transactionHash: tx.hash || '',
            account: tx.Account
        };
    } catch (error) {
        return null;
    }
}

module.exports = {
    detectNewTokensFromAMM,
    extractTokenFromAMMCreate
};

