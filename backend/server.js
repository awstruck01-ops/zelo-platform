require('dotenv').config();

const app = require('./src/app');
const initDatabase = require('./src/db/initDatabase');

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await initDatabase();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Zelo API running on port ${PORT}`);
    });

    const shutdown = (signal) => {
      console.log(`\n${signal} received, shutting down gracefully...`);
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

start();
