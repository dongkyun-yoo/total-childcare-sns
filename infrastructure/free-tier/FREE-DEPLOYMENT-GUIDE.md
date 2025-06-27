# 🆓 ACTCS 무료 배포 가이드

## 💰 완전 무료 배포 옵션

### 옵션 1: Supabase + Railway/Render (권장)
**월 비용**: $0
**제한사항**: 
- Supabase: 500MB DB, 50K MAU
- Railway: 500시간/월 (약 20일)
- Render: 750시간/월 (sleep 모드)

### 옵션 2: Oracle Cloud Always Free
**월 비용**: $0 (영구 무료)
**제한사항**: 
- 1-4 ARM CPU, 24GB RAM
- 200GB 스토리지

### 옵션 3: 로컬/VPS Docker
**월 비용**: $0-5 (VPS 선택시)
**제한사항**: 없음

---

## 🚀 Option 1: Supabase + Railway (가장 쉬움)

### 1단계: Supabase 설정
```bash
# 1. supabase.com 계정 생성 (무료)
# 2. 새 프로젝트 생성
# 3. SQL Editor에서 스키마 실행
```

### 2단계: Railway 배포
```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 초기화
cd services/messaging
railway init

# 환경변수 설정
railway variables set NODE_ENV=production
railway variables set SUPABASE_URL=https://your-project.supabase.co
railway variables set SUPABASE_ANON_KEY=your-anon-key
railway variables set KAKAO_ACCESS_TOKEN=your-kakao-token
railway variables set JWT_SECRET=your-jwt-secret

# 배포
railway up
```

### 3단계: 스케줄러 설정 (무료)
```bash
# cron-job.org 에서 무료 cron 작업 생성
# URL: https://your-railway-app.railway.app/api/messaging/process-scheduled
# 스케줄: * * * * * (매분)

# URL: https://your-railway-app.railway.app/api/messaging/queue-health  
# 스케줄: */5 * * * * (5분마다)
```

---

## 🚀 Option 2: Oracle Cloud Always Free

### 1단계: Oracle Cloud 계정 생성
```bash
# 1. cloud.oracle.com 가입 (신용카드 필요하지만 과금 없음)
# 2. Always Free VM 인스턴스 생성 (ARM64, Ubuntu)
# 3. SSH 접속 설정
```

### 2단계: 서버 환경 설정
```bash
# Ubuntu 업데이트
sudo apt update && sudo apt upgrade -y

# Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Docker Compose 설치
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 프로젝트 클론
git clone <your-repo>
cd total-childcare-sns/infrastructure/free-tier
```

### 3단계: 배포
```bash
# 환경변수 설정
cp .env.example .env
nano .env  # 필요한 환경변수 입력

# 서비스 시작
docker-compose -f docker-compose.free.yml up -d

# 상태 확인
docker-compose -f docker-compose.free.yml ps
```

### 4단계: 도메인 및 SSL 설정 (선택사항)
```bash
# Cloudflare 무료 DNS + SSL
# 1. Cloudflare 계정 생성
# 2. 도메인 연결 (freenom.com에서 무료 도메인 가능)
# 3. A 레코드로 Oracle Cloud IP 설정
# 4. SSL/TLS → Full (strict) 설정
```

---

## 🚀 Option 3: 로컬 개발 환경

### 1단계: 로컬 Supabase 설정
```bash
# Supabase CLI 설치
npm install -g supabase

# 로컬 Supabase 시작
supabase init
supabase start

# 스키마 적용
supabase db reset
```

### 2단계: 서비스 실행
```bash
# 의존성 설치
cd services/messaging
npm install

# 환경변수 설정
cp .env.example .env

# 개발 서버 시작
npm run dev
```

---

## 📊 무료 티어 제한사항 및 해결책

### Supabase 제한 (무료)
| 제한사항 | 해결책 |
|----------|--------|
| 500MB DB | 이미지는 외부 저장소 (Cloudinary 무료) |
| 50K MAU | MVP 단계에는 충분 |
| 1GB 대역폭 | CDN 사용 (Cloudflare 무료) |

### Railway/Render 제한
| 제한사항 | 해결책 |
|----------|--------|
| Sleep 모드 | UptimeRobot 무료 핑 서비스 |
| 시간 제한 | 월말 일시 정지 (알림 설정) |
| 1 서비스 | 모노리스 구조로 통합 |

### 스케줄링 해결책
```bash
# 무료 외부 Cron 서비스들:
# 1. cron-job.org (무료)
# 2. easycron.com (무료 티어)
# 3. setcronjob.com (무료)

# GitHub Actions (월 2000분 무료)
name: Health Check
on:
  schedule:
    - cron: '*/5 * * * *'
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl https://your-app.railway.app/health
```

---

## 🔧 비용 최적화 팁

### 1. 데이터베이스 최적화
```sql
-- 불필요한 데이터 정리
DELETE FROM location_tracking WHERE timestamp < NOW() - INTERVAL '7 days';

-- 인덱스 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_family_created 
ON family_messages(family_id, created_at DESC) 
WHERE status != 'failed';
```

### 2. API 호출 최소화
```typescript
// 배치 처리
const messages = await supabase
  .from('family_messages')
  .select('*')
  .eq('status', 'pending')
  .limit(100); // 한 번에 여러 개 처리

// 캐싱
const familyMembers = await redis.get(`family:${familyId}:members`) 
  || await fetchAndCacheFamilyMembers(familyId);
```

### 3. 메모리 사용량 최적화
```dockerfile
# Alpine Linux 사용 (작은 이미지)
FROM node:18-alpine

# Multi-stage build (빌드 도구 제외)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
COPY --from=builder /app/node_modules ./node_modules
```

---

## 📈 확장 계획

### 무료 → 유료 전환 시점
- **사용자**: 100명+ 
- **메시지**: 월 10만건+
- **DB**: 500MB 근접

### 확장 경로
1. **Supabase Pro**: $25/월 (8GB DB, 100K MAU)
2. **Railway Pro**: $20/월 (무제한 시간)
3. **Google Cloud**: $15-30/월 (실제 사용량 기준)

---

## 🛠️ 트러블슈팅

### 일반적인 문제

#### 1. Railway Sleep 모드
```bash
# UptimeRobot 설정으로 5분마다 핑
# URL: https://your-app.railway.app/health
# 체크 간격: 5분
```

#### 2. Supabase 연결 오류
```bash
# RLS 정책 확인
SELECT * FROM pg_policies WHERE tablename = 'family_messages';

# API 키 확인
curl -H "apikey: YOUR_ANON_KEY" \
  "https://your-project.supabase.co/rest/v1/families?select=count"
```

#### 3. 메모리 부족
```typescript
// 스트리밍 처리
const stream = supabase
  .from('family_messages')
  .select('*')
  .stream({ batchSize: 1000 });

// 메모리 사용량 모니터링
setInterval(() => {
  const usage = process.memoryUsage();
  if (usage.heapUsed > 200 * 1024 * 1024) { // 200MB
    console.warn('High memory usage:', usage);
  }
}, 60000);
```

---

## 🎯 권장 무료 구성

**MVP 시작**: Supabase + Railway + cron-job.org
**장기 운영**: Oracle Cloud Always Free + 자체 호스팅
**상용화**: Google Cloud (스케일링 시)

총 무료 운영 기간: **6-12개월** (사용량에 따라)