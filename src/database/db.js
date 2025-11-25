const mongoose = require('mongoose');
const config = require('../config');

let isConnected = false;

async function connect() {
    if (isConnected) {
        return;
    }

    try {
        await mongoose.connect(config.database.uri);
        isConnected = true;
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        throw error;
    }
}

async function disconnect() {
    if (isConnected) {
        await mongoose.disconnect();
        isConnected = false;
        console.log('🔌 Disconnected from MongoDB');
    }
}

module.exports = {
    connect,
    disconnect,
    isConnected: () => isConnected
};

