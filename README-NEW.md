# XRPL Trading Bot v2.0

A modular, high-performance XRPL trading bot with sniper and copy trading capabilities. This version has been completely refactored from the original Telegram bot into a standalone, modular architecture.

## 🚀 Features

- **Token Sniping**: Automatically detect and snipe new tokens from AMM pools
- **Copy Trading**: Mirror trades from successful wallets in real-time
- **Modular Architecture**: Clean, maintainable codebase split into logical modules
- **High Performance**: Optimized for speed and efficiency
- **Configurable**: Easy-to-use configuration system

## 📁 Project Structure

```
xrpl-trading-bot/
├── src/
│   ├── config/          # Configuration management
│   ├── database/        # Database models and connection
│   ├── xrpl/            # XRPL client, wallet, and AMM utilities
│   ├── sniper/          # Token sniping module
│   ├── copyTrading/     # Copy trading module
│   └── bot.js           # Main bot orchestrator
├── index.js             # Entry point
├── filterAmmCreate.js   # AMM transaction checker utility
├── package.json
└── .env                 # Environment configuration
```

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd xrpl-trading-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file:
   ```env
   # XRPL Configuration
   XRPL_SERVER=wss://xrplcluster.com
   XRPL_NETWORK=mainnet

   # Wallet Configuration (REQUIRED)
   WALLET_SEED=your_wallet_seed_here
   WALLET_ADDRESS=your_wallet_address_here

   # MongoDB Configuration (REQUIRED)
   MONGODB_URI=mongodb://localhost:27017/xrpl-bot

   # Trading Configuration (Optional)
   MIN_LIQUIDITY=100
   MAX_SNIPE_AMOUNT=5000
   DEFAULT_SLIPPAGE=4.0
   SNIPER_CHECK_INTERVAL=8000
   COPY_TRADING_CHECK_INTERVAL=3000
   ```

## 🎯 Usage

### Start Both Sniper and Copy Trading
```bash
npm start
# or
node index.js
```

### Start Only Sniper
```bash
npm run start:sniper
# or
node index.js --sniper
```

### Start Only Copy Trading
```bash
npm run start:copy
# or
node index.js --copy
```

### Start with Custom User ID
```bash
node index.js --user=my-user-id
```

## 📋 Prerequisites

Before running the bot, you need to:

1. **Set up MongoDB**: The bot requires MongoDB to store user data and trading history
2. **Configure Wallet**: Set `WALLET_SEED` and `WALLET_ADDRESS` in `.env`
3. **Fund Wallet**: Ensure your wallet has sufficient XRP for trading and fees

## ⚙️ Configuration

### Sniper Configuration

Configure sniper settings in your user database record:

- `selectedSniperBuyMode`: `true` for auto-buy with rugcheck, `false` for whitelist-only
- `selectedSnipeAmount`: Amount in XRP (or 'custom')
- `selectedCustomSnipeAmount`: Custom amount if using 'custom' mode
- `selectedMinimumPoolLiquidity`: Minimum liquidity required (rugcheck)
- `whiteListedTokens`: Array of whitelisted tokens (for whitelist mode)
- `blackListedTokens`: Array of blacklisted tokens

### Copy Trading Configuration

Configure copy trading settings in your user database record:

- `copyTradersAddresses`: Array of trader wallet addresses to follow
- `selectedTradingAmountMode`: `'fixed'` or `'percentage'`
- `selectedFixedAmountForCopyTrading`: Fixed XRP amount (if using fixed mode)
- `selectedMatchTraderPercentage`: Percentage to match (if using percentage mode)
- `selectedMaxSpendPerTrade`: Maximum XRP per trade
- `selectedSlippage`: Slippage tolerance percentage

## 🔧 Module Overview

### Sniper Module (`src/sniper/`)
- **monitor.js**: Detects new tokens from AMM create transactions
- **evaluator.js**: Evaluates tokens based on user criteria (rugcheck, whitelist, etc.)
- **index.js**: Main sniper logic and orchestration

### Copy Trading Module (`src/copyTrading/`)
- **monitor.js**: Monitors trader wallets for new transactions
- **executor.js**: Executes copy trades based on detected transactions
- **index.js**: Main copy trading logic and orchestration

### XRPL Module (`src/xrpl/`)
- **client.js**: XRPL WebSocket client management
- **wallet.js**: Wallet operations and utilities
- **amm.js**: AMM trading functions (buy/sell)
- **utils.js**: XRPL utility functions

## 🛡️ Safety Features

- Maximum snipe amount limits
- Minimum liquidity requirements (rugcheck)
- Blacklist/whitelist filtering
- Slippage protection
- Transaction deduplication
- Balance validation before trades

## 📊 Monitoring

The bot logs all activities to the console:
- ✅ Successful operations
- ⚠️ Warnings
- ❌ Errors
- 🎯 Sniper activities
- 📊 Copy trading activities

## ⚠️ Important Notes

- **Mainnet Only**: This bot operates on XRPL mainnet with real funds
- **Risk Warning**: Trading cryptocurrencies involves substantial risk
- **No Guarantees**: Past performance doesn't guarantee future results
- **Test First**: Always test with small amounts first

## 🔄 Migration from v1.0

If you're migrating from the Telegram bot version:

1. Your existing MongoDB data is compatible
2. Remove Telegram-related environment variables
3. Update your user records with the new configuration structure
4. The bot now runs as a standalone process instead of a Telegram bot

## 📝 License

MIT License - Use at your own risk.

## 🤝 Contributing

Contributions are welcome! Please ensure your code follows the existing modular structure.

---

**⚠️ Disclaimer**: This bot is for educational purposes. Use at your own risk. The developers are not responsible for any financial losses.

