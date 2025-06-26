# ACTCS 위치 추적 및 안전구역 시스템

## 개요
자녀의 실시간 위치를 정확하게 추적하고 안전구역 기반 알림을 제공하여 부모의 안심과 갈등 예방을 지원하는 시스템

## 핵심 요구사항
1. **정확한 위치 추적**: GPS + 네트워크 하이브리드 방식으로 높은 정확도 확보
2. **안전구역 관리**: 집, 학교, 학원 등 주요 장소를 안전구역으로 설정
3. **실시간 알림**: 안전구역 진입/이탈, 경로 이탈 시 즉시 알림
4. **배터리 최적화**: 효율적인 위치 수집으로 배터리 소모 최소화

## 위치 추적 아키텍처

### 1. 하이브리드 위치 시스템
```yaml
GPS 추적:
  - 야외 환경에서 높은 정확도 (3-5m)
  - 위성 신호 기반 절대 좌표
  - 배터리 소모가 상대적으로 높음

네트워크 추적:
  - WiFi 핫스팟 기반 위치 (10-50m)
  - 셀룰러 타워 삼각측량 (100-1000m)
  - 실내 환경에서 유용

융합 알고리즘:
  - Kalman Filter 기반 위치 보정
  - 신호 강도에 따른 가중 평균
  - 이동 패턴 학습을 통한 예측 보정
```

### 2. 안전구역 정의 시스템
```typescript
interface SafeZone {
  id: string;
  name: string;
  type: 'home' | 'school' | 'academy' | 'hospital' | 'playground' | 'relative' | 'other';
  center: {
    latitude: number;
    longitude: number;
  };
  radius: number; // 미터 단위
  address: string;
  operatingHours?: {
    open: string; // HH:mm
    close: string; // HH:mm
    days: number[]; // 0=일요일, 1=월요일...
  };
  notifications: {
    onEntry: boolean;
    onExit: boolean;
    onOverstay: boolean; // 예상보다 오래 머무는 경우
    overstayThreshold: number; // 분 단위
  };
  emergencyContacts: string[]; // 해당 장소 비상연락처
}

class SafeZoneManager {
  // 안전구역 내부 여부 확인
  isInSafeZone(currentLocation: GPS, safeZone: SafeZone): boolean {
    const distance = this.calculateDistance(currentLocation, safeZone.center);
    return distance <= safeZone.radius;
  }

  // 거리 계산 (Haversine formula)
  private calculateDistance(point1: GPS, point2: GPS): number {
    const R = 6371000; // 지구 반지름 (미터)
    const φ1 = point1.latitude * Math.PI / 180;
    const φ2 = point2.latitude * Math.PI / 180;
    const Δφ = (point2.latitude - point1.latitude) * Math.PI / 180;
    const Δλ = (point2.longitude - point1.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  // 지오펜싱 알림 처리
  async handleGeofenceEvent(childId: string, location: GPS, eventType: 'enter' | 'exit' | 'dwell') {
    const affectedZones = await this.findNearbyZones(location);
    
    for (const zone of affectedZones) {
      if (zone.notifications[`on${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`]) {
        await this.sendGeofenceAlert(childId, zone, eventType, location);
      }
    }
  }
}
```

### 3. 실시간 위치 추적 서비스
```typescript
interface LocationUpdate {
  childId: string;
  location: GPS;
  accuracy: number;
  timestamp: Date;
  battery: number;
  method: 'gps' | 'network' | 'passive';
}

class LocationTrackingService {
  private trackingIntervals = new Map<string, number>();
  
  // 적응형 추적 간격 설정
  calculateTrackingInterval(context: TrackingContext): number {
    const baseInterval = 60000; // 1분 기본
    
    let interval = baseInterval;
    
    // 이동 상태에 따른 조정
    if (context.isMoving) {
      interval = Math.max(15000, interval / 2); // 이동 중일 때 더 자주
    }
    
    // 안전구역 근처에서 더 정밀하게
    if (context.nearSafeZone) {
      interval = Math.max(10000, interval / 3);
    }
    
    // 배터리 수준에 따른 조정
    if (context.batteryLevel < 20) {
      interval = Math.min(300000, interval * 3); // 저배터리 시 절약 모드
    }
    
    // 일정이 있는 시간대에는 더 자주
    if (context.hasUpcomingSchedule) {
      interval = Math.max(30000, interval / 2);
    }
    
    return interval;
  }

  // 위치 업데이트 처리
  async processLocationUpdate(update: LocationUpdate) {
    // 1. 데이터베이스에 저장
    await this.saveLocationData(update);
    
    // 2. 안전구역 체크
    const currentZone = await this.checkSafeZones(update);
    
    // 3. 예상 경로 이탈 체크
    const routeStatus = await this.checkRouteDeviation(update);
    
    // 4. 가족들에게 상태 업데이트
    if (currentZone || routeStatus.isDeviated) {
      await this.notifyFamilyMembers(update, currentZone, routeStatus);
    }
    
    // 5. 다음 추적 간격 조정
    const newInterval = this.calculateTrackingInterval({
      isMoving: this.detectMovement(update),
      nearSafeZone: currentZone !== null,
      batteryLevel: update.battery,
      hasUpcomingSchedule: await this.checkUpcomingSchedule(update.childId)
    });
    
    this.trackingIntervals.set(update.childId, newInterval);
  }

  // 이동 감지 알고리즘
  private detectMovement(currentUpdate: LocationUpdate): boolean {
    const previousLocation = this.getPreviousLocation(currentUpdate.childId);
    if (!previousLocation) return false;
    
    const distance = this.calculateDistance(currentUpdate.location, previousLocation.location);
    const timeElapsed = currentUpdate.timestamp.getTime() - previousLocation.timestamp.getTime();
    const speed = distance / (timeElapsed / 1000); // m/s
    
    return speed > 0.5; // 0.5m/s 이상이면 이동 중으로 판단
  }
}
```

### 4. 스마트 경로 예측 시스템
```typescript
interface RoutePattern {
  childId: string;
  origin: SafeZone;
  destination: SafeZone;
  typicalRoute: GPS[];
  averageDuration: number; // 분
  timePatterns: {
    dayOfWeek: number;
    timeOfDay: string;
    frequency: number;
  }[];
}

class RouteIntelligence {
  // 경로 패턴 학습
  async learnRoutePatterns(childId: string): Promise<RoutePattern[]> {
    const historicalData = await this.getLocationHistory(childId, 30); // 30일간 데이터
    const patterns = this.analyzeMovementPatterns(historicalData);
    
    return patterns.map(pattern => ({
      ...pattern,
      typicalRoute: this.generateOptimalRoute(pattern.origin, pattern.destination),
      averageDuration: this.calculateAverageDuration(pattern.journeys)
    }));
  }

  // 경로 이탈 감지
  async detectRouteDeviation(currentLocation: GPS, expectedRoute: RoutePattern): Promise<{
    isDeviated: boolean;
    deviationDistance: number;
    suggestedAction: string;
  }> {
    const nearestPointOnRoute = this.findNearestPointOnRoute(currentLocation, expectedRoute.typicalRoute);
    const deviationDistance = this.calculateDistance(currentLocation, nearestPointOnRoute);
    
    const maxAllowedDeviation = 200; // 200m 이상 벗어나면 이탈로 판단
    
    if (deviationDistance > maxAllowedDeviation) {
      return {
        isDeviated: true,
        deviationDistance,
        suggestedAction: this.generateDeviationAlert(expectedRoute, deviationDistance)
      };
    }
    
    return { isDeviated: false, deviationDistance, suggestedAction: '' };
  }

  // 도착 시간 예측
  async predictArrivalTime(currentLocation: GPS, destination: SafeZone, routePattern: RoutePattern): Promise<{
    estimatedArrival: Date;
    confidence: number;
    isLikeLate: boolean;
  }> {
    const remainingDistance = this.calculateRemainingDistance(currentLocation, destination, routePattern);
    const averageSpeed = this.calculateAverageSpeed(routePattern);
    const estimatedDuration = remainingDistance / averageSpeed;
    
    const estimatedArrival = new Date(Date.now() + estimatedDuration * 60 * 1000);
    const confidence = this.calculatePredictionConfidence(routePattern);
    
    return {
      estimatedArrival,
      confidence,
      isLikeLate: estimatedArrival > routePattern.expectedArrival
    };
  }
}
```

### 5. 위치 기반 자동화 시스템
```typescript
class LocationAutomation {
  // 위치 기반 자동 체크인
  async handleAutoCheckin(childId: string, location: GPS) {
    const currentZone = await this.identifyCurrentZone(location);
    
    if (currentZone && currentZone.type === 'academy') {
      // 학원 도착 시 자동 체크인
      await this.performAutoCheckin(childId, currentZone);
      
      // 부모들에게 도착 알림
      await this.notifyArrival(childId, currentZone, location);
      
      // 다음 일정 알림 설정
      await this.setupNextScheduleAlert(childId);
    }
  }

  // 지각 위험 조기 경고
  async checkLatenessRisk(childId: string) {
    const upcomingSchedule = await this.getNextSchedule(childId);
    if (!upcomingSchedule) return;
    
    const currentLocation = await this.getCurrentLocation(childId);
    const routePattern = await this.getRoutePattern(currentLocation, upcomingSchedule.destination);
    
    const prediction = await this.routeIntelligence.predictArrivalTime(
      currentLocation, 
      upcomingSchedule.destination, 
      routePattern
    );
    
    if (prediction.isLikeLate && prediction.confidence > 0.7) {
      await this.sendLatenessWarning(childId, upcomingSchedule, prediction);
    }
  }

  // 응급상황 감지
  async detectEmergencyPatterns(childId: string, location: GPS) {
    const patterns = [
      this.checkStationaryTooLong(childId, location),
      this.checkUnusualLocation(childId, location),
      this.checkAfterHoursMovement(childId, location),
      this.checkRapidMovement(childId, location)
    ];
    
    const emergencyRisk = await Promise.all(patterns);
    const highRisk = emergencyRisk.filter(risk => risk.level > 0.8);
    
    if (highRisk.length > 0) {
      await this.triggerEmergencyAlert(childId, location, highRisk);
    }
  }
}
```

### 6. 프라이버시 및 보안
```yaml
데이터 보안:
  위치_데이터_암호화: AES-256-GCM
  전송_보안: TLS 1.3 + Certificate Pinning
  저장_기간: 90일 (자동 삭제)
  접근_제한: 가족 구성원만 접근 가능

프라이버시_설정:
  위치_공유_레벨:
    - 정확한_위치: 부모만 접근
    - 안전구역_상태: 가족 전체 공유
    - 이동_상태: 설정에 따라 선택
  
  추적_중단_옵션:
    - 수동_중단: 자녀가 직접 일시 중단 (최대 2시간)
    - 자동_중단: 설정된 안전구역에서 자동 추적 중단
    - 비상_중단: 응급상황 시 즉시 추적 중단

법적_준수:
  개인정보보호법: 위치정보 수집 동의 필수
  아동_보호: 만 14세 미만 법정대리인 동의
  데이터_이동권: 언제든 데이터 추출 가능
  삭제권: 즉시 데이터 삭제 요청 처리
```

### 7. 배터리 최적화 전략
```typescript
class BatteryOptimizer {
  // 적응형 위치 수집
  async optimizeLocationTracking(childId: string) {
    const context = await this.gatherContext(childId);
    
    const strategy = {
      interval: this.calculateOptimalInterval(context),
      accuracy: this.selectAccuracyLevel(context),
      sensors: this.chooseSensors(context)
    };
    
    await this.applyTrackingStrategy(childId, strategy);
  }

  private calculateOptimalInterval(context: TrackingContext): number {
    let baseInterval = 60000; // 1분
    
    // 정적 상태에서는 간격 늘리기
    if (context.isStationary) {
      baseInterval *= 3;
    }
    
    // 안전구역에서는 간격 늘리기
    if (context.inSafeZone) {
      baseInterval *= 2;
    }
    
    // 배터리 부족 시 간격 늘리기
    if (context.batteryLevel < 30) {
      baseInterval *= (context.batteryLevel < 15 ? 4 : 2);
    }
    
    // 중요한 시간대에는 간격 줄이기
    if (context.isCriticalTime) {
      baseInterval /= 2;
    }
    
    return Math.max(10000, Math.min(300000, baseInterval)); // 10초~5분 범위
  }
}
```

이 위치 추적 시스템을 통해 자녀의 안전을 보장하면서도 배터리 효율성과 프라이버시를 동시에 고려한 스마트한 가족 케어 솔루션을 제공할 수 있습니다.