import { Pool } from 'pg';
import { createClient } from 'redis';
import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export class DatabaseConfig {
  private static pgPool: Pool;
  private static redisClient: any;

  static async initializePostgreSQL(): Promise<Pool> {
    if (!this.pgPool) {
      this.pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pgPool.on('error', (err) => {
        logger.error('PostgreSQL connection error:', err);
      });

      try {
        await this.pgPool.query('SELECT NOW()');
        logger.info('PostgreSQL connected successfully');
      } catch (error) {
        logger.error('Failed to connect to PostgreSQL:', error);
        throw error;
      }
    }
    return this.pgPool;
  }

  static async initializeRedis() {
    if (!this.redisClient) {
      this.redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      this.redisClient.on('error', (err: any) => {
        logger.error('Redis connection error:', err);
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      await this.redisClient.connect();
    }
    return this.redisClient;
  }

  static async initializeMongoDB() {
    try {
      const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/total_childcare_sns';
      await mongoose.connect(mongoUrl);
      logger.info('MongoDB connected successfully');
    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  static getPostgreSQLPool(): Pool {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not initialized');
    }
    return this.pgPool;
  }

  static getRedisClient() {
    if (!this.redisClient) {
      throw new Error('Redis not initialized');
    }
    return this.redisClient;
  }

  static async closeConnections() {
    if (this.pgPool) {
      await this.pgPool.end();
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    logger.info('All database connections closed');
  }
}