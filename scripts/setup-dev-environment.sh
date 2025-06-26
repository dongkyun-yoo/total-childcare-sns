#!/bin/bash

# ACTCS 개발 환경 설정 스크립트
# AI for Child Total Care Solution Development Environment Setup

set -e  # 에러 발생 시 스크립트 중단

echo "🚀 ACTCS 개발 환경 설정을 시작합니다..."

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 운영체제 확인
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        OS="windows"
    else
        OS="unknown"
    fi
    log_info "Operating System: $OS"
}

# Node.js 설치 확인 및 설치
install_nodejs() {
    log_info "Node.js 설치를 확인합니다..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_success "Node.js가 이미 설치되어 있습니다: $NODE_VERSION"
        
        # Node.js 18+ 버전 확인
        NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [ "$NODE_MAJOR_VERSION" -lt 18 ]; then
            log_warning "Node.js 18+ 버전이 필요합니다. 업그레이드를 권장합니다."
        fi
    else
        log_warning "Node.js가 설치되지 않았습니다."
        
        if [[ "$OS" == "macos" ]]; then
            if command -v brew &> /dev/null; then
                log_info "Homebrew를 사용하여 Node.js를 설치합니다..."
                brew install node
            else
                log_error "Homebrew가 설치되지 않았습니다. https://nodejs.org에서 수동 설치하세요."
                exit 1
            fi
        elif [[ "$OS" == "linux" ]]; then
            log_info "NodeSource repository를 사용하여 Node.js를 설치합니다..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        else
            log_error "이 운영체제에서는 자동 설치가 지원되지 않습니다. https://nodejs.org에서 수동 설치하세요."
            exit 1
        fi
    fi
}

# Docker 설치 확인
check_docker() {
    log_info "Docker 설치를 확인합니다..."
    
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version)
        log_success "Docker가 설치되어 있습니다: $DOCKER_VERSION"
        
        # Docker 실행 상태 확인
        if docker info &> /dev/null; then
            log_success "Docker 데몬이 실행 중입니다."
        else
            log_warning "Docker 데몬이 실행되지 않았습니다. Docker Desktop을 시작하세요."
        fi
    else
        log_error "Docker가 설치되지 않았습니다."
        log_info "https://www.docker.com/products/docker-desktop에서 Docker Desktop을 설치하세요."
        exit 1
    fi
    
    if command -v docker-compose &> /dev/null; then
        COMPOSE_VERSION=$(docker-compose --version)
        log_success "Docker Compose가 설치되어 있습니다: $COMPOSE_VERSION"
    else
        log_error "Docker Compose가 설치되지 않았습니다."
        exit 1
    fi
}

# Git 설정 확인
check_git() {
    log_info "Git 설정을 확인합니다..."
    
    if command -v git &> /dev/null; then
        GIT_VERSION=$(git --version)
        log_success "Git이 설치되어 있습니다: $GIT_VERSION"
        
        # Git 사용자 설정 확인
        if git config user.name &> /dev/null && git config user.email &> /dev/null; then
            GIT_USER_NAME=$(git config user.name)
            GIT_USER_EMAIL=$(git config user.email)
            log_success "Git 사용자 설정: $GIT_USER_NAME <$GIT_USER_EMAIL>"
        else
            log_warning "Git 사용자 설정이 필요합니다."
            read -p "Git 사용자 이름을 입력하세요: " git_name
            read -p "Git 이메일을 입력하세요: " git_email
            git config --global user.name "$git_name"
            git config --global user.email "$git_email"
            log_success "Git 사용자 설정이 완료되었습니다."
        fi
    else
        log_error "Git이 설치되지 않았습니다. Git을 먼저 설치하세요."
        exit 1
    fi
}

# 환경변수 파일 설정
setup_environment_files() {
    log_info "환경변수 파일을 설정합니다..."
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_success ".env 파일이 생성되었습니다."
            log_warning "⚠️  .env 파일에서 필요한 API 키들을 설정해주세요:"
            echo "   - Google Maps API Key"
            echo "   - Kakao API Keys"
            echo "   - Firebase API Key"
            echo "   - Database credentials"
        else
            log_error ".env.example 파일이 없습니다."
        fi
    else
        log_success ".env 파일이 이미 존재합니다."
    fi
}

# NPM 의존성 설치
install_dependencies() {
    log_info "NPM 의존성을 설치합니다..."
    
    if [ -f "package.json" ]; then
        npm install
        log_success "루트 프로젝트 의존성 설치 완료"
    else
        log_warning "package.json 파일이 없습니다."
    fi
    
    # 서비스별 의존성 설치 (향후 추가될 예정)
    log_info "서비스별 의존성 설치는 각 서비스 구현 후 진행됩니다."
}

# Docker 컨테이너 빌드 및 실행
setup_docker_services() {
    log_info "Docker 서비스를 설정합니다..."
    
    if [ -f "docker-compose.yml" ]; then
        log_info "Docker 이미지를 빌드합니다..."
        docker-compose build
        
        log_info "Docker 서비스를 시작합니다..."
        docker-compose up -d postgres redis mongodb
        
        # 데이터베이스 연결 대기
        log_info "데이터베이스 서비스 시작을 대기합니다..."
        sleep 10
        
        # 연결 테스트
        if docker-compose exec postgres pg_isready -U childcare_user -d total_childcare_sns; then
            log_success "PostgreSQL 데이터베이스 연결 성공"
        else
            log_warning "PostgreSQL 연결에 실패했습니다. 잠시 후 다시 시도하세요."
        fi
        
        log_success "Docker 서비스 설정 완료"
        log_info "실행 중인 서비스:"
        docker-compose ps
    else
        log_error "docker-compose.yml 파일이 없습니다."
    fi
}

# 개발 도구 추천 설치
recommend_dev_tools() {
    log_info "🛠️  추천 개발 도구들:"
    echo ""
    echo "📱 모바일 개발:"
    echo "  - Xcode (iOS) - App Store에서 설치"
    echo "  - Android Studio - https://developer.android.com/studio"
    echo ""
    echo "🔧 백엔드 개발:"
    echo "  - VS Code - https://code.visualstudio.com/"
    echo "  - Postman - API 테스트용 https://www.postman.com/"
    echo "  - TablePlus - 데이터베이스 관리 https://tableplus.com/"
    echo ""
    echo "🗺️  기타 도구:"
    echo "  - Google Cloud Console - Google Maps API 관리"
    echo "  - Kakao Developers - https://developers.kakao.com/"
    echo "  - Firebase Console - https://console.firebase.google.com/"
    echo ""
}

# API 키 설정 가이드
show_api_setup_guide() {
    log_info "📋 API 키 설정 가이드:"
    echo ""
    echo "1. Google Maps API:"
    echo "   - Google Cloud Console에서 프로젝트 생성"
    echo "   - Maps JavaScript API, Geocoding API 활성화"
    echo "   - API 키 생성 후 .env 파일에 GOOGLE_MAPS_API_KEY 설정"
    echo ""
    echo "2. Kakao API:"
    echo "   - https://developers.kakao.com/ 에서 앱 생성"
    echo "   - REST API 키 발급 후 .env 파일에 KAKAO_REST_API_KEY 설정"
    echo ""
    echo "3. Firebase:"
    echo "   - Firebase Console에서 프로젝트 생성"
    echo "   - 서비스 계정 키 다운로드"
    echo "   - .env 파일에 Firebase 설정 추가"
    echo ""
    echo "자세한 내용은 docs/google-maps-integration.md 문서를 참조하세요."
}

# 개발 서버 시작 스크립트 생성
create_dev_scripts() {
    log_info "개발 스크립트를 생성합니다..."
    
    # 개발 서버 시작 스크립트
    cat > scripts/start-dev.sh << 'EOF'
#!/bin/bash
echo "🚀 ACTCS 개발 서버를 시작합니다..."

# Docker 서비스 시작
docker-compose up -d

# 백엔드 서비스들 시작 (향후 구현)
echo "백엔드 서비스 시작 준비 중..."

# 프론트엔드 개발 서버 시작 (향후 구현)
echo "프론트엔드 개발 서버 시작 준비 중..."

echo "✅ 개발 환경이 준비되었습니다!"
echo "📊 대시보드: http://localhost:3000"
echo "🗄️  데이터베이스 관리: http://localhost:5050 (pgAdmin)"
echo "🔴 Redis 관리: http://localhost:8081"
EOF

    # 개발 서버 중지 스크립트
    cat > scripts/stop-dev.sh << 'EOF'
#!/bin/bash
echo "🛑 ACTCS 개발 서버를 중지합니다..."

# Docker 서비스 중지
docker-compose down

echo "✅ 개발 서버가 중지되었습니다."
EOF

    # 실행 권한 부여
    chmod +x scripts/start-dev.sh
    chmod +x scripts/stop-dev.sh
    
    log_success "개발 스크립트 생성 완료"
}

# 메인 실행
main() {
    echo "🎯 ACTCS (AI for Child Total Care Solution)"
    echo "=================================="
    echo ""
    
    detect_os
    echo ""
    
    install_nodejs
    echo ""
    
    check_docker
    echo ""
    
    check_git
    echo ""
    
    setup_environment_files
    echo ""
    
    install_dependencies
    echo ""
    
    setup_docker_services
    echo ""
    
    create_dev_scripts
    echo ""
    
    recommend_dev_tools
    echo ""
    
    show_api_setup_guide
    echo ""
    
    log_success "🎉 ACTCS 개발 환경 설정이 완료되었습니다!"
    echo ""
    echo "다음 단계:"
    echo "1. .env 파일에서 API 키들을 설정하세요"
    echo "2. ./scripts/start-dev.sh 실행으로 개발 서버 시작"
    echo "3. 백엔드 API 개발 시작"
    echo "4. iOS/Android 앱 개발 시작"
    echo ""
    echo "💡 도움말: npm run dev 또는 ./scripts/start-dev.sh"
}

# 스크립트 실행
main "$@"