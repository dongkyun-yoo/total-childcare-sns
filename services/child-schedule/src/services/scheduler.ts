import cron from 'node-cron';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { sendAlert } from './alertService';

export function initScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      await checkUpcomingSchedules();
    } catch (error) {
      logger.error('Scheduler error:', error);
    }
  });
  
  logger.info('Scheduler initialized - checking every minute');
}

async function checkUpcomingSchedules() {
  const now = new Date();
  const thirtyMinLater = new Date(now.getTime() + 30 * 60 * 1000);
  const tenMinLater = new Date(now.getTime() + 10 * 60 * 1000);
  
  await check30MinAlerts(now, thirtyMinLater);
  await check10MinAlerts(now, tenMinLater);
  await checkLateAlerts(now);
}

async function check30MinAlerts(now: Date, thirtyMinLater: Date) {
  const result = await db.query(
    `SELECT s.*, u.name as child_name, f.name as family_name 
     FROM schedules s
     JOIN users u ON s.child_id = u.id
     JOIN families f ON u.family_id = f.id
     WHERE s.start_time BETWEEN $1 AND $2 
     AND s.alert_30min = true 
     AND s.alert_30min_sent = false`,
    [now.toISOString(), thirtyMinLater.toISOString()]
  );
  
  for (const schedule of result.rows) {
    await sendAlert({
      type: '30min_warning',
      schedule,
      message: `${schedule.child_name}님의 "${schedule.title}" 일정이 30분 후 시작됩니다.`
    });
    
    await db.query(
      'UPDATE schedules SET alert_30min_sent = true WHERE id = $1',
      [schedule.id]
    );
    
    logger.info('30min alert sent', { scheduleId: schedule.id });
  }
}

async function check10MinAlerts(now: Date, tenMinLater: Date) {
  const result = await db.query(
    `SELECT s.*, u.name as child_name, f.name as family_name 
     FROM schedules s
     JOIN users u ON s.child_id = u.id
     JOIN families f ON u.family_id = f.id
     WHERE s.start_time BETWEEN $1 AND $2 
     AND s.alert_10min = true 
     AND s.alert_10min_sent = false`,
    [now.toISOString(), tenMinLater.toISOString()]
  );
  
  for (const schedule of result.rows) {
    await sendAlert({
      type: '10min_warning',
      schedule,
      message: `${schedule.child_name}님의 "${schedule.title}" 일정이 10분 후 시작됩니다. 준비해주세요!`
    });
    
    await db.query(
      'UPDATE schedules SET alert_10min_sent = true WHERE id = $1',
      [schedule.id]
    );
    
    logger.info('10min alert sent', { scheduleId: schedule.id });
  }
}

async function checkLateAlerts(now: Date) {
  const result = await db.query(
    `SELECT s.*, u.name as child_name, f.name as family_name 
     FROM schedules s
     JOIN users u ON s.child_id = u.id
     JOIN families f ON u.family_id = f.id
     WHERE s.start_time < $1 
     AND s.alert_late = true 
     AND s.alert_late_sent = false
     AND s.status != 'completed'`,
    [now.toISOString()]
  );
  
  for (const schedule of result.rows) {
    await sendAlert({
      type: 'late_warning',
      schedule,
      message: `⚠️ ${schedule.child_name}님이 "${schedule.title}" 일정에 지각하고 있습니다!`
    });
    
    await db.query(
      'UPDATE schedules SET alert_late_sent = true WHERE id = $1',
      [schedule.id]
    );
    
    logger.warn('Late alert sent', { scheduleId: schedule.id });
  }
}