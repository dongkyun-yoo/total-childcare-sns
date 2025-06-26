import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

const scheduleSchema = z.object({
  child_id: z.number(),
  title: z.string().min(1),
  description: z.string().optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  location: z.string().optional(),
  alert_30min: z.boolean().default(true),
  alert_10min: z.boolean().default(true),
  alert_late: z.boolean().default(true)
});

router.post('/', async (req, res) => {
  try {
    const scheduleData = scheduleSchema.parse(req.body);
    
    const result = await db.query(
      `INSERT INTO schedules (child_id, title, description, start_time, end_time, location, alert_30min, alert_10min, alert_late)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        scheduleData.child_id,
        scheduleData.title,
        scheduleData.description,
        scheduleData.start_time,
        scheduleData.end_time,
        scheduleData.location,
        scheduleData.alert_30min,
        scheduleData.alert_10min,
        scheduleData.alert_late
      ]
    );
    
    logger.info('Schedule created', { scheduleId: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Schedule creation failed', error);
    res.status(400).json({ error: 'Invalid schedule data' });
  }
});

router.get('/child/:childId', async (req, res) => {
  try {
    const childId = parseInt(req.params.childId);
    const { date } = req.query;
    
    let query = 'SELECT * FROM schedules WHERE child_id = $1';
    const params = [childId];
    
    if (date) {
      query += ' AND DATE(start_time) = $2';
      params.push(date as string);
    }
    
    query += ' ORDER BY start_time ASC';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Schedule fetch failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = scheduleSchema.partial().parse(req.body);
    
    const fields = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];
    
    const result = await db.query(
      `UPDATE schedules SET ${fields} WHERE id = $1 RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    logger.info('Schedule updated', { scheduleId: id });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Schedule update failed', error);
    res.status(400).json({ error: 'Invalid update data' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const result = await db.query('DELETE FROM schedules WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    logger.info('Schedule deleted', { scheduleId: id });
    res.status(204).send();
  } catch (error) {
    logger.error('Schedule deletion failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export { router as scheduleRouter };