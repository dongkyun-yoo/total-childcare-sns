import express from 'express';
import Joi from 'joi';
import { MessageService } from '../services/MessageService';
import { NotificationScheduler } from '../services/NotificationScheduler';
import { logger } from '../utils/logger';
import { MessageType, MessageChannel } from '../types';

const router = express.Router();
const messageService = new MessageService();
const notificationScheduler = new NotificationScheduler(messageService);

// 메시지 발송
router.post('/send', async (req, res) => {
  try {
    const schema = Joi.object({
      familyId: Joi.string().required(),
      senderId: Joi.string().optional(),
      recipientIds: Joi.array().items(Joi.string()).required(),
      messageType: Joi.string().valid(...Object.values(MessageType)).required(),
      channel: Joi.string().valid(...Object.values(MessageChannel)).required(),
      subject: Joi.string().optional(),
      content: Joi.string().required(),
      metadata: Joi.object().optional(),
      scheduledAt: Joi.date().optional(),
      priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium')
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details 
      });
    }

    const messageId = await messageService.sendMessage({
      id: '',
      ...value
    });

    res.status(201).json({ 
      success: true, 
      messageId,
      message: 'Message queued successfully' 
    });
  } catch (error: any) {
    logger.error('Send message API error:', error);
    res.status(500).json({ 
      error: 'Failed to send message', 
      details: error.message 
    });
  }
});

// 일정 알림 발송
router.post('/schedule-reminder', async (req, res) => {
  try {
    const schema = Joi.object({
      familyId: Joi.string().required(),
      recipientIds: Joi.array().items(Joi.string()).required(),
      childName: Joi.string().required(),
      placeName: Joi.string().required(),
      startTime: Joi.date().required(),
      reminderType: Joi.number().valid(30, 10, 0).required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details 
      });
    }

    const messageId = await messageService.sendScheduleReminder(value);

    res.status(201).json({ 
      success: true, 
      messageId,
      message: 'Schedule reminder sent successfully' 
    });
  } catch (error: any) {
    logger.error('Schedule reminder API error:', error);
    res.status(500).json({ 
      error: 'Failed to send schedule reminder', 
      details: error.message 
    });
  }
});

// 위치 알림 발송
router.post('/location-alert', async (req, res) => {
  try {
    const schema = Joi.object({
      memberId: Joi.string().required(),
      location: Joi.object({
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
        address: Joi.string().optional()
      }).required(),
      alertType: Joi.string().valid(
        'enter_safe_zone', 
        'exit_safe_zone', 
        'route_deviation', 
        'emergency'
      ).required(),
      safeZoneName: Joi.string().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details 
      });
    }

    const messageId = await messageService.sendLocationAlert(value);

    res.status(201).json({ 
      success: true, 
      messageId,
      message: 'Location alert sent successfully' 
    });
  } catch (error: any) {
    logger.error('Location alert API error:', error);
    res.status(500).json({ 
      error: 'Failed to send location alert', 
      details: error.message 
    });
  }
});

// 가족 메시지 발송
router.post('/family-message', async (req, res) => {
  try {
    const schema = Joi.object({
      familyId: Joi.string().required(),
      senderId: Joi.string().required(),
      content: Joi.string().required(),
      recipientIds: Joi.array().items(Joi.string()).optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details 
      });
    }

    const messageId = await messageService.sendFamilyMessage(
      value.familyId,
      value.senderId,
      value.content,
      value.recipientIds
    );

    res.status(201).json({ 
      success: true, 
      messageId,
      message: 'Family message sent successfully' 
    });
  } catch (error: any) {
    logger.error('Family message API error:', error);
    res.status(500).json({ 
      error: 'Failed to send family message', 
      details: error.message 
    });
  }
});

// 일정 알림 스케줄링
router.post('/schedule-notifications', async (req, res) => {
  try {
    const schema = Joi.object({
      scheduleId: Joi.string().required(),
      childId: Joi.string().required(),
      placeName: Joi.string().required(),
      startTime: Joi.date().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details 
      });
    }

    await notificationScheduler.scheduleChildScheduleReminders(
      value.scheduleId,
      value.childId,
      value.placeName,
      value.startTime
    );

    res.status(201).json({ 
      success: true,
      message: 'Schedule notifications created successfully' 
    });
  } catch (error: any) {
    logger.error('Schedule notifications API error:', error);
    res.status(500).json({ 
      error: 'Failed to schedule notifications', 
      details: error.message 
    });
  }
});

// 메시지 히스토리 조회
router.get('/history/:familyId', async (req, res) => {
  try {
    const { familyId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const messages = await messageService.getMessageHistory(familyId, limit, offset);

    res.json({ 
      success: true, 
      messages,
      pagination: {
        limit,
        offset,
        total: messages.length
      }
    });
  } catch (error: any) {
    logger.error('Message history API error:', error);
    res.status(500).json({ 
      error: 'Failed to get message history', 
      details: error.message 
    });
  }
});

// 메시지 읽음 처리
router.patch('/read/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        error: 'userId is required' 
      });
    }

    const success = await messageService.markMessageAsRead(messageId, userId);

    if (success) {
      res.json({ 
        success: true, 
        message: 'Message marked as read' 
      });
    } else {
      res.status(404).json({ 
        error: 'Message not found or access denied' 
      });
    }
  } catch (error: any) {
    logger.error('Mark message read API error:', error);
    res.status(500).json({ 
      error: 'Failed to mark message as read', 
      details: error.message 
    });
  }
});

// 읽지 않은 메시지 수 조회
router.get('/unread-count/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await messageService.getUnreadCount(userId);

    res.json({ 
      success: true, 
      unreadCount: count 
    });
  } catch (error: any) {
    logger.error('Unread count API error:', error);
    res.status(500).json({ 
      error: 'Failed to get unread count', 
      details: error.message 
    });
  }
});

// 서비스 헬스체크
router.get('/health', async (req, res) => {
  try {
    // 카카오 연결 상태 확인
    const kakaoStatus = await messageService['kakaoProvider'].validateConnection();
    
    res.json({
      status: 'ok',
      service: 'messaging-service',
      timestamp: new Date().toISOString(),
      providers: {
        kakao: kakaoStatus ? 'connected' : 'disconnected'
      }
    });
  } catch (error: any) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      service: 'messaging-service',
      error: error.message
    });
  }
});

export { router as messagingRouter };