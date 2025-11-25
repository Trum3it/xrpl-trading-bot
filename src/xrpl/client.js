const xrpl = require('xrpl');
const config = require('../config');

let persistentClient = null;
let connectingPromise = null;

async function getClient() {
    if (persistentClient && persistentClient.isConnected()) {
        return persistentClient;
    }

    if (connectingPromise) {
        await connectingPromise;
        return persistentClient;
    }

    connectingPromise = (async () => {
        persistentClient = new xrpl.Client(config.xrpl.server);
        await persistentClient.connect();
        
        persistentClient.on('disconnected', async () => {
            console.log('⚠️ XRPL client disconnected, attempting reconnect...');
            try {
                await persistentClient.connect();
                console.log('✅ XRPL client reconnected');
            } catch (error) {
                console.error('❌ XRPL client reconnect failed:', error);
            }
        });

        connectingPromise = null;
        console.log('✅ Connected to XRPL');
    })();

    await connectingPromise;
    return persistentClient;
}

async function disconnect() {
    if (persistentClient && persistentClient.isConnected()) {
        await persistentClient.disconnect();
        persistentClient = null;
        console.log('🔌 Disconnected from XRPL');
    }
}

module.exports = {
    getClient,
    disconnect
};

