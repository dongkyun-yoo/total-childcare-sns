import { db } from '../config/database';
import { logger } from '../utils/logger';

describe('Database Connection Tests', () => {
  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
  
  afterAll(async () => {
    await db.end();
  });
  
  test('should connect to database', async () => {
    const client = await db.connect();
    expect(client).toBeDefined();
    client.release();
  });
  
  test('should execute basic query', async () => {
    const result = await db.query('SELECT NOW() as current_time');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].current_time).toBeDefined();
  });
  
  test('should handle connection pool', async () => {
    const promises = Array(10).fill(0).map(() => 
      db.query('SELECT pg_sleep(0.1), $1 as test_value', [Math.random()])
    );
    
    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
    results.forEach(result => {
      expect(result.rows[0].test_value).toBeDefined();
    });
  });
  
  test('should handle query timeout', async () => {
    const start = Date.now();
    
    try {
      await db.query('SELECT pg_sleep(5)');
    } catch (error) {
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(3000);
    }
  }, 10000);
});