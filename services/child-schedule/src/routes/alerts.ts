import { Router } from 'express';
import { db } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

router.get('/history/:childId', async (req, res) => {
  try {
    const childId = parseInt(req.params.childId);
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(
      `SELECT * FROM alert_history 
       WHERE child_id = $1 
       ORDER BY sent_at DESC 
       LIMIT $2 OFFSET $3`,
      [childId, limit, offset]
    );
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Alert history fetch failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/mark-read/:alertId', async (req, res) => {
  try {
    const alertId = parseInt(req.params.alertId);
    
    const result = await db.query(
      'UPDATE alert_history SET read_at = NOW() WHERE id = $1 RETURNING *',
      [alertId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    logger.info('Alert marked as read', { alertId });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Mark alert read failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export { router as alertRouter };