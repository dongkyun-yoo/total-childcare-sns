import cron from 'node-cron';
import { MessageService } from './MessageServiceSupabase';
import { SupabaseConfig } from '../config/supabase';
import { logger } from '../utils/logger';

export class SimpleScheduler {
  private messageService: MessageService;
  private supabase: SupabaseConfig;
  private isRunning = false;

  constructor(messageService: MessageService) {
    this.messageService = messageService;
    this.supabase = SupabaseConfig.getInstance();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Simple scheduler already running');
      return;
    }

    // Railway 환경에서는 외부 cron을 사용하므로 내부 cron은 비활성화
    if (process.env.RAILWAY_ENVIRONMENT) {
      logger.info('Railway environment detected, using external cron');
      this.isRunning = true;
      return;
    }

    // 로컬 개발환경에서만 내부 cron 실행
    cron.schedule('* * * * *', () => {
      this.processScheduledNotifications();
    });

    cron.schedule('*/5 * * * *', () => {
      this.checkSystemHealth();
    });

    this.isRunning = true;
    logger.info('Simple scheduler started (local development mode)');
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    logger.info('Simple scheduler stopped');
  }

  async processScheduledNotifications(): Promise<void> {
    try {
      // 예정된 메시지 처리
      await this.messageService.processScheduledMessages();

      // 곧 시작될 일정들에 대한 알림 생성
      await this.createUpcomingScheduleReminders();
      
    } catch (error) {
      logger.error('Error processing scheduled notifications:', error);
    }
  }

  private async createUpcomingScheduleReminders(): Promise<void> {
    try {
      const client = this.supabase.getClient();
      
      // 앞으로 35분 이내에 시작되는 일정들 조회
      const { data: schedules, error } = await client
        .from('child_schedules')
        .select(`
          *,
          family_members!inner(id, name, family_id),
          activity_places(place_name)
        `)
        .eq('status', 'scheduled')
        .gte('start_time', new Date().toISOString())
        .lte('start_time', new Date(Date.now() + 35 * 60 * 1000).toISOString());

      if (error) throw error;

      for (const schedule of schedules || []) {
        const startTime = new Date(schedule.start_time);
        const now = new Date();
        const minutesUntilStart = Math.round((startTime.getTime() - now.getTime()) / (1000 * 60));

        // 30분 전, 10분 전, 시작 시간에 알림
        if ([30, 10, 0].includes(minutesUntilStart)) {
          await this.scheduleReminder(schedule, minutesUntilStart);
        }
      }
    } catch (error) {
      logger.error('Failed to create upcoming schedule reminders:', error);
    }
  }

  private async scheduleReminder(schedule: any, minutesLeft: number): Promise<void> {
    try {
      // 이미 발송된 알림인지 확인
      const client = this.supabase.getClient();
      const { data: existingMessage } = await client
        .from('family_messages')
        .select('id')
        .eq('message_type', 'schedule_reminder')
        .contains('metadata', { scheduleId: schedule.id, reminderType: minutesLeft })
        .single();

      if (existingMessage) {
        return; // 이미 발송됨
      }

      // 가족 구성원들 (부모) 조회
      const { data: recipients } = await client
        .from('family_members')
        .select('id')
        .eq('family_id', schedule.family_members.family_id)
        .in('member_role', ['parent_admin', 'parent']);

      if (!recipients || recipients.length === 0) {
        return;
      }

      await this.messageService.sendScheduleReminder({
        familyId: schedule.family_members.family_id,
        recipientIds: recipients.map(r => r.id),
        childName: schedule.family_members.name,
        placeName: schedule.activity_places?.place_name || schedule.title,
        startTime: new Date(schedule.start_time),
        reminderType: minutesLeft
      });

      logger.info('Schedule reminder sent', {
        scheduleId: schedule.id,
        childName: schedule.family_members.name,
        minutesLeft
      });
    } catch (error) {
      logger.error('Failed to schedule reminder:', error);
    }
  }

  private async checkSystemHealth(): Promise<void> {
    try {
      const isHealthy = await this.supabase.healthCheck();
      
      if (!isHealthy) {
        logger.error('Supabase health check failed');
      }

      logger.info('System health check completed', { supabaseHealthy: isHealthy });
    } catch (error) {
      logger.error('System health check failed:', error);
    }
  }

  // Railway 외부 cron에서 호출될 엔드포인트용 메서드
  async handleExternalCron(type: 'scheduled' | 'health'): Promise<{ success: boolean; message: string }> {
    try {
      switch (type) {
        case 'scheduled':
          await this.processScheduledNotifications();
          return { success: true, message: 'Scheduled notifications processed' };
        
        case 'health':
          await this.checkSystemHealth();
          return { success: true, message: 'Health check completed' };
        
        default:
          return { success: false, message: 'Unknown cron type' };
      }
    } catch (error) {
      logger.error(`External cron ${type} failed:`, error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}