import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

const geofenceSchema = z.object({
  user_id: z.number(),
  name: z.string().min(1),
  center_lat: z.number().min(-90).max(90),
  center_lng: z.number().min(-180).max(180),
  radius: z.number().min(10).max(10000),
  type: z.enum(['safe_zone', 'alert_zone', 'restricted_zone']),
  alert_on_enter: z.boolean().default(true),
  alert_on_exit: z.boolean().default(true)
});

router.post('/', async (req, res) => {
  try {
    const geofenceData = geofenceSchema.parse(req.body);
    
    const result = await db.query(
      `INSERT INTO geofences (user_id, name, center_lat, center_lng, radius, type, alert_on_enter, alert_on_exit, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       RETURNING *`,
      [
        geofenceData.user_id,
        geofenceData.name,
        geofenceData.center_lat,
        geofenceData.center_lng,
        geofenceData.radius,
        geofenceData.type,
        geofenceData.alert_on_enter,
        geofenceData.alert_on_exit
      ]
    );
    
    logger.info('Geofence created', { geofenceId: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Geofence creation failed', error);
    res.status(400).json({ error: 'Invalid geofence data' });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const result = await db.query(
      'SELECT * FROM geofences WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Geofence fetch failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = geofenceSchema.partial().parse(req.body);
    
    const fields = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];
    
    const result = await db.query(
      `UPDATE geofences SET ${fields} WHERE id = $1 RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Geofence not found' });
    }
    
    logger.info('Geofence updated', { geofenceId: id });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Geofence update failed', error);
    res.status(400).json({ error: 'Invalid update data' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const result = await db.query(
      'UPDATE geofences SET active = false WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Geofence not found' });
    }
    
    logger.info('Geofence deactivated', { geofenceId: id });
    res.status(204).send();
  } catch (error) {
    logger.error('Geofence deletion failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/alerts/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(
      `SELECT ga.*, g.name as geofence_name 
       FROM geofence_alerts ga
       JOIN geofences g ON ga.geofence_id = g.id
       WHERE ga.user_id = $1 
       ORDER BY ga.triggered_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Geofence alerts fetch failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export { router as geofenceRouter };