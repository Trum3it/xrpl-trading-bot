#!/usr/bin/env node

/**
 * XRPL Trading Bot - Main Entry Point
 * 
 * A modular trading bot for XRPL with sniper and copy trading capabilities
 */

const XRPLTradingBot = require('./src/bot');
const config = require('./src/config');

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args.includes('--sniper') ? 'sniper' : 
             args.includes('--copy') ? 'copyTrading' : 
             'both';

const userId = args.find(arg => arg.startsWith('--user='))?.split('=')[1] || 'default';

// Create and start bot
const bot = new XRPLTradingBot({
    userId: userId,
    mode: mode
});

// Start the bot
bot.start().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    bot.stop().finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    bot.stop().finally(() => process.exit(1));
});
