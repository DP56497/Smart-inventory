require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`Smart-Inventory API Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });

  // Handle unhandled promise rejections gracefully
  process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! Shutting down gracefully...', err);
    server.close(() => {
      process.exit(1);
    });
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      console.log('Process terminated.');
    });
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app;
