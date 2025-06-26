-- ACTCS (AI for Child Total Care Solution) Database Schema
-- 가족 갈등 해소를 위한 자녀 케어 시스템

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
CREATE TYPE member_role AS ENUM ('parent_admin', 'parent', 'child', 'guardian', 'observer');
CREATE TYPE member_type AS ENUM ('father', 'mother', 'son', 'daughter', 'grandfather', 'grandmother', 'other');

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
CREATE TYPE education_level AS ENUM ('nursery', 'kindergarten', 'elementary', 'middle', 'high');

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
CREATE TYPE schedule_type AS ENUM ('academy', 'school', 'medical', 'activity', 'family', 'other');
CREATE TYPE schedule_status AS ENUM ('scheduled', 'in_progress', 'completed', 'missed', 'cancelled');

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
CREATE TYPE location_status AS ENUM ('at_home', 'in_transit', 'at_destination', 'unknown', 'emergency');

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
    timestamp TIMESTAMP DEFAULT NOW(),
    
    -- 위치 데이터 보존 기간 관리를 위한 인덱스
    CONSTRAINT location_tracking_timestamp_idx USING HASH (timestamp)
);

-- 7. 알림 및 메시징 로그
CREATE TYPE message_type AS ENUM ('schedule_reminder', 'location_alert', 'emergency', 'family_message', 'auto_response');
CREATE TYPE message_channel AS ENUM ('kakao', 'sms', 'push', 'in_app');
CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

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
CREATE TYPE conflict_type AS ENUM ('tardiness', 'attitude', 'communication', 'responsibility', 'other');
CREATE TYPE conflict_status AS ENUM ('active', 'resolving', 'resolved', 'recurring');

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

-- 위치 데이터 자동 정리 (90일 이상 된 데이터 삭제)
CREATE OR REPLACE FUNCTION cleanup_old_location_data()
RETURNS void AS $$
BEGIN
    DELETE FROM location_tracking 
    WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- 매일 새벽 2시에 위치 데이터 정리 실행 (cron job 설정 필요)
-- SELECT cron.schedule('cleanup-location', '0 2 * * *', 'SELECT cleanup_old_location_data();');