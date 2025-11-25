const { xrpToDrops } = require('xrpl');
const { getReadableCurrency, formatTokenAmountSimple } = require('./utils');

/**
 * Execute AMM buy transaction
 */
async function executeAMMBuy(client, wallet, tokenInfo, xrpAmount, slippage = 4.0) {
    try {
        // Check if trust line exists
        let hasTrustLine = false;
        let currentTokenBalance = 0;

        try {
            const accountLines = await client.request({
                command: 'account_lines',
                account: wallet.address,
                ledger_index: 'validated'
            });

            const existingLine = accountLines.result.lines.find(line =>
                line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
            );

            if (existingLine) {
                hasTrustLine = true;
                currentTokenBalance = parseFloat(existingLine.balance);
            }
        } catch (error) {
            // Account not activated or no trust lines, will create trust line
        }

        // Create trust line if needed
        if (!hasTrustLine) {
            const trustSetTx = {
                TransactionType: 'TrustSet',
                Account: wallet.address,
                LimitAmount: {
                    currency: tokenInfo.currency,
                    issuer: tokenInfo.issuer,
                    value: '100000'
                }
            };

            const trustPrepared = await client.autofill(trustSetTx);
            const trustSigned = wallet.sign(trustPrepared);
            const trustResult = await client.submitAndWait(trustSigned.tx_blob);

            if (trustResult.result.meta.TransactionResult !== 'tesSUCCESS') {
                return {
                    success: false,
                    error: `Failed to create trust line: ${trustResult.result.meta.TransactionResult}`
                };
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Get AMM pool info
        const ammInfo = await client.request({
            command: 'amm_info',
            asset: { currency: 'XRP' },
            asset2: { currency: tokenInfo.currency, issuer: tokenInfo.issuer }
        });

        if (!ammInfo.result || !ammInfo.result.amm) {
            return {
                success: false,
                error: 'AMM pool not found for this token pair'
            };
        }

        const amm = ammInfo.result.amm;
        const xrpAmountDrops = parseFloat(amm.amount);
        const tokenAmount = parseFloat(amm.amount2.value);
        const currentRate = tokenAmount / (xrpAmountDrops / 1000000);
        const estimatedTokens = xrpAmount * currentRate;
        const slippageMultiplier = (100 - slippage) / 100;
        const minTokensExpected = estimatedTokens * slippageMultiplier;
        const formattedMinTokens = formatTokenAmountSimple(minTokensExpected);

        // Execute buy transaction
        const paymentTx = {
            TransactionType: 'Payment',
            Account: wallet.address,
            Destination: wallet.address,
            Amount: {
                currency: tokenInfo.currency,
                issuer: tokenInfo.issuer,
                value: formattedMinTokens
            },
            SendMax: xrpToDrops(xrpAmount.toString())
        };

        const prepared = await client.autofill(paymentTx);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get final balance
            const finalBalance = await client.request({
                command: 'account_lines',
                account: wallet.address,
                ledger_index: 'validated'
            });

            const tokenLine = finalBalance.result.lines.find(line =>
                line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
            );

            const tokensReceived = tokenLine ? (parseFloat(tokenLine.balance) - currentTokenBalance) : 0;
            const actualRate = tokensReceived > 0 ? (tokensReceived / xrpAmount) : 0;
            const actualSlippage = ((1 - (actualRate / currentRate)) * 100).toFixed(2);

            return {
                success: true,
                txHash: result.result.hash,
                tokensReceived: tokensReceived,
                xrpSpent: xrpAmount,
                actualRate: actualRate.toFixed(8),
                expectedTokens: estimatedTokens.toFixed(6),
                actualSlippage: actualSlippage,
                slippageUsed: slippage,
                method: 'AMM'
            };
        } else {
            return {
                success: false,
                error: result.result.meta.TransactionResult
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Execute AMM sell transaction
 */
async function executeAMMSell(client, wallet, tokenInfo, tokenAmount, slippage = 4.0) {
    try {
        // Check token balance
        let currentTokenBalance = 0;
        let hasTrustLine = false;

        const accountLines = await client.request({
            command: 'account_lines',
            account: wallet.address,
            ledger_index: 'validated'
        });

        const existingLine = accountLines.result.lines.find(line =>
            line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
        );

        if (!existingLine) {
            return {
                success: false,
                error: `No trust line found for ${getReadableCurrency(tokenInfo.currency)}. Cannot sell tokens you don't have.`
            };
        }

        hasTrustLine = true;
        currentTokenBalance = parseFloat(existingLine.balance);

        if (currentTokenBalance < tokenAmount) {
            return {
                success: false,
                error: `Insufficient token balance. You have ${currentTokenBalance} ${getReadableCurrency(tokenInfo.currency)} but trying to sell ${tokenAmount}`
            };
        }

        // Get AMM pool info
        const ammInfo = await client.request({
            command: 'amm_info',
            asset: { currency: 'XRP' },
            asset2: { currency: tokenInfo.currency, issuer: tokenInfo.issuer }
        });

        if (!ammInfo.result || !ammInfo.result.amm) {
            return {
                success: false,
                error: `No AMM pool found for ${getReadableCurrency(tokenInfo.currency)}. Cannot sell via AMM.`
            };
        }

        const amm = ammInfo.result.amm;
        const xrpAmountDrops = parseFloat(amm.amount);
        const tokenAmountInPool = parseFloat(amm.amount2.value);
        const currentRate = (xrpAmountDrops / 1000000) / tokenAmountInPool;
        const estimatedXrp = tokenAmount * currentRate;
        const slippageMultiplier = (100 - slippage) / 100;
        const minXrpExpected = estimatedXrp * slippageMultiplier;
        const formattedMinXrp = parseFloat((minXrpExpected).toFixed(6));
        const formattedTokenAmount = formatTokenAmountSimple(tokenAmount);

        // Execute sell transaction
        const paymentTx = {
            TransactionType: 'Payment',
            Account: wallet.address,
            Destination: wallet.address,
            Amount: xrpToDrops(formattedMinXrp.toString()),
            SendMax: {
                currency: tokenInfo.currency,
                issuer: tokenInfo.issuer,
                value: formattedTokenAmount
            },
            DeliverMin: xrpToDrops(formattedMinXrp.toString()),
            Flags: 0x00020000
        };

        const paymentPrepared = await client.autofill(paymentTx);
        const paymentSigned = wallet.sign(paymentPrepared);
        const paymentResult = await client.submitAndWait(paymentSigned.tx_blob);

        if (paymentResult.result.meta.TransactionResult === 'tesSUCCESS') {
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get final balance
            const finalTokenBalance = await client.request({
                command: 'account_lines',
                account: wallet.address,
                ledger_index: 'validated'
            });

            const tokenLine = finalTokenBalance.result.lines.find(line =>
                line.currency === tokenInfo.currency && line.account === tokenInfo.issuer
            );

            const remainingTokenBalance = tokenLine ? parseFloat(tokenLine.balance) : 0;
            const tokensSold = currentTokenBalance - remainingTokenBalance;
            const estimatedXrpReceived = tokensSold * currentRate;
            const actualRate = estimatedXrpReceived / tokensSold;
            const actualSlippage = ((1 - (actualRate / currentRate)) * 100).toFixed(2);

            return {
                success: true,
                txHash: paymentResult.result.hash,
                tokensSold: tokensSold.toString(),
                xrpReceived: estimatedXrpReceived.toFixed(6),
                expectedXrp: estimatedXrp.toFixed(6),
                actualRate: actualRate.toFixed(8),
                marketRate: currentRate.toFixed(8),
                actualSlippage: actualSlippage,
                slippageUsed: slippage,
                newTokenBalance: remainingTokenBalance.toString()
            };
        } else {
            return {
                success: false,
                error: `AMM transaction failed: ${paymentResult.result.meta.TransactionResult}`
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to execute AMM sell transaction'
        };
    }
}

/**
 * Get AMM pool information
 */
async function getAMMInfo(client, tokenInfo) {
    try {
        const ammInfo = await client.request({
            command: 'amm_info',
            asset: { currency: 'XRP' },
            asset2: { currency: tokenInfo.currency, issuer: tokenInfo.issuer }
        });

        if (!ammInfo.result || !ammInfo.result.amm) {
            return null;
        }

        return ammInfo.result.amm;
    } catch (error) {
        return null;
    }
}

/**
 * Check LP burn status
 */
async function checkLPBurnStatus(client, tokenInfo) {
    try {
        const ammInfo = await getAMMInfo(client, tokenInfo);
        if (!ammInfo) {
            return {
                lpBurned: false,
                lpBalance: 'Unknown',
                error: 'AMM pool not found'
            };
        }

        const ammAccount = ammInfo.amm_account;
        
        const accountLines = await client.request({
            command: 'account_lines',
            account: ammAccount,
            ledger_index: 'validated'
        });

        if (!accountLines.result || !accountLines.result.lines) {
            return {
                lpBurned: true,
                lpBalance: '0',
                ammAccount: ammAccount
            };
        }

        const lpTokenLine = accountLines.result.lines.find(line => 
            line.account === ammAccount && 
            line.currency && 
            line.currency.length === 40
        );

        if (!lpTokenLine) {
            return {
                lpBurned: true,
                lpBalance: '0',
                ammAccount: ammAccount
            };
        }

        const lpBalance = parseFloat(lpTokenLine.balance);
        const lpBurned = lpBalance < 1;
        
        return {
            lpBurned: lpBurned,
            lpBalance: lpBalance.toString(),
            ammAccount: ammAccount,
            lpTokenCurrency: lpTokenLine.currency
        };
    } catch (error) {
        return {
            lpBurned: false,
            lpBalance: 'Error',
            error: error.message
        };
    }
}

module.exports = {
    executeAMMBuy,
    executeAMMSell,
    getAMMInfo,
    checkLPBurnStatus
};

