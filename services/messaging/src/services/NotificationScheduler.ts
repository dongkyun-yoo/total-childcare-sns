import cron from 'node-cron';
import Bull from 'bull';
import { DatabaseConfig } from '../config/database';
import { logger } from '../utils/logger';
import { MessageService } from './MessageService';
import { MessageType, MessageChannel, NotificationTiming } from '../types';

export class NotificationScheduler {
  private messageService: MessageService;
  private notificationQueue: Bull.Queue;
  private isRunning = false;

  constructor(messageService: MessageService) {
    this.messageService = messageService;
    this.notificationQueue = new Bull('notification queue', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379')
      }
    });

    this.setupQueueProcessors();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Notification scheduler already running');
      return;
    }

    // 매분마다 예정된 알림 체크
    cron.schedule('* * * * *', () => {
      this.processScheduledNotifications();
    });

    // 매 5분마다 큐 상태 체크
    cron.schedule('*/5 * * * *', () => {
      this.checkQueueHealth();
    });

    this.isRunning = true;
    logger.info('Notification scheduler started');
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.notificationQueue.close();
    logger.info('Notification scheduler stopped');
  }

  private setupQueueProcessors(): void {
    // 일정 알림 처리
    this.notificationQueue.process('schedule-reminder', async (job) => {
      const { scheduleId, childId, placeName, startTime, reminderType } = job.data;
      await this.processScheduleReminder(scheduleId, childId, placeName, startTime, reminderType);
    });

    // 위치 알림 처리
    this.notificationQueue.process('location-alert', async (job) => {
      const { memberId, location, alertType, safeZoneName } = job.data;
      await this.processLocationAlert(memberId, location, alertType, safeZoneName);
    });

    // 일반 메시지 처리
    this.notificationQueue.process('family-message', async (job) => {
      const { messageId } = job.data;
      await this.processMessage(messageId);
    });
  }

  async scheduleNotification(type: string, data: any, delayMs: number = 0): Promise<void> {
    await this.notificationQueue.add(type, data, {
      delay: delayMs,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 10,
      removeOnFail: 5
    });

    logger.info(`Notification scheduled: ${type}`, { data, delayMs });
  }

  async scheduleChildScheduleReminders(scheduleId: string, childId: string, placeName: string, startTime: Date): Promise<void> {
    const now = new Date();
    const scheduleTime = new Date(startTime);

    // 1차 알림: 30분 전
    const firstReminderTime = new Date(scheduleTime.getTime() - (NotificationTiming.FIRST_REMINDER * 60 * 1000));
    if (firstReminderTime > now) {
      const delay = firstReminderTime.getTime() - now.getTime();
      await this.scheduleNotification('schedule-reminder', {
        scheduleId,
        childId,
        placeName,
        startTime: scheduleTime,
        reminderType: 'first'
      }, delay);
    }

    // 2차 알림: 10분 전
    const secondReminderTime = new Date(scheduleTime.getTime() - (NotificationTiming.SECOND_REMINDER * 60 * 1000));
    if (secondReminderTime > now) {
      const delay = secondReminderTime.getTime() - now.getTime();
      await this.scheduleNotification('schedule-reminder', {
        scheduleId,
        childId,
        placeName,
        startTime: scheduleTime,
        reminderType: 'second'
      }, delay);
    }

    // 긴급 알림: 예정 시간
    if (scheduleTime > now) {
      const delay = scheduleTime.getTime() - now.getTime();
      await this.scheduleNotification('schedule-reminder', {
        scheduleId,
        childId,
        placeName,
        startTime: scheduleTime,
        reminderType: 'urgent'
      }, delay);
    }

    logger.info('Schedule reminders created', { scheduleId, childId, placeName, startTime });
  }

  private async processScheduledNotifications(): Promise<void> {
    try {
      const pgPool = DatabaseConfig.getPostgreSQLPool();
      
      // 예정된 메시지 조회
      const query = `
        SELECT cs.id, cs.child_member_id, cs.title, cs.start_time, ap.place_name, fm.family_id
        FROM child_schedules cs
        JOIN family_members fm ON cs.child_member_id = fm.id
        LEFT JOIN activity_places ap ON cs.place_id = ap.id
        WHERE cs.start_time > NOW() AND cs.start_time <= NOW() + INTERVAL '30 minutes'
        AND cs.status = 'scheduled'
      `;

      const result = await pgPool.query(query);
      
      for (const schedule of result.rows) {
        await this.scheduleChildScheduleReminders(
          schedule.id,
          schedule.child_member_id,
          schedule.place_name || schedule.title,
          schedule.start_time
        );
      }
    } catch (error) {
      logger.error('Error processing scheduled notifications:', error);
    }
  }

  private async processScheduleReminder(scheduleId: string, childId: string, placeName: string, startTime: Date, reminderType: string): Promise<void> {
    try {
      const pgPool = DatabaseConfig.getPostgreSQLPool();
      
      // 자녀 정보 조회
      const childQuery = `
        SELECT fm.name, fm.family_id, f.family_name
        FROM family_members fm
        JOIN families f ON fm.family_id = f.id
        WHERE fm.id = $1
      `;
      const childResult = await pgPool.query(childQuery, [childId]);
      
      if (childResult.rows.length === 0) {
        logger.error('Child not found for schedule reminder', { scheduleId, childId });
        return;
      }

      const child = childResult.rows[0];
      
      // 가족 구성원들에게 알림 발송
      const recipientsQuery = `
        SELECT id, name FROM family_members 
        WHERE family_id = $1 AND member_role IN ('parent_admin', 'parent')
      `;
      const recipientsResult = await pgPool.query(recipientsQuery, [child.family_id]);

      const timeLeft = reminderType === 'first' ? 30 : reminderType === 'second' ? 10 : 0;
      
      await this.messageService.sendScheduleReminder({
        familyId: child.family_id,
        recipientIds: recipientsResult.rows.map(r => r.id),
        childName: child.name,
        placeName,
        startTime,
        reminderType: timeLeft
      });

    } catch (error) {
      logger.error('Error processing schedule reminder:', error);
    }
  }

  private async processLocationAlert(memberId: string, location: any, alertType: string, safeZoneName?: string): Promise<void> {
    try {
      await this.messageService.sendLocationAlert({
        memberId,
        location,
        alertType,
        safeZoneName
      });
    } catch (error) {
      logger.error('Error processing location alert:', error);
    }
  }

  private async processMessage(messageId: string): Promise<void> {
    try {
      await this.messageService.processMessage(messageId);
    } catch (error) {
      logger.error('Error processing message:', error);
    }
  }

  private async checkQueueHealth(): Promise<void> {
    try {
      const waiting = await this.notificationQueue.getWaiting();
      const active = await this.notificationQueue.getActive();
      const failed = await this.notificationQueue.getFailed();

      logger.info('Queue health check', {
        waiting: waiting.length,
        active: active.length,
        failed: failed.length
      });

      // 실패한 작업들 재시도
      if (failed.length > 0) {
        logger.warn(`Found ${failed.length} failed jobs, retrying...`);
        for (const job of failed) {
          if (job.opts.attempts && job.attemptsMade < job.opts.attempts) {
            await job.retry();
          }
        }
      }
    } catch (error) {
      logger.error('Queue health check failed:', error);
    }
  }
}