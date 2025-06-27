FROM node:18-alpine

WORKDIR /app

# 패키지 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 코드 복사
COPY . .

# TypeScript 빌드
RUN npm run build

# 로그 디렉토리 생성
RUN mkdir -p logs

# 보안: non-root 사용자 생성
RUN addgroup -g 1001 -S nodejs
RUN adduser -S messaging -u 1001

# 파일 권한 설정
RUN chown -R messaging:nodejs /app
USER messaging

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3004/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

EXPOSE 3004

CMD ["npm", "start"]