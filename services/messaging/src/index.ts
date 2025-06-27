import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { DatabaseConfig } from './config/database';
import { messagingRouter } from './routes/messaging';
import { authMiddleware } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { MessageService } from './services/MessageService';
import { NotificationScheduler } from './services/NotificationScheduler';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3004;

class MessagingServiceApp {
  private messageService: MessageService;
  private notificationScheduler: NotificationScheduler;

  constructor() {
    this.messageService = new MessageService();
    this.notificationScheduler = new NotificationScheduler(this.messageService);
  }

  async initialize(): Promise<void> {
    try {
      // 데이터베이스 연결 초기화
      await DatabaseConfig.initializePostgreSQL();
      await DatabaseConfig.initializeRedis();
      await DatabaseConfig.initializeMongoDB();

      // 스케줄러 시작
      await this.notificationScheduler.start();

      logger.info('Messaging service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize messaging service:', error);
      throw error;
    }
  }

  setupMiddleware(): void {
    // 보안 미들웨어
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS 설정
    app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 요청 로깅 미들웨어
    app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      });

      next();
    });
  }

  setupRoutes(): void {
    // 헬스체크 (인증 불필요)
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        service: 'messaging-service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API 라우트 (인증 필요)
    app.use('/api/messaging', authMiddleware, messagingRouter);

    // 404 핸들러
    app.use(notFoundHandler);

    // 에러 핸들러
    app.use(errorHandler);
  }

  async start(): Promise<void> {
    try {
      await this.initialize();
      this.setupMiddleware();
      this.setupRoutes();

      const server = app.listen(PORT, () => {
        logger.info(`Messaging Service running on port ${PORT}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', async () => {
        logger.info('SIGTERM received, shutting down gracefully');
        
        server.close(async () => {
          try {
            await this.notificationScheduler.stop();
            await DatabaseConfig.closeConnections();
            logger.info('Messaging service shut down completed');
            process.exit(0);
          } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
          }
        });
      });

      process.on('SIGINT', async () => {
        logger.info('SIGINT received, shutting down gracefully');
        
        server.close(async () => {
          try {
            await this.notificationScheduler.stop();
            await DatabaseConfig.closeConnections();
            logger.info('Messaging service shut down completed');
            process.exit(0);
          } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
          }
        });
      });

    } catch (error) {
      logger.error('Failed to start messaging service:', error);
      process.exit(1);
    }
  }
}

// 애플리케이션 시작
const messagingApp = new MessagingServiceApp();
messagingApp.start().catch((error) => {
  logger.error('Messaging service startup failed:', error);
  process.exit(1);
});

export default app;