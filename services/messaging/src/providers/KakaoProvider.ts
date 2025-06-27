import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { KakaoMessage } from '../types';

export class KakaoProvider {
  private apiClient: AxiosInstance;
  private accessToken: string | null = null;

  constructor() {
    this.apiClient = axios.create({
      baseURL: 'https://kapi.kakao.com',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
  }

  async sendMessage(recipientId: string, message: KakaoMessage): Promise<boolean> {
    try {
      if (!this.accessToken) {
        throw new Error('Kakao access token not available');
      }

      const response = await this.apiClient.post('/v2/api/talk/memo/default/send', {
        template_object: JSON.stringify(message.template_object)
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (response.status === 200) {
        logger.info(`Kakao message sent successfully to ${recipientId}`);
        return true;
      }

      throw new Error(`Kakao API error: ${response.status}`);
    } catch (error: any) {
      logger.error('Failed to send Kakao message:', {
        recipientId,
        error: error.message,
        response: error.response?.data
      });
      return false;
    }
  }

  async sendToMultiple(recipientIds: string[], message: KakaoMessage): Promise<{ success: string[]; failed: string[] }> {
    const results = { success: [] as string[], failed: [] as string[] };

    for (const recipientId of recipientIds) {
      const sent = await this.sendMessage(recipientId, message);
      if (sent) {
        results.success.push(recipientId);
      } else {
        results.failed.push(recipientId);
      }
      
      // Rate limiting - 카카오 API 제한 고려
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
    logger.info('Kakao access token updated');
  }

  createScheduleReminderMessage(childName: string, placeName: string, timeLeft: number): KakaoMessage {
    let message: string;
    let urgency: string;

    if (timeLeft === 30) {
      urgency = '1차 알림';
      message = `${childName}님, ${placeName} 출발 30분 전입니다. 준비해주세요! 📚`;
    } else if (timeLeft === 10) {
      urgency = '2차 알림';
      message = `${childName}님, ${placeName} 출발 10분 전입니다. 지금 출발하세요! 🏃‍♂️`;
    } else {
      urgency = '긴급 알림';
      message = `⚠️ ${childName}님, ${placeName} 지각 위험입니다! 즉시 확인이 필요합니다!`;
    }

    return {
      template_object: {
        object_type: 'text',
        text: `[${urgency}] ${message}`,
        link: {
          web_url: process.env.WEB_APP_URL,
          mobile_web_url: process.env.WEB_APP_URL
        },
        button_title: '앱에서 확인'
      }
    };
  }

  createLocationAlertMessage(memberName: string, location: string, alertType: string): KakaoMessage {
    let message: string;

    switch (alertType) {
      case 'enter_safe_zone':
        message = `✅ ${memberName}님이 ${location}에 안전하게 도착했습니다.`;
        break;
      case 'exit_safe_zone':
        message = `📍 ${memberName}님이 ${location}에서 출발했습니다.`;
        break;
      case 'route_deviation':
        message = `⚠️ ${memberName}님이 예상 경로에서 벗어났습니다. 현재 위치: ${location}`;
        break;
      case 'emergency':
        message = `🚨 긴급상황! ${memberName}님의 위치를 확인해주세요. 현재: ${location}`;
        break;
      default:
        message = `📍 ${memberName}님의 위치가 업데이트되었습니다: ${location}`;
    }

    return {
      template_object: {
        object_type: 'location',
        text: message,
        link: {
          web_url: process.env.WEB_APP_URL,
          mobile_web_url: process.env.WEB_APP_URL
        },
        button_title: '위치 확인'
      }
    };
  }

  async validateConnection(): Promise<boolean> {
    try {
      if (!this.accessToken) {
        return false;
      }

      const response = await this.apiClient.get('/v2/user/me', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      return response.status === 200;
    } catch (error) {
      logger.error('Kakao connection validation failed:', error);
      return false;
    }
  }
}