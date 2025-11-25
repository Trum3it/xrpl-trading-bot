const { getTransactionTime, hexToString } = require('../xrpl/utils');

const processedTransactions = new Set();

/**
 * Check trader transactions for trading activity
 */
async function checkTraderTransactions(client, traderAddress, startTime = null) {
    try {
        const response = await client.request({
            command: 'account_tx',
            account: traderAddress,
            limit: 20,
            ledger_index_min: -1,
            ledger_index_max: -1,
            forward: false
        });

        const transactions = response?.result?.transactions || [];
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000);

        const newTrades = [];

        for (const txData of transactions) {
            const tx = txData?.tx || txData?.tx_json || txData;
            const meta = txData?.meta;

            const txHash = tx?.hash || txData?.hash;
            if (!txHash) {
                continue;
            }

            // Skip if already processed
            if (processedTransactions.has(txHash)) {
                continue;
            }

            // Skip if transaction failed
            if (meta?.TransactionResult !== 'tesSUCCESS') {
                continue;
            }

            // Time filtering
            const txTime = getTransactionTime(txData);
            if (txTime && txTime < oneMinuteAgo) {
                continue;
            }

            // Skip transactions before copy trading started
            if (startTime && txTime && txTime < startTime) {
                continue;
            }

            // Detect trading activity
            const tradeInfo = detectTradingActivity(tx, meta, traderAddress);
            if (tradeInfo) {
                processedTransactions.add(txHash);
                newTrades.push({
                    txHash,
                    tx,
                    meta,
                    tradeInfo
                });
            }
        }

        // Clean up old processed transactions
        if (processedTransactions.size > 1000) {
            const oldEntries = Array.from(processedTransactions).slice(0, 500);
            oldEntries.forEach(entry => processedTransactions.delete(entry));
        }

        return newTrades;
    } catch (error) {
        console.error(`Error checking transactions for ${traderAddress}:`, error.message);
        return [];
    }
}

/**
 * Detect trading activity from transaction
 */
function detectTradingActivity(tx, meta, traderAddress) {
    try {
        if (!tx || !meta || tx.Account !== traderAddress) return null;

        // Check for AMM swaps in Payment transactions
        if (tx.TransactionType === 'Payment') {
            return parsePaymentTransaction(tx, meta);
        }

        // Check for consumed offers
        return parseConsumedOffers(tx, meta, traderAddress);
    } catch (error) {
        console.error('Error detecting trading activity:', error);
        return null;
    }
}

/**
 * Parse Payment transaction for AMM swaps
 */
function parsePaymentTransaction(tx, meta) {
    try {
        // Check if this is an AMM swap
        if (!meta.AffectedNodes) return null;

        let xrpAmount = 0;
        let tokenAmount = 0;
        let currency = null;
        let issuer = null;
        let tradeType = null;

        // Look for AMM balance changes
        for (const node of meta.AffectedNodes) {
            const modifiedNode = node.ModifiedNode;
            if (modifiedNode && modifiedNode.LedgerEntryType === 'AMM') {
                const prevFields = modifiedNode.PreviousFields;
                const finalFields = modifiedNode.FinalFields;

                if (prevFields && finalFields) {
                    // Check for XRP amount change
                    if (prevFields.amount && finalFields.amount) {
                        const prevAmount = typeof prevFields.amount === 'string' 
                            ? parseInt(prevFields.amount) / 1000000 
                            : parseFloat(prevFields.amount);
                        const finalAmount = typeof finalFields.amount === 'string'
                            ? parseInt(finalFields.amount) / 1000000
                            : parseFloat(finalFields.amount);
                        
                        const diff = finalAmount - prevAmount;
                        if (Math.abs(diff) > 0.000001) {
                            if (diff > 0) {
                                // XRP added to pool (sell)
                                xrpAmount = Math.abs(diff);
                                tradeType = 'sell';
                            } else {
                                // XRP removed from pool (buy)
                                xrpAmount = Math.abs(diff);
                                tradeType = 'buy';
                            }
                        }
                    }

                    // Check for token amount change
                    if (prevFields.amount2 && finalFields.amount2) {
                        const prevAmount2 = prevFields.amount2.value || prevFields.amount2;
                        const finalAmount2 = finalFields.amount2.value || finalFields.amount2;
                        
                        const prevToken = typeof prevAmount2 === 'string' ? parseFloat(prevAmount2) : prevAmount2;
                        const finalToken = typeof finalAmount2 === 'string' ? parseFloat(finalAmount2) : finalAmount2;
                        
                        const diff = finalToken - prevToken;
                        if (Math.abs(diff) > 0.000001) {
                            tokenAmount = Math.abs(diff);
                            if (finalFields.amount2.currency) {
                                currency = finalFields.amount2.currency;
                                issuer = finalFields.amount2.issuer;
                            }
                        }
                    }
                }
            }
        }

        if (xrpAmount > 0 && tokenAmount > 0 && currency && issuer) {
            return {
                type: tradeType,
                currency: currency,
                issuer: issuer,
                readableCurrency: currency.length === 40 ? hexToString(currency) : currency,
                xrpAmount: xrpAmount,
                tokenAmount: tokenAmount,
                method: 'AMM'
            };
        }

        return null;
    } catch (error) {
        console.error('Error parsing payment transaction:', error);
        return null;
    }
}

/**
 * Parse consumed offers from transaction metadata
 */
function parseConsumedOffers(tx, meta, traderAddress) {
    try {
        if (!meta.AffectedNodes) return null;

        let totalXRP = 0;
        let totalTokens = 0;
        let currency = null;
        let issuer = null;
        let tradeType = null;

        for (const node of meta.AffectedNodes) {
            const deletedNode = node.DeletedNode;
            const modifiedNode = node.ModifiedNode;

            if (deletedNode && deletedNode.LedgerEntryType === 'Offer') {
                const offer = deletedNode.FinalFields || deletedNode.PreviousFields;
                if (offer) {
                    const analysis = analyzeOffer(offer);
                    if (analysis.xrp && analysis.tokens && analysis.curr) {
                        totalXRP += analysis.xrp;
                        totalTokens += analysis.tokens;
                        currency = analysis.curr;
                        issuer = analysis.iss;
                        tradeType = analysis.type;
                    }
                }
            }

            if (modifiedNode && modifiedNode.LedgerEntryType === 'Offer') {
                const prevFields = modifiedNode.PreviousFields;
                const finalFields = modifiedNode.FinalFields;
                if (prevFields && finalFields) {
                    const consumedXRP = calculateConsumedXRP(prevFields, finalFields);
                    const consumedTokens = calculateConsumedTokens(prevFields, finalFields);
                    if (consumedXRP && consumedTokens) {
                        totalXRP += consumedXRP.amount;
                        totalTokens += consumedTokens.amount;
                        currency = consumedTokens.currency;
                        issuer = consumedTokens.issuer;
                        tradeType = consumedXRP.type;
                    }
                }
            }
        }

        if (totalXRP > 0 && totalTokens > 0 && currency && issuer) {
            return {
                type: tradeType,
                currency: currency,
                issuer: issuer,
                readableCurrency: currency.length === 40 ? hexToString(currency) : currency,
                xrpAmount: totalXRP,
                tokenAmount: totalTokens,
                method: 'DEX'
            };
        }

        return null;
    } catch (error) {
        console.error('Error parsing consumed offers:', error);
        return null;
    }
}

/**
 * Analyze offer to extract trade information
 */
function analyzeOffer(offer) {
    try {
        const takerGets = offer.TakerGets;
        const takerPays = offer.TakerPays;

        let xrp = 0;
        let tokens = 0;
        let curr = null;
        let iss = null;
        let type = null;

        // Check if TakerGets is XRP
        if (typeof takerGets === 'string') {
            xrp = parseInt(takerGets) / 1000000;
            if (takerPays && typeof takerPays === 'object') {
                tokens = parseFloat(takerPays.value || takerPays);
                curr = takerPays.currency;
                iss = takerPays.issuer;
                type = 'sell'; // Selling tokens for XRP
            }
        }
        // Check if TakerPays is XRP
        else if (typeof takerPays === 'string') {
            xrp = parseInt(takerPays) / 1000000;
            if (takerGets && typeof takerGets === 'object') {
                tokens = parseFloat(takerGets.value || takerGets);
                curr = takerGets.currency;
                iss = takerGets.issuer;
                type = 'buy'; // Buying tokens with XRP
            }
        }

        return { xrp, tokens, curr, iss, type };
    } catch (error) {
        return { xrp: 0, tokens: 0, curr: null, iss: null, type: null };
    }
}

/**
 * Calculate consumed XRP from offer changes
 */
function calculateConsumedXRP(prevFields, finalFields) {
    try {
        const prevTakerGets = prevFields.TakerGets;
        const finalTakerGets = finalFields.TakerGets;
        const prevTakerPays = prevFields.TakerPays;
        const finalTakerPays = finalFields.TakerPays;

        let consumed = 0;
        let type = null;

        // XRP in TakerGets
        if (typeof prevTakerGets === 'string' && typeof finalTakerGets === 'string') {
            const prev = parseInt(prevTakerGets) / 1000000;
            const final = parseInt(finalTakerGets) / 1000000;
            consumed = prev - final;
            type = 'sell';
        }
        // XRP in TakerPays
        else if (typeof prevTakerPays === 'string' && typeof finalTakerPays === 'string') {
            const prev = parseInt(prevTakerPays) / 1000000;
            const final = parseInt(finalTakerPays) / 1000000;
            consumed = prev - final;
            type = 'buy';
        }

        return consumed > 0 ? { amount: consumed, type } : null;
    } catch (error) {
        return null;
    }
}

/**
 * Calculate consumed tokens from offer changes
 */
function calculateConsumedTokens(prevFields, finalFields) {
    try {
        const prevTakerGets = prevFields.TakerGets;
        const finalTakerGets = finalFields.TakerGets;
        const prevTakerPays = prevFields.TakerPays;
        const finalTakerPays = finalFields.TakerPays;

        let consumed = 0;
        let currency = null;
        let issuer = null;

        // Token in TakerGets
        if (prevTakerGets && typeof prevTakerGets === 'object' && 
            finalTakerGets && typeof finalTakerGets === 'object') {
            const prev = parseFloat(prevTakerGets.value || prevTakerGets);
            const final = parseFloat(finalTakerGets.value || finalTakerGets);
            consumed = prev - final;
            currency = finalTakerGets.currency || prevTakerGets.currency;
            issuer = finalTakerGets.issuer || prevTakerGets.issuer;
        }
        // Token in TakerPays
        else if (prevTakerPays && typeof prevTakerPays === 'object' && 
                 finalTakerPays && typeof finalTakerPays === 'object') {
            const prev = parseFloat(prevTakerPays.value || prevTakerPays);
            const final = parseFloat(finalTakerPays.value || finalTakerPays);
            consumed = prev - final;
            currency = finalTakerPays.currency || prevTakerPays.currency;
            issuer = finalTakerPays.issuer || prevTakerPays.issuer;
        }

        return consumed > 0 ? { amount: consumed, currency, issuer } : null;
    } catch (error) {
        return null;
    }
}


module.exports = {
    checkTraderTransactions
};

