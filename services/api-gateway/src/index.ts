import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { loadBalancer } from './middleware/loadBalancer';
import { authMiddleware } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false
});

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(limiter);

app.use('/api/auth', createProxyMiddleware({
  target: loadBalancer.getTarget('family-auth'),
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/api/auth' },
  onError: (err, req, res) => {
    logger.error('Proxy error for auth service:', err);
    (res as any).status(503).json({ error: 'Service unavailable' });
  }
}));

app.use('/api/schedule', authMiddleware, createProxyMiddleware({
  target: loadBalancer.getTarget('child-schedule'),
  changeOrigin: true,
  pathRewrite: { '^/api/schedule': '/api/schedule' },
  onError: (err, req, res) => {
    logger.error('Proxy error for schedule service:', err);
    (res as any).status(503).json({ error: 'Service unavailable' });
  }
}));

app.get('/health', async (req, res) => {
  const services = await loadBalancer.healthCheck();
  res.json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services
  });
});

app.get('/metrics', (req, res) => {
  res.json(loadBalancer.getMetrics());
});

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
});