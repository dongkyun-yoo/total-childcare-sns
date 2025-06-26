import { Router } from 'express';
import { z } from 'zod';
import { db, redis } from '../config/database';
import { logger } from '../utils/logger';
import { calculateDistance, isPointInCircle } from 'geolib';

const router = Router();

const locationUpdateSchema = z.object({
  user_id: z.number(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  altitude: z.number().optional(),
  heading: z.number().optional(),
  speed: z.number().optional()
});

router.post('/update', async (req, res) => {
  try {
    const locationData = locationUpdateSchema.parse(req.body);
    
    const result = await db.query(
      `INSERT INTO location_history (user_id, latitude, longitude, accuracy, altitude, heading, speed, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        locationData.user_id,
        locationData.latitude,
        locationData.longitude,
        locationData.accuracy,
        locationData.altitude,
        locationData.heading,
        locationData.speed
      ]
    );
    
    await redis.setEx(
      `location:${locationData.user_id}`,
      300,
      JSON.stringify({
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        timestamp: new Date().toISOString()
      })
    );
    
    await checkGeofences(locationData);
    
    logger.info('Location updated', { userId: locationData.user_id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Location update failed', error);
    res.status(400).json({ error: 'Invalid location data' });
  }
});

router.get('/current/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const cached = await redis.get(`location:${userId}`);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    const result = await db.query(
      `SELECT * FROM location_history 
       WHERE user_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Location fetch failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/history/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { from, to, limit = 100 } = req.query;
    
    let query = 'SELECT * FROM location_history WHERE user_id = $1';
    const params = [userId];
    
    if (from) {
      query += ' AND timestamp >= $2';
      params.push(from as string);
    }
    
    if (to) {
      query += ` AND timestamp <= $${params.length + 1}`;
      params.push(to as string);
    }
    
    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit as string);
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Location history fetch failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/distance/:userId1/:userId2', async (req, res) => {
  try {
    const userId1 = parseInt(req.params.userId1);
    const userId2 = parseInt(req.params.userId2);
    
    const [location1, location2] = await Promise.all([
      redis.get(`location:${userId1}`),
      redis.get(`location:${userId2}`)
    ]);
    
    if (!location1 || !location2) {
      return res.status(404).json({ error: 'Location data not available' });
    }
    
    const loc1 = JSON.parse(location1);
    const loc2 = JSON.parse(location2);
    
    const distance = calculateDistance(
      { latitude: loc1.latitude, longitude: loc1.longitude },
      { latitude: loc2.latitude, longitude: loc2.longitude }
    );
    
    res.json({
      distance_meters: distance,
      distance_km: (distance / 1000).toFixed(2),
      user1: userId1,
      user2: userId2
    });
  } catch (error) {
    logger.error('Distance calculation failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

async function checkGeofences(location: any) {
  try {
    const geofences = await db.query(
      'SELECT * FROM geofences WHERE user_id = $1 AND active = true',
      [location.user_id]
    );
    
    for (const geofence of geofences.rows) {
      const isInside = isPointInCircle(
        { latitude: location.latitude, longitude: location.longitude },
        { latitude: geofence.center_lat, longitude: geofence.center_lng },
        geofence.radius
      );
      
      const wasInside = await redis.get(`geofence:${geofence.id}:${location.user_id}`);
      
      if (isInside && !wasInside) {
        await redis.setEx(`geofence:${geofence.id}:${location.user_id}`, 3600, 'true');
        logger.info('User entered geofence', { userId: location.user_id, geofenceId: geofence.id });
      } else if (!isInside && wasInside) {
        await redis.del(`geofence:${geofence.id}:${location.user_id}`);
        logger.warn('User left geofence', { userId: location.user_id, geofenceId: geofence.id });
      }
    }
  } catch (error) {
    logger.error('Geofence check failed', error);
  }
}

export { router as locationRouter };