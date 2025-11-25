const db = require('./database/db');
const { getClient, disconnect: disconnectXRPL } = require('./xrpl/client');
const sniper = require('./sniper');
const copyTrading = require('./copyTrading');
const config = require('./config');

class XRPLTradingBot {
    constructor(options = {}) {
        this.userId = options.userId || 'default';
        this.mode = options.mode || 'both'; // 'sniper', 'copyTrading', or 'both'
        this.isRunning = false;
    }

    /**
     * Start the bot
     */
    async start() {
        try {
            console.log('🚀 Starting XRPL Trading Bot...');
            
            // Connect to database
            await db.connect();
            console.log('✅ Database connected');

            // Connect to XRPL
            await getClient();
            console.log('✅ XRPL client connected');

            // Start services based on mode
            if (this.mode === 'sniper' || this.mode === 'both') {
                const sniperResult = await sniper.startSniper(this.userId);
                if (sniperResult.success) {
                    console.log('✅ Sniper started');
                } else {
                    console.error('❌ Failed to start sniper:', sniperResult.error);
                }
            }

            if (this.mode === 'copyTrading' || this.mode === 'both') {
                const copyResult = await copyTrading.startCopyTrading(this.userId);
                if (copyResult.success) {
                    console.log('✅ Copy trading started');
                } else {
                    console.error('❌ Failed to start copy trading:', copyResult.error);
                }
            }

            this.isRunning = true;
            console.log('✅ Bot is running!');
            console.log(`   Mode: ${this.mode}`);
            console.log(`   User ID: ${this.userId}`);

            // Handle graceful shutdown
            process.on('SIGINT', () => this.stop());
            process.on('SIGTERM', () => this.stop());

        } catch (error) {
            console.error('❌ Error starting bot:', error);
            throw error;
        }
    }

    /**
     * Stop the bot
     */
    async stop() {
        try {
            console.log('⏹️ Stopping bot...');

            // Stop sniper
            if (this.mode === 'sniper' || this.mode === 'both') {
                await sniper.stopSniper(this.userId);
            }

            // Stop copy trading
            if (this.mode === 'copyTrading' || this.mode === 'both') {
                await copyTrading.stopCopyTrading(this.userId);
            }

            // Disconnect from XRPL
            await disconnectXRPL();

            // Disconnect from database
            await db.disconnect();

            this.isRunning = false;
            console.log('✅ Bot stopped');
        } catch (error) {
            console.error('❌ Error stopping bot:', error);
            throw error;
        }
    }

    /**
     * Get bot status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            mode: this.mode,
            userId: this.userId,
            sniper: sniper.isRunning(),
            copyTrading: copyTrading.isRunning()
        };
    }
}

module.exports = XRPLTradingBot;

