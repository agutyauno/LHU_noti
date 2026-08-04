import { connectDatabase, disconnectDatabase } from './services/prismaService';
import { createExpressApp, startExpressServer } from './server';
import { initZaloBot } from './services/zaloBotService';
import { startCronScheduler } from './cron/scheduler';
import { logger } from './utils/logger';

async function main() {
  logger.info('==================================================');
  logger.info('   LHU SCHEDULE ZALO NOTIFIER SERVICE STARTING   ');
  logger.info('==================================================');

  // 1. Connect SQLite Database
  await connectDatabase();

  // 2. Start Express Web Server
  const app = createExpressApp();
  const server = startExpressServer(app);

  // 3. Initialize Zalo Bot
  await initZaloBot();

  // 4. Start Cron Jobs
  startCronScheduler();

  // 5. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down server gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Shutdown complete.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal error during application startup:', err);
  process.exit(1);
});
