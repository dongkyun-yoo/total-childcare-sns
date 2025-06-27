export enum MessageType {
  SCHEDULE_REMINDER = 'schedule_reminder',
  LOCATION_ALERT = 'location_alert',
  EMERGENCY = 'emergency',
  FAMILY_MESSAGE = 'family_message',
  AUTO_RESPONSE = 'auto_response'
}

export enum MessageChannel {
  KAKAO = 'kakao',
  SMS = 'sms',
  PUSH = 'push',
  IN_APP = 'in_app'
}

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export enum NotificationTiming {
  FIRST_REMINDER = 30, // 30분 전
  SECOND_REMINDER = 10, // 10분 전
  URGENT_ALERT = 0 // 지각 위험
}

export interface MessagePayload {
  id: string;
  familyId: string;
  senderId?: string;
  recipientIds: string[];
  messageType: MessageType;
  channel: MessageChannel;
  subject?: string;
  content: string;
  metadata?: Record<string, any>;
  scheduledAt?: Date;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface KakaoMessage {
  template_object: {
    object_type: 'text' | 'location' | 'feed';
    text: string;
    link?: {
      web_url?: string;
      mobile_web_url?: string;
    };
    button_title?: string;
  };
  receiver_uuids?: string[];
}

export interface ScheduleReminder {
  scheduleId: string;
  childId: string;
  placeName: string;
  startTime: Date;
  reminderType: 'first' | 'second' | 'urgent';
}

export interface LocationAlert {
  memberId: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  alertType: 'enter_safe_zone' | 'exit_safe_zone' | 'route_deviation' | 'emergency';
  safeZoneName?: string;
}