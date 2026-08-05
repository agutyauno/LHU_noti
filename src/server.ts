import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from './config/env';
import { getBotStatus, handleIncomingZaloMessage, processZaloWebhookUpdate } from './services/zaloBotService';
import { messageQueue } from './services/queueService';
import { prisma } from './services/prismaService';
import { logger } from './utils/logger';

export function createExpressApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // GET /health - Server, Database, Bot, and Queue status
  app.get('/health', async (_req: Request, res: Response) => {
    let dbStatus = 'connected';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }

    const botStatus = getBotStatus();

    res.status(200).json({
      status: 'ok',
      service: 'LHU Schedule Zalo Notifier',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      bot: {
        status: botStatus,
        authenticated: botStatus === 'READY',
      },
      queue: messageQueue.getStats(),
      database: {
        status: dbStatus,
      },
    });
  });

  // POST /api/zalo-webhook - Webhook endpoint for production Zalo Bot updates
  app.post('/api/zalo-webhook', async (req: Request, res: Response) => {
    try {
      logger.info('Received Webhook update from Zalo Bot API.');
      await processZaloWebhookUpdate(req.body);
      return res.status(200).json({ status: 'ok' });
    } catch (err: any) {
      logger.error(`Error processing Zalo Webhook payload: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/simulate-message - Testing endpoint for chatbot commands
  app.post('/api/simulate-message', async (req: Request, res: Response) => {
    try {
      // Check if raw Zalo Webhook payload is passed
      if (req.body?.result?.message || req.body?.message) {
        logger.info('Simulating raw Zalo Webhook payload via /api/simulate-message endpoint...');
        const msgObj = req.body.result?.message || req.body.message;
        const from = msgObj?.chat?.id || msgObj?.from?.id || '';
        const senderName = msgObj?.from?.display_name || msgObj?.from?.account_name || 'User';
        const body = msgObj?.text || '';

        const responseMessage = await handleIncomingZaloMessage({
          from,
          senderName,
          body,
        });

        return res.status(200).json({
          success: true,
          type: 'webhook_payload',
          responseMessage,
        });
      }

      // Flat JSON payload format
      const { from, senderName, body } = req.body;
      if (!from || !body) {
        return res.status(400).json({
          error: 'Missing required fields "from" or "body" (or valid Zalo Webhook payload)',
        });
      }

      logger.info(`Simulated incoming message from ${from}: "${body}"`);
      const responseMessage = await handleIncomingZaloMessage({
        from,
        senderName: senderName || 'Test User',
        body,
      });

      return res.status(200).json({
        success: true,
        type: 'flat_payload',
        responseMessage,
      });
    } catch (err: any) {
      logger.error(`Error in /api/simulate-message: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  return app;
}

export function startExpressServer(app: express.Express) {
  return app.listen(config.port, () => {
    logger.info(`Express Web Server listening on port http://localhost:${config.port}`);
    logger.info(`Health check available at http://localhost:${config.port}/health`);
    if (config.botMode === 'webhook') {
      logger.info(`Zalo Webhook endpoint active at http://localhost:${config.port}/api/zalo-webhook`);
    } else {
      logger.info(`Zalo Bot running in Polling Mode (Interval: ${config.botPollIntervalMs}ms)`);
    }
  });
}
