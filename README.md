# ACTCS - AI for Child Total Care Solution

가족 갈등 해소를 위한 자녀 시간관리 및 위치추적 통합 케어 솔루션

## 📋 프로젝트 개요

### 핵심 목표
**가족 갈등의 근본 원인인 정보 비대칭성과 소통 부재를 기술로 해결**하여, 모든 가족 구성원이 동일한 정보를 실시간으로 공유할 수 있는 투명한 케어 시스템 구축

### 핵심 기능
- **스마트 일정 관리**: 3단계 알림 시스템 (30분 전 → 10분 전 → 지각 위험)
- **카카오톡 연동 메시징**: 가족 전체 실시간 정보 공유
- **GPS 위치 추적**: 안전구역 기반 실시간 위치 모니터링
- **자동응답 시스템**: 상황별 맞춤형 응답 및 AI 학습
- **갈등 해소 도구**: 예방적 알림을 통한 문제 상황 사전 방지

### 기술 스택
- **Backend**: Node.js + TypeScript, GraphQL + REST API
- **Frontend**: React 18 + Next.js 14, React Native
- **Database**: PostgreSQL + Redis + MongoDB
- **Infrastructure**: Docker + Kubernetes, AWS/GCP
- **Messaging**: AWS SNS, Twilio, Firebase

### 대상 사용자
- **주 사용자**: 40대 직장인 부부 (예민한 성향의 부인, 남편)
- **관리 대상**: 초등학생 아들 (시간관리 능력 부족), 어린이집 딸
- **핵심 문제**: 아들의 학원 지각으로 인한 부부간 갈등 및 교육 방향성 충돌

## 🏗️ 프로젝트 구조

```
total-childcare-sns/
├── services/                    # ACTCS 특화 마이크로서비스
│   ├── family-auth/            # 가족 인증 및 권한 관리
│   ├── child-schedule/         # 자녀 일정 관리
│   ├── family-calendar/        # 가족 캘린더 통합
│   ├── messaging/              # 카카오톡 연동 메시징
│   ├── location-tracking/      # GPS 위치 추적
│   ├── auto-response/          # 자동응답 시스템
│   ├── conflict-resolution/    # 갈등 해소 도구
│   ├── family-management/      # 가족 구성원 관리
│   ├── realtime-sync/          # 실시간 동기화
│   └── api-gateway/            # API 게이트웨이
├── frontend/                   # 프론트엔드
│   ├── web/                    # 웹 애플리케이션
│   └── mobile/                 # 모바일 앱
├── infrastructure/             # 인프라 설정
│   ├── kubernetes/             # K8s 배포 설정
│   └── docker/                 # Docker 설정
├── docs/                       # 문서
├── tests/                      # 통합 테스트
└── scripts/                    # 유틸리티 스크립트
```

## 🚀 시작하기

### 개발 환경 설정
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 테스트 실행
npm test
```

### Docker 실행
```bash
# 전체 스택 실행
docker-compose up -d

# 특정 서비스만 실행
docker-compose up auth-service task-service
```

## 📚 문서

- [데이터베이스 스키마](./docs/database-schema.sql) - 가족 중심 데이터 모델
- [메시징 아키텍처](./docs/messaging-architecture.md) - 카카오톡 연동 메시징 시스템
- [위치 추적 시스템](./docs/location-tracking-system.md) - GPS 및 안전구역 관리
- [ACTCS 프로젝트 기획서](./attched/actcs_project_doc.md) - 원본 요구사항 문서

## 🔒 보안

- JWT 기반 인증 + 다중 인증 (MFA)
- 개인정보 암호화 (AES-256-GCM)
- GDPR/개인정보보호법 준수
- 실시간 보안 모니터링

## 📈 개발 로드맵

### Phase 1: MVP 개발 (4-6주)
- [ ] 가족 구성원 관리 및 권한 시스템
- [ ] 기본 일정 관리 (학원, 수업)
- [ ] 카카오톡 연동 메시징 (3단계 알림)
- [ ] 간단한 위치 추적 (안전구역 진입/이탈)
- [ ] 웹 애플리케이션 (부모용 관리 대시보드)

### Phase 2: 핵심 기능 완성 (8-12주)
- [ ] 고도화된 위치 추적 (경로 예측, 지각 위험 감지)
- [ ] 자동응답 시스템 (AI 학습 기반)
- [ ] 모바일 앱 (iOS/Android)
- [ ] 갈등 해소 도구 (행동 패턴 분석)
- [ ] 실시간 가족 소통 채널

### Phase 3: 지능화 및 확장 (12-16주)
- [ ] AI 기반 행동 패턴 분석 및 예측
- [ ] 가족 맞춤형 추천 시스템
- [ ] 다양한 가족 형태 지원 (한부모, 조손가정 등)
- [ ] 전문가 상담 연결 서비스

## 🤝 기여하기

1. Fork 프로젝트
2. Feature 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 Push (`git push origin feature/amazing-feature`)
5. Pull Request 생성

## 📝 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 📞 문의

프로젝트 관련 문의사항이 있으시면 이슈를 생성해 주세요.

---

**ACTCS (AI for Child Total Care Solution)** - 가족 갈등 해소를 위한 스마트 자녀 케어 플랫폼 👨‍👩‍👧‍👦✨

> "정보 비대칭성과 소통 부재로 인한 가족 갈등을 기술로 해결합니다"