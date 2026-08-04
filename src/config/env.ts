import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  lhuApiUrl: process.env.LHU_API_URL || '',
  zaloSendDelayMs: parseInt(process.env.ZALO_SEND_DELAY_MS || '1500', 10),
  zaloBotToken: process.env.ZALO_BOT_TOKEN || '',
  logLevel: process.env.LOG_LEVEL || 'info',
};
