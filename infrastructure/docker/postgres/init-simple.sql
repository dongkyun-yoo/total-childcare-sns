-- ACTCS 백엔드 서비스용 간소화된 DB 스키마
-- 기존 구현된 서비스들과 호환되도록 설계

-- 확장 모듈 설치
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users 테이블 (family-auth 서비스용)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('parent', 'child')) NOT NULL,
    family_id INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Families 테이블
CREATE TABLE IF NOT EXISTS families (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    family_code VARCHAR(20) UNIQUE NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Schedules 테이블 (child-schedule 서비스용)
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    child_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    location VARCHAR(255),
    alert_30min BOOLEAN DEFAULT true,
    alert_10min BOOLEAN DEFAULT true,
    alert_late BOOLEAN DEFAULT true,
    alert_30min_sent BOOLEAN DEFAULT false,
    alert_10min_sent BOOLEAN DEFAULT false,
    alert_late_sent BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Alert History 테이블
CREATE TABLE IF NOT EXISTS alert_history (
    id SERIAL PRIMARY KEY,
    child_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
    alert_type VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT NOW(),
    read_at TIMESTAMP
);

-- 5. Location History 테이블 (location-tracking 서비스용)
CREATE TABLE IF NOT EXISTS location_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy INTEGER,
    altitude DECIMAL(8, 2),
    heading DECIMAL(5, 2),
    speed DECIMAL(5, 2),
    timestamp TIMESTAMP DEFAULT NOW()
);

-- 6. Geofences 테이블
CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    center_lat DECIMAL(10, 8) NOT NULL,
    center_lng DECIMAL(11, 8) NOT NULL,
    radius INTEGER NOT NULL,
    type VARCHAR(20) CHECK (type IN ('safe_zone', 'alert_zone', 'restricted_zone')) NOT NULL,
    alert_on_enter BOOLEAN DEFAULT true,
    alert_on_exit BOOLEAN DEFAULT true,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. Geofence Alerts 테이블
CREATE TABLE IF NOT EXISTS geofence_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    geofence_id INTEGER REFERENCES geofences(id) ON DELETE CASCADE,
    alert_type VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    triggered_at TIMESTAMP DEFAULT NOW()
);

-- 8. Speed Alerts 테이블
CREATE TABLE IF NOT EXISTS speed_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    speed DECIMAL(5, 2) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- 9. User Status Alerts 테이블
CREATE TABLE IF NOT EXISTS user_status_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    alert_type VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Foreign Key 추가
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS fk_users_family 
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL;

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_users_family_id ON users(family_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_schedules_child_id ON schedules(child_id);
CREATE INDEX IF NOT EXISTS idx_schedules_start_time ON schedules(start_time);
CREATE INDEX IF NOT EXISTS idx_location_history_user_id ON location_history(user_id);
CREATE INDEX IF NOT EXISTS idx_location_history_timestamp ON location_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_alert_history_child_id ON alert_history(child_id);
CREATE INDEX IF NOT EXISTS idx_geofences_user_id ON geofences(user_id);
CREATE INDEX IF NOT EXISTS idx_geofence_alerts_user_id ON geofence_alerts(user_id);

-- 샘플 데이터 삽입
INSERT INTO families (name, family_code) VALUES 
    ('김씨 가족', 'KIM2025'),
    ('이씨 가족', 'LEE2025')
ON CONFLICT (family_code) DO NOTHING;

INSERT INTO users (email, password_hash, name, role, family_id) VALUES 
    ('parent1@test.com', '$2a$10$dummy.hash.for.testing', '김아빠', 'parent', 1),
    ('parent2@test.com', '$2a$10$dummy.hash.for.testing', '김엄마', 'parent', 1),
    ('child1@test.com', '$2a$10$dummy.hash.for.testing', '김아들', 'child', 1)
ON CONFLICT (email) DO NOTHING;

-- 샘플 일정 데이터
INSERT INTO schedules (child_id, title, description, start_time, end_time, location) VALUES 
    (3, '태권도 학원', '태권도 수업 - 기본 품새 연습', NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours', '강남구 태권도장'),
    (3, '영어 학원', '영어 회화 수업', NOW() + INTERVAL '3 hours', NOW() + INTERVAL '4 hours', '강남구 영어학원')
ON CONFLICT DO NOTHING;

-- 위치 데이터 자동 정리 함수
CREATE OR REPLACE FUNCTION cleanup_old_location_data()
RETURNS void AS $$
BEGIN
    DELETE FROM location_history 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    DELETE FROM alert_history 
    WHERE sent_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- 트리거: 업데이트 시간 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 적용
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_families_updated_at') THEN
        CREATE TRIGGER update_families_updated_at BEFORE UPDATE ON families
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_schedules_updated_at') THEN
        CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_geofences_updated_at') THEN
        CREATE TRIGGER update_geofences_updated_at BEFORE UPDATE ON geofences
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;

-- 성공 메시지
SELECT 'ACTCS 백엔드 DB 스키마 초기화 완료!' as status;