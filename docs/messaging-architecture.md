# ACTCS 메시징 시스템 아키텍처

## 개요
가족 갈등 해소를 위한 실시간 소통 및 알림 시스템으로, 카카오톡을 중심으로 한 다채널 메시징 플랫폼

## 핵심 요구사항
1. **카카오톡 연동**: 주요 알림 채널로 카카오톡 사용
2. **가족 동시 알림**: 부모 모두에게 동일한 정보 실시간 공유
3. **상황별 자동응답**: 자녀의 상황에 맞는 자동응답 시스템
4. **지능형 알림**: 30분 전 → 10분 전 → 지각 위험 3단계 알림

## 메시징 채널 우선순위

### 1. 카카오톡 (Primary Channel)
```yaml
사용 목적:
  - 일정 알림 (학원 출발 시간 등)
  - 위치 상태 공유
  - 가족 간 실시간 소통
  - 자동응답 메시지

구현 방식:
  - KakaoTalk Business API 활용
  - 카카오 플러스친구 연동
  - 템플릿 메시지 기반 알림
  - 웹훅을 통한 실시간 응답

메시지 유형:
  - 일정 알림: "🏃‍♂️ [아들 이름] 30분 후 태권도 학원 출발시간입니다"
  - 위치 알림: "📍 [아들 이름] 태권도 학원에 안전하게 도착했습니다"
  - 지각 경고: "⚠️ [아들 이름] 태권도 학원 지각 위험! 지금 출발해야 합니다"
  - 자동응답: "네, 지금 학원 가고 있어요! 조금만 기다려 주세요 😊"
```

### 2. SMS (Secondary Channel)
```yaml
사용 목적:
  - 카카오톡 실패 시 백업
  - 긴급 상황 알림
  - 네트워크 불안정 시 대체

구현 방식:
  - 국내 SMS 서비스 (NHN Toast, 알리고 등)
  - 단문/장문 자동 선택
  - 발송 비용 최적화
```

### 3. 푸시 알림 (App Channel)
```yaml
사용 목적:
  - 앱 내 실시간 알림
  - 위치 추적 상태 변경
  - 설정 변경 확인

구현 방식:
  - Firebase Cloud Messaging (FCM)
  - iOS/Android 네이티브 푸시
  - 뱃지 카운트 관리
```

## 알림 로직 설계

### 스케줄 기반 알림 흐름
```typescript
interface ScheduleAlert {
  childId: string;
  scheduleName: string;
  departureTime: Date;
  destination: string;
  familyMembers: string[];
}

class ScheduleAlertService {
  // 3단계 알림 시스템
  async setupAlerts(schedule: ScheduleAlert) {
    // 1단계: 30분 전 준비 알림
    await this.scheduleAlert({
      triggerTime: schedule.departureTime - 30 * 60 * 1000,
      message: `🏃‍♂️ ${schedule.childName} ${schedule.scheduleName} 30분 후 출발 예정입니다. 준비해 주세요!`,
      priority: 'normal',
      channels: ['kakao', 'push']
    });

    // 2단계: 10분 전 출발 알림
    await this.scheduleAlert({
      triggerTime: schedule.departureTime - 10 * 60 * 1000,
      message: `⏰ ${schedule.childName} ${schedule.scheduleName} 10분 후 출발시간입니다!`,
      priority: 'high',
      channels: ['kakao', 'push', 'sms']
    });

    // 3단계: 지각 위험 경고
    await this.scheduleAlert({
      triggerTime: schedule.departureTime + 5 * 60 * 1000,
      message: `⚠️ 긴급! ${schedule.childName} ${schedule.scheduleName} 지각 위험입니다. 즉시 확인해 주세요!`,
      priority: 'urgent',
      channels: ['kakao', 'sms', 'push', 'call'] // 통화 알림 추가
    });
  }
}
```

### 위치 기반 알림 시스템
```typescript
interface LocationAlert {
  childId: string;
  currentLocation: GPS;
  targetLocation: GPS;
  safeZones: SafeZone[];
}

class LocationAlertService {
  // 안전구역 진입/이탈 알림
  async checkSafeZoneStatus(location: LocationAlert) {
    const safeZone = this.findCurrentSafeZone(location.currentLocation, location.safeZones);
    
    if (safeZone) {
      // 안전구역 도착 알림
      await this.sendLocationAlert({
        message: `✅ ${location.childName} ${safeZone.name}에 안전하게 도착했습니다 (${new Date().toLocaleTimeString()})`,
        location: location.currentLocation,
        priority: 'normal'
      });
    } else {
      // 예상 경로 이탈 확인
      const isOffRoute = this.checkRouteDeviation(location);
      if (isOffRoute) {
        await this.sendLocationAlert({
          message: `📍 ${location.childName}의 위치를 확인해 주세요. 예상 경로에서 벗어났을 수 있습니다.`,
          location: location.currentLocation,
          priority: 'high'
        });
      }
    }
  }
}
```

## 자동응답 시스템

### 상황별 자동응답 템플릿
```yaml
템플릿 카테고리:
  이동_관련:
    - "네, 지금 {목적지}(으)로 가고 있어요!"
    - "조금 늦을 것 같아요. {예상시간}분 정도 더 걸릴 것 같습니다."
    - "안전하게 도착했어요! 걱정하지 마세요 😊"
  
  건강_관련:
    - "배가 좀 아파요. 하지만 괜찮아요."
    - "감기 기운이 있어서 좀 피곤해요."
    - "지금은 괜찮아요! 학원 잘 다녀올게요."
  
  학습_관련:
    - "숙제는 다 했어요!"
    - "선생님이 칭찬해 주셨어요 😄"
    - "오늘 수업 재미있었어요!"

학습_기능:
  - 자주 사용하는 응답 패턴 분석
  - 시간대별 맞춤 응답 제안
  - 가족 내 소통 톤앤매너 학습
  - 상황별 적절한 이모지 자동 추가
```

### AI 기반 응답 생성 로직
```typescript
interface AutoResponseContext {
  childId: string;
  currentSituation: 'departing' | 'in_transit' | 'arrived' | 'delayed' | 'sick';
  parentConcernLevel: 'low' | 'medium' | 'high';
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  historicalPatterns: ResponsePattern[];
}

class AutoResponseGenerator {
  async generateResponse(context: AutoResponseContext): Promise<string> {
    const baseTemplate = this.getBaseTemplate(context.currentSituation);
    const personalizedResponse = await this.personalizeResponse(baseTemplate, context);
    const tonedResponse = this.adjustTone(personalizedResponse, context.parentConcernLevel);
    
    return this.addEmojis(tonedResponse, context.timeOfDay);
  }

  // 학습된 패턴을 기반으로 개인화된 응답 생성
  private async personalizeResponse(template: string, context: AutoResponseContext): Promise<string> {
    const patterns = context.historicalPatterns;
    const frequentPhrases = this.extractFrequentPhrases(patterns);
    
    return this.incorporatePersonalStyle(template, frequentPhrases);
  }
}
```

## 카카오톡 연동 구현

### KakaoTalk Business API 설정
```typescript
class KakaoTalkService {
  private apiKey: string;
  private clientSecret: string;
  private templateIds: Map<string, string>;

  constructor() {
    this.apiKey = process.env.KAKAO_API_KEY!;
    this.clientSecret = process.env.KAKAO_CLIENT_SECRET!;
    this.templateIds = new Map([
      ['schedule_reminder', 'template_001'],
      ['location_alert', 'template_002'],
      ['emergency_alert', 'template_003'],
      ['auto_response', 'template_004']
    ]);
  }

  // 템플릿 메시지 발송
  async sendTemplateMessage(recipientId: string, templateType: string, variables: any) {
    const templateId = this.templateIds.get(templateType);
    
    const payload = {
      receiver_uuids: [recipientId],
      template_id: templateId,
      template_args: variables
    };

    try {
      const response = await this.kakaoAPI.post('/v1/api/talk/friends/message/default/send', payload);
      return { success: true, messageId: response.data.successful_receiver_uuids[0] };
    } catch (error) {
      console.error('카카오톡 메시지 발송 실패:', error);
      return { success: false, error: error.message };
    }
  }

  // 웹훅을 통한 응답 처리
  async handleWebhook(webhookData: any) {
    const { user_id, message, timestamp } = webhookData;
    
    // 자동응답 트리거 확인
    if (this.isAutoResponseTrigger(message)) {
      const response = await this.autoResponseService.generateResponse({
        userId: user_id,
        triggerMessage: message,
        timestamp: new Date(timestamp)
      });
      
      await this.sendTemplateMessage(user_id, 'auto_response', { response });
    }
  }
}
```

## 메시지 큐 및 안정성

### Redis 기반 메시지 큐
```yaml
Queue Structure:
  family_alerts_high:     # 긴급 알림 (지각, 응급상황)
    priority: 1
    retry: 3회
    timeout: 30초
  
  family_alerts_normal:   # 일반 알림 (일정, 위치)
    priority: 2
    retry: 2회
    timeout: 60초
  
  auto_responses:         # 자동응답
    priority: 3
    retry: 1회
    timeout: 120초

Failover Strategy:
  1. 카카오톡 실패 → SMS 자동 전환
  2. SMS 실패 → 푸시 알림 발송
  3. 모든 채널 실패 → 관리자 알림 + 수동 처리
```

### 전송 상태 추적
```typescript
interface MessageDeliveryStatus {
  messageId: string;
  familyId: string;
  recipients: string[];
  channels: ('kakao' | 'sms' | 'push')[];
  attempts: DeliveryAttempt[];
  finalStatus: 'delivered' | 'failed' | 'partial';
  timestamp: Date;
}

class MessageTrackingService {
  async trackDelivery(messageId: string): Promise<MessageDeliveryStatus> {
    // 실시간 전송 상태 모니터링
    const status = await this.redis.hgetall(`message:${messageId}`);
    return this.parseDeliveryStatus(status);
  }

  async handleDeliveryFailure(messageId: string, failedChannel: string) {
    const nextChannel = this.getNextFallbackChannel(failedChannel);
    if (nextChannel) {
      await this.retryWithFallback(messageId, nextChannel);
    } else {
      await this.notifyDeliveryFailure(messageId);
    }
  }
}
```

이 메시징 시스템을 통해 가족 구성원들이 실시간으로 정보를 공유하고, 자녀의 일정 관리를 통해 갈등을 예방할 수 있는 환경을 구축할 수 있습니다.