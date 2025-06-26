#!/bin/bash
# ACTCS Database Connection Test Script

echo "🔧 ACTCS Database Connection Test"
echo "==================================="

# PostgreSQL 연결 정보
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-actcs_db}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-password}

echo "📡 Testing PostgreSQL connection..."
echo "Host: $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo ""

# PostgreSQL 연결 테스트
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 'PostgreSQL connection successful!' as status;"

if [ $? -eq 0 ]; then
    echo "✅ PostgreSQL connection successful!"
    
    echo ""
    echo "📊 Testing table structure..."
    
    # 테이블 존재 확인
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
        SELECT 
            table_name,
            CASE 
                WHEN table_name IN ('users', 'families', 'schedules', 'location_history', 'geofences') 
                THEN '✅' 
                ELSE '📋' 
            END as status
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    "
    
    echo ""
    echo "🔢 Testing sample data..."
    
    # 샘플 데이터 확인
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
        SELECT 'Families: ' || COUNT(*) as count FROM families
        UNION ALL
        SELECT 'Users: ' || COUNT(*) as count FROM users
        UNION ALL
        SELECT 'Schedules: ' || COUNT(*) as count FROM schedules;
    "
    
    echo ""
    echo "⚡ Testing service endpoints..."
    
    # family-auth 서비스 테스트
    echo "Testing family-auth service..."
    curl -s -o /dev/null -w "family-auth health: %{http_code}\n" http://localhost:3001/health || echo "family-auth: Not running"
    
    # child-schedule 서비스 테스트
    echo "Testing child-schedule service..."
    curl -s -o /dev/null -w "child-schedule health: %{http_code}\n" http://localhost:3002/health || echo "child-schedule: Not running"
    
    # location-tracking 서비스 테스트
    echo "Testing location-tracking service..."
    curl -s -o /dev/null -w "location-tracking health: %{http_code}\n" http://localhost:3003/health || echo "location-tracking: Not running"
    
    # api-gateway 테스트
    echo "Testing api-gateway..."
    curl -s -o /dev/null -w "api-gateway health: %{http_code}\n" http://localhost:3000/health || echo "api-gateway: Not running"
    
else
    echo "❌ PostgreSQL connection failed!"
    echo "Please check:"
    echo "  1. PostgreSQL is running"
    echo "  2. Database '$DB_NAME' exists"
    echo "  3. User '$DB_USER' has access"
    echo "  4. Connection parameters are correct"
fi

echo ""
echo "🏁 Test completed!"