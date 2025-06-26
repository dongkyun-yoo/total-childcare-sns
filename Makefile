# ACTCS Makefile
# AI for Child Total Care Solution Development Commands

.PHONY: help setup dev start stop clean test build deploy

# 기본 타겟
.DEFAULT_GOAL := help

# 색상 정의
GREEN  := \033[0;32m
YELLOW := \033[1;33m
RED    := \033[0;31m
BLUE   := \033[0;34m
NC     := \033[0m

help: ## 사용 가능한 명령어 표시
	@echo "$(GREEN)ACTCS Development Commands$(NC)"
	@echo "================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(BLUE)%-20s$(NC) %s\n", $$1, $$2}'

setup: ## 개발 환경 초기 설정
	@echo "$(GREEN)🚀 ACTCS 개발 환경을 설정합니다...$(NC)"
	@chmod +x scripts/setup-dev-environment.sh
	@./scripts/setup-dev-environment.sh

dev: ## 개발 서버 시작 (Docker + 모든 서비스)
	@echo "$(GREEN)🚀 개발 서버를 시작합니다...$(NC)"
	@docker-compose up -d
	@echo "$(GREEN)✅ 개발 서버가 시작되었습니다!$(NC)"
	@echo "$(BLUE)📊 웹 대시보드: http://localhost:3000$(NC)"

db-init: ## 데이터베이스 초기화
	@echo "$(GREEN)🗄️ 데이터베이스를 초기화합니다...$(NC)"
	@if command -v psql >/dev/null 2>&1; then \
		PGPASSWORD=password psql -h localhost -p 5432 -U postgres -d postgres -f infrastructure/docker/postgres/init-simple.sql; \
	else \
		echo "$(RED)❌ psql not found. Please install PostgreSQL client.$(NC)"; \
	fi
	@echo "$(GREEN)✅ 데이터베이스 초기화 완료!$(NC)"

db-test: ## 데이터베이스 연결 테스트
	@echo "$(GREEN)🔍 데이터베이스 연결을 테스트합니다...$(NC)"
	@./scripts/db-test.sh

services: ## 서비스 상태 확인
	@echo "$(GREEN)📊 서비스 상태:$(NC)"
	@echo "================="
	@curl -s http://localhost:3000/health 2>/dev/null | jq '.service + ": " + .status' 2>/dev/null || echo "api-gateway: offline"
	@curl -s http://localhost:3001/health 2>/dev/null | jq '.service + ": " + .status' 2>/dev/null || echo "family-auth: offline"
	@curl -s http://localhost:3002/health 2>/dev/null | jq '.service + ": " + .status' 2>/dev/null || echo "child-schedule: offline"
	@curl -s http://localhost:3003/health 2>/dev/null | jq '.service + ": " + .status' 2>/dev/null || echo "location-tracking: offline"
	@echo "$(BLUE)🗄️  PgAdmin: http://localhost:5050$(NC)"
	@echo "$(BLUE)🔴 Redis Commander: http://localhost:8081$(NC)"

start: dev ## dev와 동일 (개발 서버 시작)

stop: ## 개발 서버 중지
	@echo "$(YELLOW)🛑 개발 서버를 중지합니다...$(NC)"
	@docker-compose down
	@echo "$(GREEN)✅ 개발 서버가 중지되었습니다.$(NC)"

restart: stop dev ## 개발 서버 재시작

status: ## 서비스 상태 확인
	@echo "$(BLUE)📊 서비스 상태:$(NC)"
	@docker-compose ps

logs: ## 전체 로그 확인
	@docker-compose logs -f

logs-db: ## 데이터베이스 로그만 확인
	@docker-compose logs -f postgres

logs-redis: ## Redis 로그만 확인
	@docker-compose logs -f redis

clean: ## Docker 컨테이너 및 볼륨 정리
	@echo "$(YELLOW)🧹 Docker 리소스를 정리합니다...$(NC)"
	@docker-compose down -v
	@docker system prune -f
	@echo "$(GREEN)✅ 정리가 완료되었습니다.$(NC)"

clean-all: ## 모든 Docker 리소스 정리 (이미지 포함)
	@echo "$(RED)⚠️  모든 Docker 리소스를 정리합니다...$(NC)"
	@docker-compose down -v --rmi all
	@docker system prune -a -f
	@echo "$(GREEN)✅ 전체 정리가 완료되었습니다.$(NC)"

test: ## 테스트 실행
	@echo "$(BLUE)🧪 테스트를 실행합니다...$(NC)"
	@npm test

test-unit: ## 단위 테스트만 실행
	@echo "$(BLUE)🧪 단위 테스트를 실행합니다...$(NC)"
	@npm run test:unit

test-integration: ## 통합 테스트 실행
	@echo "$(BLUE)🧪 통합 테스트를 실행합니다...$(NC)"
	@npm run test:integration

test-e2e: ## E2E 테스트 실행
	@echo "$(BLUE)🧪 E2E 테스트를 실행합니다...$(NC)"
	@npm run test:e2e

lint: ## 코드 린팅
	@echo "$(BLUE)🔍 코드 린팅을 실행합니다...$(NC)"
	@npm run lint

lint-fix: ## 코드 린팅 및 자동 수정
	@echo "$(BLUE)🔧 코드 린팅 및 자동 수정을 실행합니다...$(NC)"
	@npm run lint:fix

typecheck: ## TypeScript 타입 체크
	@echo "$(BLUE)🔍 TypeScript 타입 체크를 실행합니다...$(NC)"
	@npm run typecheck

build: ## 프로덕션 빌드
	@echo "$(BLUE)🏗️  프로덕션 빌드를 시작합니다...$(NC)"
	@npm run build
	@echo "$(GREEN)✅ 빌드가 완료되었습니다.$(NC)"

build-docker: ## Docker 이미지 빌드
	@echo "$(BLUE)🐳 Docker 이미지를 빌드합니다...$(NC)"
	@docker-compose build
	@echo "$(GREEN)✅ Docker 이미지 빌드가 완료되었습니다.$(NC)"

install: ## 의존성 설치
	@echo "$(BLUE)📦 의존성을 설치합니다...$(NC)"
	@npm install
	@echo "$(GREEN)✅ 의존성 설치가 완료되었습니다.$(NC)"

update: ## 의존성 업데이트
	@echo "$(BLUE)🔄 의존성을 업데이트합니다...$(NC)"
	@npm update
	@echo "$(GREEN)✅ 의존성 업데이트가 완료되었습니다.$(NC)"

db-reset: ## 데이터베이스 리셋 (개발용)
	@echo "$(YELLOW)⚠️  데이터베이스를 리셋합니다...$(NC)"
	@docker-compose exec postgres psql -U childcare_user -d total_childcare_sns -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	@docker-compose restart postgres
	@echo "$(GREEN)✅ 데이터베이스 리셋이 완료되었습니다.$(NC)"

db-migrate: ## 데이터베이스 마이그레이션 실행
	@echo "$(BLUE)🗄️  데이터베이스 마이그레이션을 실행합니다...$(NC)"
	@echo "마이그레이션 도구가 구현되면 여기에 추가됩니다."

db-seed: ## 개발용 시드 데이터 입력
	@echo "$(BLUE)🌱 시드 데이터를 입력합니다...$(NC)"
	@echo "시드 데이터 스크립트가 구현되면 여기에 추가됩니다."

backup: ## 데이터베이스 백업
	@echo "$(BLUE)💾 데이터베이스를 백업합니다...$(NC)"
	@mkdir -p backups
	@docker-compose exec postgres pg_dump -U childcare_user total_childcare_sns > backups/backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "$(GREEN)✅ 백업이 완료되었습니다.$(NC)"

# iOS 관련 명령어
ios-setup: ## iOS 개발 환경 설정
	@echo "$(BLUE)📱 iOS 개발 환경을 설정합니다...$(NC)"
	@echo "Xcode 프로젝트가 생성되면 여기에 추가됩니다."

ios-build: ## iOS 앱 빌드
	@echo "$(BLUE)🍎 iOS 앱을 빌드합니다...$(NC)"
	@echo "iOS 프로젝트가 생성되면 여기에 추가됩니다."

ios-test: ## iOS 테스트 실행
	@echo "$(BLUE)🧪 iOS 테스트를 실행합니다...$(NC)"
	@echo "iOS 테스트가 구현되면 여기에 추가됩니다."

# Android 관련 명령어
android-setup: ## Android 개발 환경 설정
	@echo "$(BLUE)🤖 Android 개발 환경을 설정합니다...$(NC)"
	@echo "Android 프로젝트가 생성되면 여기에 추가됩니다."

android-build: ## Android 앱 빌드
	@echo "$(BLUE)🤖 Android 앱을 빌드합니다...$(NC)"
	@echo "Android 프로젝트가 생성되면 여기에 추가됩니다."

android-test: ## Android 테스트 실행
	@echo "$(BLUE)🧪 Android 테스트를 실행합니다...$(NC)"
	@echo "Android 테스트가 구현되면 여기에 추가됩니다."

# Git 관련 명령어
git-setup: ## Git hooks 설정
	@echo "$(BLUE)🔧 Git hooks를 설정합니다...$(NC)"
	@echo "#!/bin/sh\nmake lint && make typecheck" > .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "$(GREEN)✅ Git hooks 설정이 완료되었습니다.$(NC)"

# 배포 관련 명령어
deploy-staging: ## 스테이징 환경 배포
	@echo "$(BLUE)🚀 스테이징 환경에 배포합니다...$(NC)"
	@echo "배포 스크립트가 구현되면 여기에 추가됩니다."

deploy-prod: ## 프로덕션 환경 배포
	@echo "$(RED)🚀 프로덕션 환경에 배포합니다...$(NC)"
	@echo "배포 스크립트가 구현되면 여기에 추가됩니다."

# 문서 관련
docs: ## 문서 빌드
	@echo "$(BLUE)📚 문서를 빌드합니다...$(NC)"
	@echo "문서 빌드 도구가 구현되면 여기에 추가됩니다."

docs-serve: ## 문서 서버 시작
	@echo "$(BLUE)📚 문서 서버를 시작합니다...$(NC)"
	@echo "문서 서빙 도구가 구현되면 여기에 추가됩니다."

# 유틸리티
check-deps: ## 의존성 보안 체크
	@echo "$(BLUE)🔒 의존성 보안을 체크합니다...$(NC)"
	@npm audit

update-deps: ## 의존성 보안 업데이트
	@echo "$(BLUE)🔒 의존성 보안 업데이트를 실행합니다...$(NC)"
	@npm audit fix

info: ## 프로젝트 정보 표시
	@echo "$(GREEN)ACTCS - AI for Child Total Care Solution$(NC)"
	@echo "=========================================="
	@echo "📋 프로젝트: 가족 갈등 해소를 위한 자녀 케어 솔루션"
	@echo "🏗️  아키텍처: 마이크로서비스"
	@echo "📱 플랫폼: iOS, Android, Web"
	@echo "🗄️  데이터베이스: PostgreSQL, Redis, MongoDB"
	@echo "📍 위치 서비스: Google Maps"
	@echo "💬 메시징: KakaoTalk 연동"
	@echo ""
	@echo "$(BLUE)📊 현재 상태:$(NC)"
	@docker-compose ps 2>/dev/null || echo "Docker 서비스가 실행되지 않았습니다."