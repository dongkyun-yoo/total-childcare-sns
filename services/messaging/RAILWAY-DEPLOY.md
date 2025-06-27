# 🚂 Railway 무료 배포 가이드

## 1️⃣ Supabase 프로젝트 설정

### Supabase 계정 생성 및 프로젝트 설정
1. [supabase.com](https://supabase.com) 접속
2. "Start your project" 클릭
3. GitHub로 로그인 (무료)
4. "New Project" 생성
   - Name: `actcs-childcare-system`
   - Database Password: 강력한 비밀번호 설정
   - Region: `Northeast Asia (Seoul)` 선택

### 데이터베이스 스키마 생성
1. Supabase 대시보드에서 **SQL Editor** 클릭
2. 다음 파일 내용을 복사해서 실행:
   ```sql
   -- infrastructure/cloud/supabase-schema.sql 내용 전체 복사/붙여넣기
   ```
3. **RUN** 버튼 클릭하여 스키마 생성

### API 키 확인
1. **Settings > API** 메뉴로 이동
2. 다음 정보들을 복사해두세요:
   - **URL**: `https://xxxxx.supabase.co`
   - **anon public**: `eyJhbGciOiJIUzI1NiIsInR5cCI6...`
   - **service_role**: `eyJhbGciOiJIUzI1NiIsInR5cCI6...` (⚠️ 중요: 이 키는 보안에 민감)

---

## 2️⃣ Railway 배포

### Railway CLI 설치 및 로그인
```bash
# Railway CLI 설치
npm install -g @railway/cli

# Railway 로그인 (GitHub 계정 사용)
railway login

# 브라우저에서 GitHub 로그인 완료 후 터미널로 돌아오기
```

### 프로젝트 배포
```bash
# 메시징 서비스 디렉토리로 이동
cd services/messaging

# Railway 프로젝트 초기화
railway init

# 프로젝트 이름 입력: actcs-messaging
# Empty project 선택

# Railway에 배포
railway up

# 배포 완료 후 URL 확인
# 예: https://actcs-messaging-production.up.railway.app
```

### 환경변수 설정
```bash
# Railway 대시보드에서 설정하거나 CLI로 설정
railway variables set NODE_ENV=production
railway variables set SUPABASE_URL="https://your-project.supabase.co"
railway variables set SUPABASE_ANON_KEY="your-anon-key"
railway variables set SUPABASE_SERVICE_KEY="your-service-key"
railway variables set JWT_SECRET="your-super-secret-jwt-key-min-32-chars"

# 카카오톡 API 키 (나중에 설정 가능)
railway variables set KAKAO_ACCESS_TOKEN="your-kakao-token"
```

---

## 3️⃣ 무료 Cron 스케줄러 설정

### cron-job.org 설정
1. [cron-job.org](https://cron-job.org) 접속
2. 무료 계정 생성
3. "Create cronjob" 클릭
4. 다음 2개의 cron 작업 생성:

#### 작업 1: 일정 알림 처리
- **Title**: `ACTCS Schedule Notifications`
- **URL**: `https://your-railway-app.up.railway.app/cron/scheduled`
- **Execution**: `Every minute (* * * * *)`
- **Request method**: `POST`
- **Save and enable**

#### 작업 2: 시스템 헬스체크
- **Title**: `ACTCS Health Check`
- **URL**: `https://your-railway-app.up.railway.app/cron/health`
- **Execution**: `Every 5 minutes (*/5 * * * *)`
- **Request method**: `GET`
- **Save and enable**

---

## 4️⃣ 배포 확인

### 서비스 상태 확인
```bash
# Railway URL 확인
railway status

# 헬스체크 확인
curl https://your-railway-app.up.railway.app/health

# 로그 확인
railway logs
```

### 응답 예시
```json
{
  "status": "ok",
  "service": "actcs-messaging",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0"
}
```

---

## 5️⃣ 카카오톡 API 설정 (선택사항)

### 카카오 디벨로퍼스 계정 생성
1. [developers.kakao.com](https://developers.kakao.com) 접속
2. 카카오 계정으로 로그인
3. "내 애플리케이션" > "애플리케이션 추가하기"
4. 앱 이름: `ACTCS 가족 케어`

### API 키 발급
1. **앱 키** 확인:
   - JavaScript 키: 프론트엔드용
   - REST API 키: 서버용
2. **카카오톡 채널** 설정:
   - 카카오톡 채널 > 채널 추가하기
   - 채널 이름: `ACTCS 알림`

### Railway에 카카오 토큰 추가
```bash
railway variables set KAKAO_ACCESS_TOKEN="your-kakao-rest-api-key"
```

---

## 6️⃣ 무료 리소스 모니터링

### Railway 무료 한도
- **실행 시간**: 500시간/월 (약 20일)
- **메모리**: 512MB
- **CPU**: 공유 vCPU
- **대역폭**: 100GB/월

### 사용량 확인
```bash
# Railway 대시보드에서 확인
railway dashboard

# 또는 CLI로 확인
railway status
```

### 절약 팁
1. **스케줄러**: 외부 cron 사용으로 서버 부하 감소
2. **로깅**: 중요한 이벤트만 로깅
3. **캐싱**: Supabase 쿼리 결과 캐싱
4. **배치 처리**: 메시지 일괄 처리

---

## 7️⃣ 트러블슈팅

### 일반적인 문제들

#### 1. Supabase 연결 오류
```bash
# 환경변수 확인
railway variables

# Supabase URL/키가 올바른지 확인
curl -H "apikey: YOUR_ANON_KEY" "https://your-project.supabase.co/rest/v1/"
```

#### 2. Railway 배포 실패
```bash
# 로그 확인
railway logs

# 재배포
railway up --detach
```

#### 3. Cron 작업 실패
```bash
# cron-job.org 대시보드에서 실행 로그 확인
# Railway 로그에서 /cron/ 엔드포인트 호출 확인
railway logs --filter="/cron"
```

#### 4. 메모리 부족
```bash
# 메모리 사용량 확인
railway logs --filter="memory"

# 서비스 재시작
railway restart
```

---

## 8️⃣ 다음 단계

### MVP 확장
1. **프론트엔드 배포**: Vercel/Netlify 무료 호스팅
2. **추가 서비스**: family-management, auto-response 서비스
3. **모니터링**: Railway 대시보드 + Supabase 모니터링

### 업그레이드 시점
- **사용자 50명+ 또는 실행시간 450시간+ 사용시**
- Railway Pro: $20/월 (무제한 시간)
- Supabase Pro: $25/월 (8GB DB)

---

## 🎯 체크리스트

- [ ] Supabase 프로젝트 생성 완료
- [ ] 데이터베이스 스키마 생성 완료
- [ ] Railway CLI 설치 및 로그인 완료
- [ ] Railway 배포 완료
- [ ] 환경변수 설정 완료
- [ ] cron-job.org 스케줄러 설정 완료
- [ ] 헬스체크 응답 확인 완료
- [ ] (선택) 카카오톡 API 설정 완료

**총 소요시간**: 30-60분
**월 예상 비용**: $0 (무료)
**서비스 URL**: https://your-railway-app.up.railway.app