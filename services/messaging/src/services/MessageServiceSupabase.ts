import { KakaoProvider } from '../providers/KakaoProvider';
import { SupabaseConfig } from '../config/supabase';
import { logger } from '../utils/logger';
import { 
  MessagePayload, 
  MessageType, 
  MessageChannel, 
  MessageStatus,
  ScheduleReminder,
  LocationAlert 
} from '../types';

export class MessageService {
  private kakaoProvider: KakaoProvider;
  private supabase: SupabaseConfig;

  constructor() {
    this.kakaoProvider = new KakaoProvider();
    this.supabase = SupabaseConfig.getInstance();
    this.initializeProviders();
  }

  private async initializeProviders(): Promise<void> {
    try {
      const kakaoToken = process.env.KAKAO_ACCESS_TOKEN;
      if (kakaoToken) {
        this.kakaoProvider.setAccessToken(kakaoToken);
        const isValid = await this.kakaoProvider.validateConnection();
        if (isValid) {
          logger.info('Kakao provider initialized successfully');
        } else {
          logger.warn('Kakao provider validation failed');
        }
      } else {
        logger.warn('Kakao access token not found in environment');
      }
    } catch (error) {
      logger.error('Failed to initialize message providers:', error);
    }
  }

  async sendMessage(payload: MessagePayload): Promise<string> {
    try {
      const message = await this.supabase.insertMessage({
        family_id: payload.familyId,
        sender_id: payload.senderId || null,
        recipient_ids: payload.recipientIds,
        message_type: payload.messageType,
        channel: payload.channel,
        subject: payload.subject || null,
        content: payload.content,
        metadata: payload.metadata || {},
        scheduled_at: payload.scheduledAt?.toISOString() || null,
        priority: payload.priority
      });

      // 즉시 발송 또는 예약
      if (!payload.scheduledAt || payload.scheduledAt <= new Date()) {
        await this.processMessage(message.id);
      }

      logger.info('Message queued successfully', { 
        messageId: message.id,
        familyId: payload.familyId,
        type: payload.messageType 
      });

      return message.id;
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw new Error('Message sending failed');
    }
  }

  async processMessage(messageId: string): Promise<boolean> {
    try {
      const client = this.supabase.getClient();
      const { data: message, error } = await client
        .from('family_messages')
        .select('*')
        .eq('id', messageId)
        .single();

      if (error || !message) {
        logger.error('Message not found', { messageId, error });
        return false;
      }

      if (message.status !== 'pending') {
        logger.warn('Message already processed', { messageId, status: message.status });
        return false;
      }

      let success = false;

      switch (message.channel) {
        case 'kakao':
          success = await this.sendViaKakao(message);
          break;
        case 'sms':
          success = await this.sendViaSMS(message);
          break;
        case 'push':
          success = await this.sendViaPush(message);
          break;
        case 'in_app':
          success = await this.sendViaInApp(message);
          break;
        default:
          logger.error('Unsupported message channel', { channel: message.channel });
          await this.supabase.updateMessageStatus(messageId, 'failed', {
            failure_reason: 'Unsupported channel'
          });
          return false;
      }

      if (success) {
        await this.supabase.updateMessageStatus(messageId, 'sent');
        logger.info('Message sent successfully', { messageId });
      } else {
        await this.supabase.updateMessageStatus(messageId, 'failed', {
          failure_reason: 'Provider failed',
          retry_count: message.retry_count + 1
        });
        logger.error('Message sending failed', { messageId });
      }

      return success;
    } catch (error) {
      logger.error('Error processing message:', error);
      return false;
    }
  }

  async sendScheduleReminder(reminder: {
    familyId: string;
    recipientIds: string[];
    childName: string;
    placeName: string;
    startTime: Date;
    reminderType: number; // 30, 10, 0
  }): Promise<string> {
    const kakaoMessage = this.kakaoProvider.createScheduleReminderMessage(
      reminder.childName,
      reminder.placeName,
      reminder.reminderType
    );

    return await this.sendMessage({
      id: '',
      familyId: reminder.familyId,
      recipientIds: reminder.recipientIds,
      messageType: MessageType.SCHEDULE_REMINDER,
      channel: MessageChannel.KAKAO,
      subject: `일정 알림 - ${reminder.placeName}`,
      content: kakaoMessage.template_object.text,
      metadata: {
        scheduleInfo: {
          childName: reminder.childName,
          placeName: reminder.placeName,
          startTime: reminder.startTime,
          reminderType: reminder.reminderType
        }
      },
      priority: reminder.reminderType === 0 ? 'urgent' : 'high'
    });
  }

  async sendLocationAlert(alert: {
    memberId: string;
    location: { latitude: number; longitude: number; address?: string };
    alertType: string;
    safeZoneName?: string;
  }): Promise<string> {
    try {
      const familyMembers = await this.supabase.getFamilyMembers(alert.memberId);
      const member = familyMembers.find(m => m.id === alert.memberId);
      
      if (!member) {
        throw new Error('Member not found');
      }

      const recipients = familyMembers
        .filter(m => m.id !== alert.memberId && ['parent_admin', 'parent'].includes(m.member_role))
        .map(m => m.id);

      const locationText = alert.safeZoneName || alert.location.address || 
        `위도 ${alert.location.latitude}, 경도 ${alert.location.longitude}`;
      
      const kakaoMessage = this.kakaoProvider.createLocationAlertMessage(
        member.name,
        locationText,
        alert.alertType
      );

      return await this.sendMessage({
        id: '',
        familyId: member.family_id,
        recipientIds: recipients,
        messageType: MessageType.LOCATION_ALERT,
        channel: MessageChannel.KAKAO,
        subject: '위치 알림',
        content: kakaoMessage.template_object.text,
        metadata: {
          locationInfo: {
            memberId: alert.memberId,
            memberName: member.name,
            location: alert.location,
            alertType: alert.alertType,
            safeZoneName: alert.safeZoneName
          }
        },
        priority: alert.alertType === 'emergency' ? 'urgent' : 'medium'
      });
    } catch (error) {
      logger.error('Failed to send location alert:', error);
      throw error;
    }
  }

  async sendFamilyMessage(familyId: string, senderId: string, content: string, recipientIds?: string[]): Promise<string> {
    try {
      let recipients = recipientIds;
      if (!recipients) {
        const familyMembers = await this.supabase.getFamilyMembers(familyId);
        recipients = familyMembers
          .filter(m => m.id !== senderId)
          .map(m => m.id);
      }

      return await this.sendMessage({
        id: '',
        familyId,
        senderId,
        recipientIds: recipients,
        messageType: MessageType.FAMILY_MESSAGE,
        channel: MessageChannel.KAKAO,
        content,
        priority: 'medium'
      });
    } catch (error) {
      logger.error('Failed to send family message:', error);
      throw error;
    }
  }

  private async sendViaKakao(message: any): Promise<boolean> {
    try {
      const kakaoMessage = {
        template_object: {
          object_type: 'text' as const,
          text: message.content,
          link: {
            web_url: process.env.WEB_APP_URL,
            mobile_web_url: process.env.WEB_APP_URL
          },
          button_title: '앱에서 확인'
        }
      };

      const results = await this.kakaoProvider.sendToMultiple(message.recipient_ids, kakaoMessage);
      return results.success.length > 0;
    } catch (error) {
      logger.error('Kakao sending failed:', error);
      return false;
    }
  }

  private async sendViaSMS(message: any): Promise<boolean> {
    logger.warn('SMS provider not implemented yet');
    return false;
  }

  private async sendViaPush(message: any): Promise<boolean> {
    logger.warn('Push notification provider not implemented yet');
    return false;
  }

  private async sendViaInApp(message: any): Promise<boolean> {
    try {
      // Supabase Realtime으로 실시간 전송
      const client = this.supabase.getClient();
      
      // 인앱 메시지 테이블에 삽입 (실시간 구독자에게 자동 전송)
      for (const recipientId of message.recipient_ids) {
        await client
          .from('family_messages')
          .update({ status: 'delivered' })
          .eq('id', message.id);
      }
      
      return true;
    } catch (error) {
      logger.error('In-app message sending failed:', error);
      return false;
    }
  }

  async getMessageHistory(familyId: string, limit: number = 50, offset: number = 0): Promise<any[]> {
    try {
      return await this.supabase.getMessageHistory(familyId, limit, offset);
    } catch (error) {
      logger.error('Failed to get message history:', error);
      throw error;
    }
  }

  async markMessageAsRead(messageId: string, userId: string): Promise<boolean> {
    try {
      const client = this.supabase.getClient();
      const { data: message, error } = await client
        .from('family_messages')
        .select('recipient_ids, status')
        .eq('id', messageId)
        .single();

      if (error || !message || !message.recipient_ids.includes(userId)) {
        return false;
      }

      if (message.status === 'delivered') {
        await this.supabase.updateMessageStatus(messageId, 'read');
      }

      return true;
    } catch (error) {
      logger.error('Failed to mark message as read:', error);
      return false;
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      const client = this.supabase.getClient();
      const { count, error } = await client
        .from('family_messages')
        .select('*', { count: 'exact', head: true })
        .contains('recipient_ids', [userId])
        .in('status', ['sent', 'delivered']);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      logger.error('Failed to get unread count:', error);
      return 0;
    }
  }

  async processScheduledMessages(): Promise<void> {
    try {
      const scheduledMessages = await this.supabase.getScheduledMessages();
      
      for (const message of scheduledMessages) {
        await this.processMessage(message.id);
      }
      
      logger.info(`Processed ${scheduledMessages.length} scheduled messages`);
    } catch (error) {
      logger.error('Failed to process scheduled messages:', error);
    }
  }
}