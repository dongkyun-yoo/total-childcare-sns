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

  constructor() {
    this.kakaoProvider = new KakaoProvider();
    this.initializeProviders();
  }

  private async initializeProviders(): Promise<void> {
    try {
      // 카카오 토큰 설정 (환경변수에서)
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
      // 메시지 저장
      const message = new Message({
        familyId: payload.familyId,
        senderId: payload.senderId,
        recipientIds: payload.recipientIds,
        messageType: payload.messageType,
        channel: payload.channel,
        subject: payload.subject,
        content: payload.content,
        metadata: payload.metadata,
        scheduledAt: payload.scheduledAt,
        priority: payload.priority
      });

      await message.save();
      
      // 즉시 발송 또는 예약
      if (!payload.scheduledAt || payload.scheduledAt <= new Date()) {
        await this.processMessage(message._id.toString());
      }

      logger.info('Message queued successfully', { 
        messageId: message._id,
        familyId: payload.familyId,
        type: payload.messageType 
      });

      return message._id.toString();
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw new Error('Message sending failed');
    }
  }

  async processMessage(messageId: string): Promise<boolean> {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        logger.error('Message not found', { messageId });
        return false;
      }

      if (message.status !== MessageStatus.PENDING) {
        logger.warn('Message already processed', { messageId, status: message.status });
        return false;
      }

      let success = false;

      switch (message.channel) {
        case MessageChannel.KAKAO:
          success = await this.sendViaKakao(message);
          break;
        case MessageChannel.SMS:
          success = await this.sendViaSMS(message);
          break;
        case MessageChannel.PUSH:
          success = await this.sendViaPush(message);
          break;
        case MessageChannel.IN_APP:
          success = await this.sendViaInApp(message);
          break;
        default:
          logger.error('Unsupported message channel', { channel: message.channel });
          await message.markAsFailed('Unsupported channel');
          return false;
      }

      if (success) {
        await message.markAsSent();
        logger.info('Message sent successfully', { messageId });
      } else {
        await message.markAsFailed('Provider failed');
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
      // 가족 정보 조회
      const pgPool = DatabaseConfig.getPostgreSQLPool();
      const memberQuery = `
        SELECT fm.name, fm.family_id, f.family_name
        FROM family_members fm
        JOIN families f ON fm.family_id = f.id
        WHERE fm.id = $1
      `;
      const memberResult = await pgPool.query(memberQuery, [alert.memberId]);
      
      if (memberResult.rows.length === 0) {
        throw new Error('Member not found');
      }

      const member = memberResult.rows[0];
      
      // 알림 받을 가족 구성원들 조회
      const recipientsQuery = `
        SELECT id FROM family_members 
        WHERE family_id = $1 AND id != $2 AND member_role IN ('parent_admin', 'parent')
      `;
      const recipientsResult = await pgPool.query(recipientsQuery, [member.family_id, alert.memberId]);

      const locationText = alert.safeZoneName || alert.location.address || `위도 ${alert.location.latitude}, 경도 ${alert.location.longitude}`;
      const kakaoMessage = this.kakaoProvider.createLocationAlertMessage(
        member.name,
        locationText,
        alert.alertType
      );

      return await this.sendMessage({
        id: '',
        familyId: member.family_id,
        recipientIds: recipientsResult.rows.map(r => r.id),
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
      // 수신자가 지정되지 않으면 가족 전체에게
      let recipients = recipientIds;
      if (!recipients) {
        const pgPool = DatabaseConfig.getPostgreSQLPool();
        const query = `SELECT id FROM family_members WHERE family_id = $1 AND id != $2`;
        const result = await pgPool.query(query, [familyId, senderId]);
        recipients = result.rows.map(r => r.id);
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

      const results = await this.kakaoProvider.sendToMultiple(message.recipientIds, kakaoMessage);
      
      // 부분 성공도 성공으로 처리 (일부 수신자에게라도 전달됨)
      return results.success.length > 0;
    } catch (error) {
      logger.error('Kakao sending failed:', error);
      return false;
    }
  }

  private async sendViaSMS(message: any): Promise<boolean> {
    // SMS 발송 로직 구현 (Twilio, AWS SNS 등)
    logger.warn('SMS provider not implemented yet');
    return false;
  }

  private async sendViaPush(message: any): Promise<boolean> {
    // Push 알림 발송 로직 구현 (FCM 등)
    logger.warn('Push notification provider not implemented yet');
    return false;
  }

  private async sendViaInApp(message: any): Promise<boolean> {
    try {
      // 인앱 메시지는 Redis에 저장하여 실시간 전송
      const redisClient = DatabaseConfig.getRedisClient();
      
      for (const recipientId of message.recipientIds) {
        const inAppMessage = {
          id: message._id,
          type: message.messageType,
          content: message.content,
          timestamp: new Date(),
          read: false
        };
        
        await redisClient.lpush(`user:${recipientId}:messages`, JSON.stringify(inAppMessage));
        await redisClient.expire(`user:${recipientId}:messages`, 86400); // 24시간 TTL
        
        // WebSocket으로 실시간 전송 (향후 구현)
        // await this.webSocketService.sendToUser(recipientId, inAppMessage);
      }
      
      return true;
    } catch (error) {
      logger.error('In-app message sending failed:', error);
      return false;
    }
  }

  async getMessageHistory(familyId: string, limit: number = 50, offset: number = 0): Promise<any[]> {
    try {
      return await Message.find({ familyId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean();
    } catch (error) {
      logger.error('Failed to get message history:', error);
      throw error;
    }
  }

  async markMessageAsRead(messageId: string, userId: string): Promise<boolean> {
    try {
      const message = await Message.findById(messageId);
      if (!message || !message.recipientIds.includes(userId)) {
        return false;
      }

      if (message.status === MessageStatus.DELIVERED) {
        await message.markAsRead();
      }

      return true;
    } catch (error) {
      logger.error('Failed to mark message as read:', error);
      return false;
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      const count = await Message.countDocuments({
        recipientIds: userId,
        status: { $in: [MessageStatus.SENT, MessageStatus.DELIVERED] }
      });
      
      return count;
    } catch (error) {
      logger.error('Failed to get unread count:', error);
      return 0;
    }
  }
}