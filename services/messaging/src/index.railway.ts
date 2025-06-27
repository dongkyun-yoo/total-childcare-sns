import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { messagingRouter } from './routes/messaging';
import { authMiddleware } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { MessageService } from './services/MessageServiceSupabase';
import { SimpleScheduler } from './services/SimpleScheduler';
import { SupabaseConfig } from './config/supabase';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3004;

class RailwayMessagingApp {
  private messageService: MessageService;
  private scheduler: SimpleScheduler;

  constructor() {
    this.messageService = new MessageService();
    this.scheduler = new SimpleScheduler(this.messageService);
  }

  async initialize(): Promise<void> {
    try {
      // Supabase 연결 확인
      const supabase = SupabaseConfig.getInstance();
      const isHealthy = await supabase.healthCheck();
      
      if (!isHealthy) {
        throw new Error('Supabase connection failed');
      }

      // 스케줄러 시작
      await this.scheduler.start();

      logger.info('Railway messaging service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize messaging service:', error);
      throw error;
    }
  }

  setupMiddleware(): void {
    // Railway 환경에 맞는 보안 설정
    app.use(helmet({
      contentSecurityPolicy: false, // Railway에서 필요한 경우
      crossOriginEmbedderPolicy: false
    }));

    // CORS 설정 (Railway 도메인 포함)
    const allowedOrigins = [
      'http://localhost:3000',
      'https://localhost:3000',
      ...(process.env.ALLOWED_ORIGINS?.split(',') || [])
    ];

    app.use(cors({
      origin: (origin, callback) => {
        // Railway 내부 호출이나 개발환경 허용
        if (!origin || allowedOrigins.some(allowed => origin.includes(allowed))) {
          callback(null, true);
        } else {
          callback(null, true); // Railway에서는 관대하게 설정
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Railway 로그 최적화
    app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        
        // 중요한 요청만 로깅 (Railway 로그 절약)
        if (res.statusCode >= 400 || duration > 1000) {
          logger.info('Request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`
          });
        }
      });

      next();
    });
  }

  setupRoutes(): void {
    // 헬스체크 (Railway 요구사항)
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        service: 'actcs-messaging',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.RAILWAY_ENVIRONMENT || 'development',
        version: '1.0.0'
      });
    });

    // Railway 루트 헬스체크
    app.get('/', (req, res) => {
      res.json({
        message: 'ACTCS Messaging Service',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    // 외부 cron 서비스용 엔드포인트
    app.post('/cron/scheduled', async (req, res) => {
      try {
        const result = await this.scheduler.handleExternalCron('scheduled');
        res.json(result);
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          message: error instanceof Error ? error.message : 'Cron job failed' 
        });
      }
    });

    app.get('/cron/health', async (req, res) => {
      try {
        const result = await this.scheduler.handleExternalCron('health');
        res.json(result);
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          message: error instanceof Error ? error.message : 'Health check failed' 
        });
      }
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

      const server = app.listen(PORT, '0.0.0.0', () => {
        logger.info(`ACTCS Messaging Service running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV}`);
        logger.info(`Railway Environment: ${process.env.RAILWAY_ENVIRONMENT || 'local'}`);
      });

      // Railway 종료 신호 처리
      const gracefulShutdown = async (signal: string) => {
        logger.info(`${signal} received, shutting down gracefully`);
        
        server.close(async () => {
          try {
            await this.scheduler.stop();
            logger.info('Messaging service shut down completed');
            process.exit(0);
          } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
          }
        });

        // 강제 종료 (Railway 타임아웃 방지)
        setTimeout(() => {
          logger.error('Forced shutdown due to timeout');
          process.exit(1);
        }, 10000);
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));

      // Railway 메모리 모니터링
      setInterval(() => {
        const usage = process.memoryUsage();
        const mbUsed = Math.round(usage.heapUsed / 1024 / 1024);
        
        if (mbUsed > 400) { // 400MB 초과시 경고
          logger.warn('High memory usage', { memoryMB: mbUsed });
        }
      }, 300000); // 5분마다

    } catch (error) {
      logger.error('Failed to start messaging service:', error);
      process.exit(1);
    }
  }
}

// Railway 배포용 앱 시작
const railwayApp = new RailwayMessagingApp();
railwayApp.start().catch((error) => {
  logger.error('Railway messaging service startup failed:', error);
  process.exit(1);
});

export default app;