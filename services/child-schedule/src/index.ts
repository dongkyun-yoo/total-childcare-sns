import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { scheduleRouter } from './routes/schedule';
import { alertRouter } from './routes/alerts';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { performanceMiddleware, healthMetrics } from './utils/performance';
import { initScheduler } from './services/scheduler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(performanceMiddleware);

app.use('/api/schedule', scheduleRouter);
app.use('/api/alerts', alertRouter);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'child-schedule', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    metrics: healthMetrics.getMetrics()
  });
});

app.get('/metrics', (req, res) => {
  res.json(healthMetrics.getMetrics());
});

app.use(errorHandler);

initScheduler();

app.listen(PORT, () => {
  logger.info(`Child Schedule Service running on port ${PORT}`);
});