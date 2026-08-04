import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from './config/env';
import { getBotStatus, handleIncomingZaloMessage } from './services/zaloBotService';
import { messageQueue } from './services/queueService';
import { prisma } from './services/prismaService';
import { logger } from './utils/logger';

export function createExpressApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // GET /health
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

  // POST /api/simulate-message (for testing and debugging chatbot commands)
  app.post('/api/simulate-message', async (req: Request, res: Response) => {
    const { from, senderName, body } = req.body;
    if (!from || !body) {
      return res.status(400).json({ error: 'Missing required fields "from" or "body"' });
    }

    try {
      logger.info(`Simulated incoming message from ${from}: "${body}"`);
      const responseMessage = await handleIncomingZaloMessage({
        from,
        senderName: senderName || 'Test User',
        body,
      });

      return res.status(200).json({
        success: true,
        responseMessage,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  return app;
}

export function startExpressServer(app: express.Express) {
  return app.listen(config.port, () => {
    logger.info(`Express Web Server listening on port http://localhost:${config.port}`);
    logger.info(`Health check available at http://localhost:${config.port}/health`);
  });
}
