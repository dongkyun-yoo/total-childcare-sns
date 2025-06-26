import { db } from '../config/database';
import { logger } from '../utils/logger';

interface AlertData {
  type: '30min_warning' | '10min_warning' | 'late_warning';
  schedule: any;
  message: string;
}

export async function sendAlert(alertData: AlertData) {
  try {
    await db.query(
      `INSERT INTO alert_history (child_id, schedule_id, alert_type, message, sent_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        alertData.schedule.child_id,
        alertData.schedule.id,
        alertData.type,
        alertData.message
      ]
    );
    
    await sendToMessagingService(alertData);
    
    logger.info('Alert sent successfully', {
      type: alertData.type,
      scheduleId: alertData.schedule.id,
      childId: alertData.schedule.child_id
    });
  } catch (error) {
    logger.error('Alert sending failed', error);
    throw error;
  }
}

async function sendToMessagingService(alertData: AlertData) {
  logger.info('Sending to messaging service', {
    type: alertData.type,
    message: alertData.message
  });
}