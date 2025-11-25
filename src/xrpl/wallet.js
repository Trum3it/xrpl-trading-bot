const { Wallet } = require('xrpl');
const config = require('../config');

function getWallet() {
    if (!config.wallet.seed) {
        throw new Error('Wallet seed not configured. Set WALLET_SEED environment variable.');
    }

    try {
        return Wallet.fromSeed(config.wallet.seed);
    } catch (error) {
        throw new Error(`Failed to create wallet from seed: ${error.message}`);
    }
}

function generateWallet() {
    try {
        const wallet = Wallet.generate();
        return {
            publicKey: wallet.publicKey,
            privateKey: wallet.privateKey,
            walletAddress: wallet.address,
            seed: wallet.seed
        };
    } catch (error) {
        throw new Error(`Failed to generate wallet: ${error.message}`);
    }
}

async function getBalance(client, address) {
    try {
        const response = await client.request({
            command: 'account_info',
            account: address,
            ledger_index: 'validated'
        });

        const balanceInXrp = parseFloat(response.result.account_data.Balance) / 1000000;
        return balanceInXrp;
    } catch (error) {
        if (error.data && error.data.error === 'actNotFound') {
            return 0;
        }
        throw error;
    }
}

async function getTokenBalances(client, address) {
    try {
        const response = await client.request({
            command: 'account_lines',
            account: address,
            ledger_index: 'validated'
        });

        return response.result.lines.map(line => ({
            currency: line.currency,
            issuer: line.account,
            balance: line.balance,
            lastUpdated: new Date()
        }));
    } catch (error) {
        if (error.data && error.data.error === 'actNotFound') {
            return [];
        }
        throw error;
    }
}

function isValidAddress(address) {
    if (!address || typeof address !== 'string') return false;
    if (!address.startsWith('r') || address.length < 25 || address.length > 34) return false;
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(address);
}

async function validateAccount(client, address) {
    try {
        const accountInfo = await client.request({
            command: 'account_info',
            account: address,
            ledger_index: 'validated'
        });
        return accountInfo.result && accountInfo.result.account_data;
    } catch (error) {
        return false;
    }
}

module.exports = {
    getWallet,
    generateWallet,
    getBalance,
    getTokenBalances,
    isValidAddress,
    validateAccount
};

