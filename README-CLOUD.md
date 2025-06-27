# 🚀 ACTCS Cloud Deployment Guide

## 클라우드 아키텍처 개요

**Google Cloud Platform + Supabase 하이브리드 구조**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │  Google Cloud    │    │   Supabase      │
│                 │    │                  │    │                 │
│ • React Web     │    │ • Cloud Run      │    │ • PostgreSQL    │
│ • React Native  │────▶│ • Pub/Sub        │────▶│ • Realtime      │
│ • Mobile Apps   │    │ • Cloud Scheduler│    │ • Auth          │
└─────────────────┘    │ • Secret Manager │    │ • Storage       │
                       └──────────────────┘    └─────────────────┘
```

## 🏗️ 클라우드 서비스 구성

### Google Cloud Platform
- **Cloud Run**: 서버리스 컨테이너 플랫폼
- **Cloud Pub/Sub**: 비동기 메시징
- **Cloud Scheduler**: Cron 작업 스케줄링
- **Secret Manager**: 보안 정보 관리
- **Cloud Build**: CI/CD 파이프라인
- **Cloud Logging**: 로그 수집/분석

### Supabase (PostgreSQL-as-a-Service)
- **Database**: 가족/일정/메시지 데이터
- **Realtime**: 실시간 데이터 동기화
- **Auth**: 사용자 인증 관리
- **Row Level Security**: 가족별 데이터 접근 제어

## 🚀 배포 단계

### 1. 사전 준비

```bash
# Google Cloud CLI 설치 (필요시)
curl https://sdk.cloud.google.com | bash
gcloud init

# 프로젝트 클론 및 의존성 설치
git clone <repository-url>
cd total-childcare-sns
npm install
```

### 2. Supabase 프로젝트 설정

1. [Supabase Dashboard](https://supabase.com) 접속
2. 새 프로젝트 생성: `actcs-childcare-system`
3. SQL Editor에서 스키마 실행:
   ```sql
   -- infrastructure/cloud/supabase-schema.sql 내용 복사/실행
   ```
4. API 키 확인:
   - URL: `https://your-project.supabase.co`
   - Anon Key: 프로젝트 설정에서 확인
   - Service Role Key: 프로젝트 설정에서 확인

### 3. Google Cloud Platform 설정

```bash
# GCP 초기 설정 실행
cd deploy
./setup-gcp.sh

# 대화형 입력:
# - Supabase URL
# - Supabase Keys
# - Kakao Access Token
# - JWT Secret
```

### 4. 서비스 빌드 및 배포

```bash
# 메시징 서비스 빌드
cd services/messaging
npm run gcp:build

# Cloud Run에 배포
npm run gcp:deploy
```

### 5. 배포 확인

```bash
# 서비스 상태 확인
gcloud run services list --region=asia-northeast3

# 헬스체크
curl https://actcs-messaging-service-asia-northeast3-actcs-childcare-system.a.run.app/health
```

## 🔧 환경 변수 관리

### Google Secret Manager 시크릿

| 시크릿 이름 | 설명 | 예시 |
|------------|------|------|
| `supabase-url` | Supabase 프로젝트 URL | `https://abc123.supabase.co` |
| `supabase-anon-key` | Supabase 익명 키 | `eyJhbGciOiJIUzI1NiIs...` |
| `supabase-service-key` | Supabase 서비스 키 | `eyJhbGciOiJIUzI1NiIs...` |
| `kakao-access-token` | 카카오톡 API 토큰 | `abc123def456...` |
| `jwt-secret` | JWT 서명 키 | `your-super-secret-key` |

### Cloud Run 환경 변수

```yaml
NODE_ENV: production
GOOGLE_CLOUD_PROJECT: actcs-childcare-system
PORT: 3004
```

## 📊 모니터링 및 로깅

### Cloud Logging 쿼리

```sql
-- 메시징 서비스 에러 로그
resource.type="cloud_run_revision"
resource.labels.service_name="actcs-messaging-service"
severity="ERROR"

-- API 요청 로그
resource.type="cloud_run_revision"
jsonPayload.method="POST"
jsonPayload.url="/api/messaging/send"
```

### 메트릭 대시보드

1. **서비스 성능**:
   - 요청 수/초
   - 응답 시간 (P50, P95, P99)
   - 에러율

2. **비즈니스 메트릭**:
   - 메시지 발송 수
   - 알림 성공률
   - 사용자 활성도

## 🔐 보안 설정

### Row Level Security (RLS)

```sql
-- 가족 데이터 접근 제한
CREATE POLICY "Users can view their own family" ON public.families FOR SELECT
    USING (id IN (
        SELECT family_id FROM public.family_members 
        WHERE user_id = auth.uid()
    ));
```

### Cloud Run 보안

- **Service Account**: 최소 권한 원칙
- **VPC Connector**: 프라이빗 네트워크 연결
- **IAM 정책**: 세밀한 권한 관리

## 🚀 CI/CD 파이프라인

### Cloud Build 트리거

```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/messaging-service:$COMMIT_SHA', './services/messaging']
  
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/messaging-service:$COMMIT_SHA']
  
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['run', 'deploy', 'actcs-messaging-service', '--image', 'gcr.io/$PROJECT_ID/messaging-service:$COMMIT_SHA']
```

### GitHub Actions (선택사항)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloud Run
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: google-github-actions/setup-gcloud@v1
      - run: gcloud builds submit --config cloudbuild.yaml
```

## 📈 확장성 고려사항

### 오토스케일링

```yaml
# Cloud Run 설정
--min-instances: 1        # 최소 인스턴스
--max-instances: 100      # 최대 인스턴스  
--concurrency: 1000       # 인스턴스당 동시 요청
--cpu: 2                  # CPU 코어
--memory: 2Gi             # 메모리
```

### 데이터베이스 최적화

```sql
-- 인덱스 최적화
CREATE INDEX CONCURRENTLY idx_family_messages_status_scheduled 
ON family_messages(status, scheduled_at) 
WHERE status = 'pending';

-- 파티셔닝 (대용량 데이터)
CREATE TABLE family_messages_2024 PARTITION OF family_messages
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

## 🛠️ 트러블슈팅

### 일반적인 문제

1. **메시지 발송 실패**
   ```bash
   # 로그 확인
   gcloud logs read "resource.type=cloud_run_revision" --limit=100
   
   # 시크릿 확인
   gcloud secrets versions access latest --secret="kakao-access-token"
   ```

2. **데이터베이스 연결 오류**
   ```bash
   # Supabase 연결 테스트
   curl -X GET "https://your-project.supabase.co/rest/v1/families?select=count" \
   -H "apikey: your-anon-key"
   ```

3. **스케줄러 작업 실패**
   ```bash
   # 스케줄러 상태 확인
   gcloud scheduler jobs list --location=asia-northeast3
   
   # 수동 실행
   gcloud scheduler jobs run schedule-reminder-check --location=asia-northeast3
   ```

## 💰 비용 최적화

### Cloud Run 비용

- **CPU 할당**: 요청 처리 중에만 과금
- **메모리**: 할당된 메모리에 대해 과금
- **네트워크**: 송신 트래픽 과금

### 예상 월 비용 (MVP 기준)

| 서비스 | 사용량 | 월 비용 (USD) |
|--------|--------|---------------|
| Cloud Run | 1M 요청, 2GB메모리 | $15-25 |
| Pub/Sub | 10M 메시지 | $5-10 |
| Cloud Scheduler | 100개 작업 | $1-3 |
| Supabase | Pro Plan | $25 |
| **총계** | | **$46-63** |

---

## 📞 지원 및 문의

- **기술 문서**: [Google Cloud Docs](https://cloud.google.com/docs)
- **Supabase 문서**: [Supabase Docs](https://supabase.com/docs)
- **이슈 트래킹**: GitHub Issues