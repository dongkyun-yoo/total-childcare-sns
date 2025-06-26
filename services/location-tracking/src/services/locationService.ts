import { Server } from 'socket.io';
import { db, redis } from '../config/database';
import { logger } from '../utils/logger';
import { calculateDistance } from 'geolib';

interface LocationUpdate {
  userId: number;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export function initLocationTracking(io: Server) {
  io.on('connection', (socket) => {
    logger.info('Client connected', { socketId: socket.id });
    
    socket.on('join_family', (familyId: string) => {
      socket.join(`family_${familyId}`);
      logger.info('User joined family room', { socketId: socket.id, familyId });
    });
    
    socket.on('location_update', async (data: LocationUpdate) => {
      try {
        await handleLocationUpdate(data, socket, io);
      } catch (error) {
        logger.error('Location update handling failed', error);
        socket.emit('error', { message: 'Failed to process location update' });
      }
    });
    
    socket.on('request_location', async (targetUserId: number) => {
      try {
        const location = await redis.get(`location:${targetUserId}`);
        if (location) {
          socket.emit('location_response', JSON.parse(location));
        } else {
          socket.emit('location_response', { error: 'Location not available' });
        }
      } catch (error) {
        logger.error('Location request failed', error);
        socket.emit('error', { message: 'Failed to fetch location' });
      }
    });
    
    socket.on('disconnect', () => {
      logger.info('Client disconnected', { socketId: socket.id });
    });
  });
  
  setInterval(async () => {
    await checkInactiveUsers();
  }, 60000);
  
  logger.info('Location tracking service initialized');
}

async function handleLocationUpdate(data: LocationUpdate, socket: any, io: Server) {
  await redis.setEx(
    `location:${data.userId}`,
    300,
    JSON.stringify({
      latitude: data.latitude,
      longitude: data.longitude,
      timestamp: data.timestamp,
      socketId: socket.id
    })
  );
  
  await db.query(
    `INSERT INTO location_history (user_id, latitude, longitude, timestamp)
     VALUES ($1, $2, $3, $4)`,
    [data.userId, data.latitude, data.longitude, data.timestamp]
  );
  
  const familyResult = await db.query(
    'SELECT family_id FROM users WHERE id = $1',
    [data.userId]
  );
  
  if (familyResult.rows.length > 0) {
    const familyId = familyResult.rows[0].family_id;
    
    socket.to(`family_${familyId}`).emit('family_location_update', {
      userId: data.userId,
      latitude: data.latitude,
      longitude: data.longitude,
      timestamp: data.timestamp
    });
  }
  
  await checkProximityAlerts(data);
  await checkSpeedAlerts(data);
  
  logger.debug('Location update processed', { userId: data.userId });
}

async function checkProximityAlerts(location: LocationUpdate) {
  try {
    const familyMembers = await db.query(
      `SELECT u.id, u.name FROM users u 
       JOIN users target ON u.family_id = target.family_id 
       WHERE target.id = $1 AND u.id != $1`,
      [location.userId]
    );
    
    for (const member of familyMembers.rows) {
      const memberLocation = await redis.get(`location:${member.id}`);
      if (memberLocation) {
        const memberPos = JSON.parse(memberLocation);
        const distance = calculateDistance(
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: memberPos.latitude, longitude: memberPos.longitude }
        );
        
        if (distance < 100) {
          logger.info('Proximity alert', {
            user1: location.userId,
            user2: member.id,
            distance
          });
        }
      }
    }
  } catch (error) {
    logger.error('Proximity check failed', error);
  }
}

async function checkSpeedAlerts(location: LocationUpdate) {
  try {
    const prevLocationKey = `prev_location:${location.userId}`;
    const prevLocation = await redis.get(prevLocationKey);
    
    if (prevLocation) {
      const prev = JSON.parse(prevLocation);
      const distance = calculateDistance(
        { latitude: location.latitude, longitude: location.longitude },
        { latitude: prev.latitude, longitude: prev.longitude }
      );
      
      const timeDiff = (new Date(location.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
      const speed = distance / timeDiff;
      
      if (speed > 30) {
        logger.warn('High speed detected', {
          userId: location.userId,
          speed: speed.toFixed(2),
          distance,
          timeDiff
        });
        
        await db.query(
          `INSERT INTO speed_alerts (user_id, speed, latitude, longitude, timestamp)
           VALUES ($1, $2, $3, $4, $5)`,
          [location.userId, speed, location.latitude, location.longitude, location.timestamp]
        );
      }
    }
    
    await redis.setEx(prevLocationKey, 300, JSON.stringify(location));
  } catch (error) {
    logger.error('Speed check failed', error);
  }
}

async function checkInactiveUsers() {
  try {
    const activeUsers = await redis.keys('location:*');
    const inactiveThreshold = new Date(Date.now() - 10 * 60 * 1000);
    
    for (const key of activeUsers) {
      const location = await redis.get(key);
      if (location) {
        const data = JSON.parse(location);
        if (new Date(data.timestamp) < inactiveThreshold) {
          const userId = key.split(':')[1];
          logger.warn('User inactive', { userId, lastSeen: data.timestamp });
          
          await db.query(
            `INSERT INTO user_status_alerts (user_id, alert_type, message, timestamp)
             VALUES ($1, 'inactive', 'User has been inactive for 10+ minutes', NOW())`,
            [userId]
          );
        }
      }
    }
  } catch (error) {
    logger.error('Inactive user check failed', error);
  }
}