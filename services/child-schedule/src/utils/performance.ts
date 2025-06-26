import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export const performanceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    const logLevel = duration > 1000 ? 'warn' : duration > 500 ? 'info' : 'debug';
    
    logger.log(logLevel, 'Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent')
    });
    
    if (duration > 2000) {
      logger.error('Slow query detected', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        body: req.body
      });
    }
  });
  
  next();
};

export const healthMetrics = {
  requestCount: 0,
  errorCount: 0,
  averageResponseTime: 0,
  uptime: process.uptime(),
  
  incrementRequest() {
    this.requestCount++;
  },
  
  incrementError() {
    this.errorCount++;
  },
  
  updateResponseTime(time: number) {
    this.averageResponseTime = (this.averageResponseTime + time) / 2;
  },
  
  getMetrics() {
    return {
      requests: this.requestCount,
      errors: this.errorCount,
      avgResponseTime: Math.round(this.averageResponseTime),
      uptime: Math.round(process.uptime()),
      errorRate: this.requestCount ? (this.errorCount / this.requestCount * 100).toFixed(2) + '%' : '0%'
    };
  }
};