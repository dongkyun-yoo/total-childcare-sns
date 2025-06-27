#!/bin/bash

# ACTCS Google Cloud Platform 초기 설정 스크립트
# 실행 전에 gcloud CLI가 설치되어 있어야 합니다.

set -e  # 에러 발생 시 스크립트 중단

# 설정 변수
PROJECT_ID="actcs-childcare-system"
REGION="asia-northeast3"
MESSAGING_SERVICE_NAME="actcs-messaging-service"

echo "🚀 ACTCS Google Cloud Platform 설정을 시작합니다..."

# 1. 프로젝트 설정
echo "📋 프로젝트 설정 중..."
gcloud config set project $PROJECT_ID
gcloud config set compute/region $REGION

# 2. 필요한 API 활성화
echo "🔧 필요한 Google Cloud APIs 활성화 중..."
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable monitoring.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable containerregistry.googleapis.com

# 3. Pub/Sub 토픽 생성
echo "📨 Pub/Sub 토픽 생성 중..."
gcloud pubsub topics create actcs-notifications --quiet || echo "토픽이 이미 존재합니다."
gcloud pubsub topics create actcs-location-updates --quiet || echo "토픽이 이미 존재합니다."
gcloud pubsub topics create actcs-schedule-events --quiet || echo "토픽이 이미 존재합니다."

# 4. Pub/Sub 구독 생성
echo "📬 Pub/Sub 구독 생성 중..."
gcloud pubsub subscriptions create messaging-notifications \
  --topic=actcs-notifications \
  --ack-deadline=30 \
  --quiet || echo "구독이 이미 존재합니다."

gcloud pubsub subscriptions create location-processor \
  --topic=actcs-location-updates \
  --ack-deadline=30 \
  --quiet || echo "구독이 이미 존재합니다."

gcloud pubsub subscriptions create schedule-processor \
  --topic=actcs-schedule-events \
  --ack-deadline=30 \
  --quiet || echo "구독이 이미 존재합니다."

# 5. Secret Manager에 시크릿 생성 (사용자 입력 필요)
echo "🔐 Secret Manager 설정 중..."

read -p "Supabase URL을 입력하세요: " SUPABASE_URL
read -p "Supabase Anon Key를 입력하세요: " SUPABASE_ANON_KEY
read -s -p "Supabase Service Key를 입력하세요: " SUPABASE_SERVICE_KEY
echo ""
read -s -p "Kakao Access Token을 입력하세요: " KAKAO_ACCESS_TOKEN
echo ""
read -s -p "JWT Secret을 입력하세요: " JWT_SECRET
echo ""

# 시크릿 생성
echo "$SUPABASE_URL" | gcloud secrets create supabase-url --data-file=- --quiet || echo "시크릿이 이미 존재합니다."
echo "$SUPABASE_ANON_KEY" | gcloud secrets create supabase-anon-key --data-file=- --quiet || echo "시크릿이 이미 존재합니다."
echo "$SUPABASE_SERVICE_KEY" | gcloud secrets create supabase-service-key --data-file=- --quiet || echo "시크릿이 이미 존재합니다."
echo "$KAKAO_ACCESS_TOKEN" | gcloud secrets create kakao-access-token --data-file=- --quiet || echo "시크릿이 이미 존재합니다."
echo "$JWT_SECRET" | gcloud secrets create jwt-secret --data-file=- --quiet || echo "시크릿이 이미 존재합니다."

# 6. Cloud Run 서비스 계정 생성
echo "👤 서비스 계정 생성 중..."
gcloud iam service-accounts create actcs-messaging-sa \
  --display-name="ACTCS Messaging Service Account" \
  --quiet || echo "서비스 계정이 이미 존재합니다."

# 7. 서비스 계정에 권한 부여
echo "🔑 서비스 계정 권한 설정 중..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:actcs-messaging-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:actcs-messaging-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:actcs-messaging-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:actcs-messaging-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# 8. Cloud Scheduler 작업 생성
echo "⏰ Cloud Scheduler 작업 생성 중..."

# 일정 알림 체크 (매분)
gcloud scheduler jobs create http schedule-reminder-check \
  --location=$REGION \
  --schedule="* * * * *" \
  --time-zone="Asia/Seoul" \
  --uri="https://$MESSAGING_SERVICE_NAME-$REGION-$PROJECT_ID.a.run.app/api/messaging/process-scheduled" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --quiet || echo "스케줄러 작업이 이미 존재합니다."

# 메시지 큐 상태 체크 (5분마다)
gcloud scheduler jobs create http message-queue-health-check \
  --location=$REGION \
  --schedule="*/5 * * * *" \
  --time-zone="Asia/Seoul" \
  --uri="https://$MESSAGING_SERVICE_NAME-$REGION-$PROJECT_ID.a.run.app/api/messaging/queue-health" \
  --http-method=GET \
  --quiet || echo "스케줄러 작업이 이미 존재합니다."

# 9. Cloud Build 트리거 설정
echo "🔨 Cloud Build 설정 중..."
cat > cloudbuild.yaml << EOF
steps:
  # 메시징 서비스 빌드
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/messaging-service:\$COMMIT_SHA', './services/messaging']
    dir: '.'
  
  # 이미지 푸시
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/messaging-service:\$COMMIT_SHA']
  
  # Cloud Run 배포
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
    - 'run'
    - 'deploy'
    - '$MESSAGING_SERVICE_NAME'
    - '--image'
    - 'gcr.io/$PROJECT_ID/messaging-service:\$COMMIT_SHA'
    - '--region'
    - '$REGION'
    - '--platform'
    - 'managed'
    - '--service-account'
    - 'actcs-messaging-sa@$PROJECT_ID.iam.gserviceaccount.com'
    - '--set-env-vars'
    - 'NODE_ENV=production,GOOGLE_CLOUD_PROJECT=$PROJECT_ID'
    - '--set-secrets'
    - 'SUPABASE_URL=supabase-url:latest,SUPABASE_ANON_KEY=supabase-anon-key:latest,SUPABASE_SERVICE_KEY=supabase-service-key:latest,KAKAO_ACCESS_TOKEN=kakao-access-token:latest,JWT_SECRET=jwt-secret:latest'
    - '--max-instances'
    - '100'
    - '--min-instances'
    - '1'
    - '--cpu'
    - '2'
    - '--memory'
    - '2Gi'
    - '--timeout'
    - '300'
    - '--concurrency'
    - '1000'
    - '--allow-unauthenticated'

options:
  logging: CLOUD_LOGGING_ONLY
EOF

echo "✅ Google Cloud Platform 설정이 완료되었습니다!"
echo ""
echo "📋 다음 단계:"
echo "1. Supabase 프로젝트에서 데이터베이스 스키마를 생성하세요."
echo "2. 'npm run gcp:build' 명령으로 이미지를 빌드하세요."
echo "3. 'npm run gcp:deploy' 명령으로 서비스를 배포하세요."
echo ""
echo "🌐 서비스 URL: https://$MESSAGING_SERVICE_NAME-$REGION-$PROJECT_ID.a.run.app"
echo "📊 Google Cloud Console: https://console.cloud.google.com/run?project=$PROJECT_ID"