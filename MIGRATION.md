# Migration Guide: Telegram Bot → Standalone Bot

This guide helps you migrate from the Telegram bot version (v1.0) to the new standalone modular bot (v2.0).

## Key Changes

### 1. **Removed Telegram Dependencies**
- All Telegram bot code has been removed
- No more `node-telegram-bot-api` dependency
- Bot now runs as a standalone Node.js process

### 2. **Modular Architecture**
The monolithic `index.js` (9900+ lines) has been split into:
- `src/config/` - Configuration management
- `src/database/` - Database models and connection
- `src/xrpl/` - XRPL client, wallet, and AMM utilities
- `src/sniper/` - Token sniping module
- `src/copyTrading/` - Copy trading module
- `src/bot.js` - Main bot orchestrator

### 3. **New Entry Point**
- Old: Telegram bot with `/start` command
- New: Command-line interface with flags

## Migration Steps

### Step 1: Update Dependencies
```bash
npm install
```

The new `package.json` removes Telegram dependencies and adds `ws` for WebSocket support.

### Step 2: Update Environment Variables
Your existing `.env` file should work, but remove Telegram-related variables:
- ❌ Remove: `TELEGRAM_BOT_TOKEN`
- ❌ Remove: `TELEGRAM_CHAT_ID`
- ✅ Keep: `WALLET_SEED`, `WALLET_ADDRESS`, `MONGODB_URI`

### Step 3: Database Compatibility
Your existing MongoDB data is **fully compatible**. The user schema remains the same, so no migration needed.

### Step 4: Running the Bot

**Old way (Telegram):**
- Bot ran as Telegram bot, users interacted via Telegram

**New way (Standalone):**
```bash
# Start both sniper and copy trading
npm start

# Start only sniper
npm run start:sniper

# Start only copy trading
npm run start:copy

# Start with custom user ID
node index.js --user=your-user-id
```

## Configuration

### User Configuration (MongoDB)
All user settings remain the same. Configure via MongoDB directly or create a simple admin script.

### Sniper Settings
- `selectedSniperBuyMode`: `true` (auto-buy) or `false` (whitelist-only)
- `selectedSnipeAmount`: Amount in XRP or 'custom'
- `selectedCustomSnipeAmount`: Custom amount if using 'custom'
- `selectedMinimumPoolLiquidity`: Minimum liquidity (rugcheck)
- `whiteListedTokens`: Array of whitelisted tokens
- `blackListedTokens`: Array of blacklisted tokens

### Copy Trading Settings
- `copyTradersAddresses`: Array of trader addresses
- `selectedTradingAmountMode`: `'fixed'` or `'percentage'`
- `selectedFixedAmountForCopyTrading`: Fixed XRP amount
- `selectedMatchTraderPercentage`: Percentage (0.1 = 10%)
- `selectedMaxSpendPerTrade`: Maximum XRP per trade
- `selectedSlippage`: Slippage tolerance

## Benefits of New Architecture

1. **Performance**: Modular code is faster and more efficient
2. **Maintainability**: Easy to find and fix issues
3. **Scalability**: Can run multiple instances easily
4. **No Telegram Dependency**: Works without Telegram
5. **Better Error Handling**: Isolated error handling per module

## Monitoring

The bot now logs to console instead of Telegram:
- ✅ Successful operations
- ⚠️ Warnings
- ❌ Errors
- 🎯 Sniper activities
- 📊 Copy trading activities

For production, consider:
- Using `pm2` for process management
- Redirecting logs to files
- Setting up monitoring/alerting

## Troubleshooting

### Bot won't start
- Check `.env` file has all required variables
- Verify MongoDB is running and accessible
- Check wallet seed is correct

### Sniper not working
- Verify user record exists in MongoDB
- Check sniper settings are configured
- Ensure wallet has sufficient XRP

### Copy Trading not working
- Verify trader addresses are added
- Check copy trading settings
- Ensure wallet has sufficient XRP

## Need Help?

Check the logs for detailed error messages. The new modular structure makes it easier to identify issues.

