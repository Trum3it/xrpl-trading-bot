function getReadableCurrency(currency) {
    if (!currency) return 'UNKNOWN';
    if (currency.length <= 3) {
        return currency;
    }
    if (currency.length === 40) {
        try {
            const hex = currency.replace(/0+$/, '');
            if (hex.length > 0 && hex.length % 2 === 0) {
                const decoded = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
                if (decoded && /^[A-Za-z0-9\-_\.]+$/.test(decoded) && decoded.length >= 1) {
                    return decoded;
                }
            }
        } catch (error) {
            // If decoding fails, return original
        }
    }
    return currency;
}

function hexToString(hex) {
    if (!hex || hex === 'XRP') return hex;
    if (hex.length !== 40) return hex;
    
    try {
        let str = '';
        for (let i = 0; i < hex.length; i += 2) {
            const byte = parseInt(hex.substr(i, 2), 16);
            if (byte === 0) break;
            str += String.fromCharCode(byte);
        }
        return str || hex;
    } catch {
        return hex;
    }
}

function formatTokenAmountSimple(amount) {
    if (typeof amount === 'string') {
        return amount;
    }
    return amount.toFixed(6);
}

function convertCurrencyToXRPLFormat(currency) {
    if (currency.length <= 3) {
        return currency.padEnd(3, '\0');
    }
    return currency.padEnd(40, '\0').slice(0, 40);
}

function convertXRPLCurrencyToReadable(xrplCurrency) {
    if (!xrplCurrency) return '';
    if (xrplCurrency.length <= 3) {
        return xrplCurrency.trim();
    }
    if (xrplCurrency.length === 40) {
        try {
            const hex = xrplCurrency.replace(/0+$/, '');
            if (hex.length > 0 && hex.length % 2 === 0) {
                const decoded = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
                if (decoded && /^[A-Za-z0-9\-_\.]+$/.test(decoded)) {
                    return decoded;
                }
            }
        } catch (error) {
            // If decoding fails, return original
        }
    }
    return xrplCurrency;
}

function getTransactionTime(txData) {
    try {
        if (txData.tx?.date) {
            return new Date((txData.tx.date + 946684800) * 1000);
        }
        if (txData.date) {
            return new Date((txData.date + 946684800) * 1000);
        }
        return null;
    } catch {
        return null;
    }
}

module.exports = {
    getReadableCurrency,
    hexToString,
    formatTokenAmountSimple,
    convertCurrencyToXRPLFormat,
    convertXRPLCurrencyToReadable,
    getTransactionTime
};

