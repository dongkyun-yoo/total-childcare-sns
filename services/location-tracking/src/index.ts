import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { locationRouter } from './routes/location';
import { geofenceRouter } from './routes/geofence';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { initLocationTracking } from './services/locationService';
import { performanceMiddleware } from './utils/performance';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3003;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(performanceMiddleware);

app.use('/api/location', locationRouter);
app.use('/api/geofence', geofenceRouter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'location-tracking',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connectedClients: io.engine.clientsCount
  });
});

app.use(errorHandler);

initLocationTracking(io);

server.listen(PORT, () => {
  logger.info(`Location Tracking Service running on port ${PORT}`);
});