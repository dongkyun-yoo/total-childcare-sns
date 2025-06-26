import { Pool } from 'pg';
import { logger } from '../utils/logger';

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'actcs_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

db.on('connect', () => {
  logger.info('Database connected successfully');
});

db.on('error', (err) => {
  logger.error('Database connection error:', err);
});

export { db };