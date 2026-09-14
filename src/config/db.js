const mongoose = require('mongoose');
const dns = require('dns');

// Fix for Node.js ETIMEOUT on Windows when resolving MongoDB Atlas SRV/TXT records
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (dnsErr) {
  // Ignore if custom dns servers cannot be set
}

const connectDB = async (retries = 5, delay = 2000) => {
  const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smart_inventory';

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(mongoURI, {
        autoIndex: true
      });

      console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
      return conn;
    } catch (error) {
      console.error(`MongoDB Connection Attempt ${attempt} failed: ${error.message}`);
      if (attempt === retries) {
        console.error('All MongoDB connection attempts exhausted. Exiting process...');
        process.exit(1);
      }
      console.log(`Retrying MongoDB connection in ${delay / 1000}s...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
};

module.exports = connectDB;
