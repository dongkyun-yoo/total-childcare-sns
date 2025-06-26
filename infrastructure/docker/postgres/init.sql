-- ACTCS PostgreSQL 초기화 스크립트
-- AI for Child Total Care Solution Database Initialization

-- 데이터베이스 생성 (이미 존재할 수 있으므로 IF NOT EXISTS 사용)
SELECT 'CREATE DATABASE total_childcare_sns'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'total_childcare_sns')\gexec

-- 연결할 데이터베이스 변경
\c total_childcare_sns;

-- 확장 모듈 설치
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUM 타입 정의
CREATE TYPE member_role AS ENUM ('parent_admin', 'parent', 'child', 'guardian', 'observer');
CREATE TYPE member_type AS ENUM ('father', 'mother', 'son', 'daughter', 'grandfather', 'grandmother', 'other');
CREATE TYPE education_level AS ENUM ('nursery', 'kindergarten', 'elementary', 'middle', 'high');
CREATE TYPE schedule_type AS ENUM ('academy', 'school', 'medical', 'activity', 'family', 'other');
CREATE TYPE schedule_status AS ENUM ('scheduled', 'in_progress', 'completed', 'missed', 'cancelled');
CREATE TYPE location_status AS ENUM ('at_home', 'in_transit', 'at_destination', 'unknown', 'emergency');
CREATE TYPE message_type AS ENUM ('schedule_reminder', 'location_alert', 'emergency', 'family_message', 'auto_response');
CREATE TYPE message_channel AS ENUM ('kakao', 'sms', 'push', 'in_app');
CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE conflict_type AS ENUM ('tardiness', 'attitude', 'communication', 'responsibility', 'other');
CREATE TYPE conflict_status AS ENUM ('active', 'resolving', 'resolved', 'recurring');

-- 1. 가족 관리 테이블
CREATE TABLE families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_name VARCHAR(100) NOT NULL,
    family_code VARCHAR(20) UNIQUE NOT NULL, -- 가족 초대코드
    timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 가족 구성원 관리
CREATE TABLE family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    user_id UUID UNIQUE, -- NULL for children without individual accounts
    name VARCHAR(100) NOT NULL,
    nickname VARCHAR(50),
    member_role member_role NOT NULL,
    member_type member_type NOT NULL,
    birth_date DATE,
    phone_number VARCHAR(20),
    emergency_contact VARCHAR(20),
    avatar_url VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. 자녀 상세 프로필 (초등학생, 어린이집 등)
CREATE TABLE children_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
    school_name VARCHAR(100),
    grade VARCHAR(20),
    education_level education_level,
    teacher_name VARCHAR(100),
    teacher_contact VARCHAR(20),
    special_notes TEXT, -- 건강상태, 알레르기, 특이사항 등
    behavior_patterns JSONB DEFAULT '{}', -- 행동 패턴 분석 데이터
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. 학원 및 활동 장소 관리
CREATE TABLE activity_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    place_name VARCHAR(100) NOT NULL,
    place_type VARCHAR(50), -- 'academy', 'school', 'hospital', 'playground' 등
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8),  -- GPS 좌표
    longitude DECIMAL(11, 8),
    contact_phone VARCHAR(20),
    notes TEXT,
    is_safe_zone BOOLEAN DEFAULT false, -- 안전구역 여부
    safe_zone_radius INTEGER DEFAULT 100, -- 안전구역 반경(미터)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. 자녀별 일정 관리 (학원, 수업 등)
CREATE TABLE child_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
    place_id UUID REFERENCES activity_places(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    schedule_type schedule_type NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    recurring_pattern VARCHAR(50), -- 'weekly', 'daily', 'monthly' 등
    reminder_settings JSONB DEFAULT '{"30min": true, "10min": true}', -- 알림 설정
    attendance_required BOOLEAN DEFAULT true,
    status schedule_status DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. 실시간 위치 추적
CREATE TABLE location_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy_meters INTEGER,
    address TEXT,
    location_status location_status DEFAULT 'unknown',
    current_place_id UUID REFERENCES activity_places(id), -- 현재 위치가 등록된 장소인 경우
    battery_level INTEGER, -- 디바이스 배터리 수준
    timestamp TIMESTAMP DEFAULT NOW()
);

-- 7. 알림 및 메시징 로그
CREATE TABLE family_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES family_members(id),
    recipient_ids UUID[] NOT NULL, -- 여러 수신자 지원
    message_type message_type NOT NULL,
    channel message_channel NOT NULL,
    subject VARCHAR(200),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}', -- 추가 메타데이터 (일정 ID 등)
    status message_status DEFAULT 'pending',
    scheduled_at TIMESTAMP, -- 예약 발송
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. 자동응답 시스템
CREATE TABLE auto_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
    trigger_condition VARCHAR(100) NOT NULL, -- '학원 출발 시', '지각 시' 등
    response_template TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 9. 갈등 해소 및 분석
CREATE TABLE conflict_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    child_member_id UUID REFERENCES family_members(id),
    conflict_type conflict_type NOT NULL,
    description TEXT NOT NULL,
    trigger_event VARCHAR(200), -- 갈등 유발 사건
    participants UUID[], -- 갈등 참여자들
    resolution_notes TEXT,
    status conflict_status DEFAULT 'active',
    occurred_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 10. 권한 관리
CREATE TABLE member_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
    permission_scope VARCHAR(50) NOT NULL, -- 'location_view', 'schedule_edit' 등
    target_member_id UUID REFERENCES family_members(id), -- 대상 가족구성원
    granted_by UUID REFERENCES family_members(id),
    is_granted BOOLEAN DEFAULT true,
    granted_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

-- 11. 알림 설정 (개인별 맞춤)
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL, -- 'schedule', 'location', 'emergency' 등
    channel message_channel NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    quiet_hours_start TIME, -- 방해금지 시간 시작
    quiet_hours_end TIME,   -- 방해금지 시간 종료
    frequency_limit INTEGER DEFAULT 10, -- 하루 최대 알림 수
    custom_settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 12. 행동 패턴 분석 (AI 학습용)
CREATE TABLE behavior_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    punctuality_score INTEGER CHECK (punctuality_score >= 0 AND punctuality_score <= 100),
    cooperation_score INTEGER CHECK (cooperation_score >= 0 AND cooperation_score <= 100),
    communication_score INTEGER CHECK (communication_score >= 0 AND communication_score <= 100),
    total_schedules INTEGER DEFAULT 0,
    completed_schedules INTEGER DEFAULT 0,
    missed_schedules INTEGER DEFAULT 0,
    average_delay_minutes INTEGER DEFAULT 0,
    behavioral_notes TEXT,
    improvement_suggestions TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX idx_family_members_family_id ON family_members(family_id);
CREATE INDEX idx_child_schedules_child_member_id ON child_schedules(child_member_id);
CREATE INDEX idx_child_schedules_start_time ON child_schedules(start_time);
CREATE INDEX idx_location_tracking_member_id ON location_tracking(member_id);
CREATE INDEX idx_location_tracking_timestamp ON location_tracking(timestamp);
CREATE INDEX idx_family_messages_family_id ON family_messages(family_id);
CREATE INDEX idx_family_messages_recipient_ids ON family_messages USING GIN(recipient_ids);
CREATE INDEX idx_conflict_logs_family_id ON conflict_logs(family_id);
CREATE INDEX idx_behavior_analytics_child_date ON behavior_analytics(child_member_id, date);

-- 기본 데이터 삽입 (개발용)
-- 개발 환경용 샘플 가족 데이터
INSERT INTO families (id, family_name, family_code, timezone) VALUES 
('00000000-0000-0000-0000-000000000001', '김씨 가족', 'FAMILY001', 'Asia/Seoul'),
('00000000-0000-0000-0000-000000000002', '이씨 가족', 'FAMILY002', 'Asia/Seoul');

-- 개발 환경용 샘플 가족 구성원
INSERT INTO family_members (id, family_id, name, member_role, member_type, birth_date) VALUES 
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '김아빠', 'parent_admin', 'father', '1980-05-15'),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '김엄마', 'parent', 'mother', '1982-08-20'),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '김민수', 'child', 'son', '2014-03-10'),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '김지영', 'child', 'daughter', '2018-11-25');

-- 개발 환경용 샘플 활동 장소
INSERT INTO activity_places (family_id, place_name, place_type, address, latitude, longitude, is_safe_zone, safe_zone_radius) VALUES 
('00000000-0000-0000-0000-000000000001', '우리집', 'home', '서울특별시 강남구 테헤란로 123', 37.5665, 126.9780, true, 50),
('00000000-0000-0000-0000-000000000001', '태권도 학원', 'academy', '서울특별시 강남구 역삼동 456', 37.5005, 127.0374, true, 100),
('00000000-0000-0000-0000-000000000001', '영어 학원', 'academy', '서울특별시 강남구 삼성동 789', 37.5140, 127.0572, true, 100),
('00000000-0000-0000-0000-000000000001', '초등학교', 'school', '서울특별시 강남구 대치동 101', 37.4944, 127.0622, true, 200);

-- 위치 데이터 자동 정리 함수
CREATE OR REPLACE FUNCTION cleanup_old_location_data()
RETURNS void AS $$
BEGIN
    DELETE FROM location_tracking 
    WHERE timestamp < NOW() - INTERVAL '90 days';
    
    -- 정리된 레코드 수 로그
    RAISE NOTICE '90일 이상 된 위치 데이터가 정리되었습니다.';
END;
$$ LANGUAGE plpgsql;

-- 트리거 함수: updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at 트리거 적용
CREATE TRIGGER update_families_updated_at
    BEFORE UPDATE ON families
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_members_updated_at
    BEFORE UPDATE ON family_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_children_profiles_updated_at
    BEFORE UPDATE ON children_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activity_places_updated_at
    BEFORE UPDATE ON activity_places
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_child_schedules_updated_at
    BEFORE UPDATE ON child_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 성공 메시지
SELECT 'ACTCS 데이터베이스 초기화가 완료되었습니다.' as result;