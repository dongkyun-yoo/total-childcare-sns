-- ACTCS Supabase Database Schema
-- 기존 PostgreSQL 스키마를 Supabase 환경에 맞게 최적화

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. 가족 관리 테이블
CREATE TABLE public.families (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_name VARCHAR(100) NOT NULL,
    family_code VARCHAR(20) UNIQUE NOT NULL DEFAULT substring(gen_random_uuid()::text, 1, 8),
    timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security 활성화
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

-- 2. 가족 구성원 관리
CREATE TYPE public.member_role AS ENUM ('parent_admin', 'parent', 'child', 'guardian', 'observer');
CREATE TYPE public.member_type AS ENUM ('father', 'mother', 'son', 'daughter', 'grandfather', 'grandmother', 'other');

CREATE TABLE public.family_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Supabase Auth 연동
    name VARCHAR(100) NOT NULL,
    nickname VARCHAR(50),
    member_role public.member_role NOT NULL,
    member_type public.member_type NOT NULL,
    birth_date DATE,
    phone_number VARCHAR(20),
    emergency_contact VARCHAR(20),
    avatar_url VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- 3. 자녀 상세 프로필
CREATE TYPE public.education_level AS ENUM ('nursery', 'kindergarten', 'elementary', 'middle', 'high');

CREATE TABLE public.children_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE,
    school_name VARCHAR(100),
    grade VARCHAR(20),
    education_level public.education_level,
    teacher_name VARCHAR(100),
    teacher_contact VARCHAR(20),
    special_notes TEXT,
    behavior_patterns JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.children_profiles ENABLE ROW LEVEL SECURITY;

-- 4. 학원 및 활동 장소 관리
CREATE TABLE public.activity_places (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    place_name VARCHAR(100) NOT NULL,
    place_type VARCHAR(50),
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    contact_phone VARCHAR(20),
    notes TEXT,
    is_safe_zone BOOLEAN DEFAULT false,
    safe_zone_radius INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.activity_places ENABLE ROW LEVEL SECURITY;

-- 5. 자녀별 일정 관리
CREATE TYPE public.schedule_type AS ENUM ('academy', 'school', 'medical', 'activity', 'family', 'other');
CREATE TYPE public.schedule_status AS ENUM ('scheduled', 'in_progress', 'completed', 'missed', 'cancelled');

CREATE TABLE public.child_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE,
    place_id UUID REFERENCES public.activity_places(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    schedule_type public.schedule_type NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    recurring_pattern VARCHAR(50),
    reminder_settings JSONB DEFAULT '{"30min": true, "10min": true}',
    attendance_required BOOLEAN DEFAULT true,
    status public.schedule_status DEFAULT 'scheduled',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.child_schedules ENABLE ROW LEVEL SECURITY;

-- 6. 실시간 위치 추적 (Supabase Realtime 최적화)
CREATE TYPE public.location_status AS ENUM ('at_home', 'in_transit', 'at_destination', 'unknown', 'emergency');

CREATE TABLE public.location_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy_meters INTEGER,
    address TEXT,
    location_status public.location_status DEFAULT 'unknown',
    current_place_id UUID REFERENCES public.activity_places(id),
    battery_level INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.location_tracking ENABLE ROW LEVEL SECURITY;

-- 7. 메시지 및 알림 (MongoDB 대신 PostgreSQL 사용)
CREATE TYPE public.message_type AS ENUM ('schedule_reminder', 'location_alert', 'emergency', 'family_message', 'auto_response');
CREATE TYPE public.message_channel AS ENUM ('kakao', 'sms', 'push', 'in_app');
CREATE TYPE public.message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

CREATE TABLE public.family_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.family_members(id),
    recipient_ids UUID[] NOT NULL,
    message_type public.message_type NOT NULL,
    channel public.message_channel NOT NULL,
    subject VARCHAR(200),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    status public.message_status DEFAULT 'pending',
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.family_messages ENABLE ROW LEVEL SECURITY;

-- 8. 권한 관리
CREATE TABLE public.member_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE,
    permission_scope VARCHAR(50) NOT NULL,
    target_member_id UUID REFERENCES public.family_members(id),
    granted_by UUID REFERENCES public.family_members(id),
    is_granted BOOLEAN DEFAULT true,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.member_permissions ENABLE ROW LEVEL SECURITY;

-- 9. 알림 설정
CREATE TABLE public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    channel public.message_channel NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    frequency_limit INTEGER DEFAULT 10,
    custom_settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Row Level Security 정책 설정
-- 가족 구성원만 자신의 가족 데이터에 접근 가능

-- 가족 테이블 정책
CREATE POLICY "Users can view their own family" ON public.families FOR SELECT
    USING (id IN (
        SELECT family_id FROM public.family_members 
        WHERE user_id = auth.uid()
    ));

-- 가족 구성원 테이블 정책
CREATE POLICY "Users can view family members" ON public.family_members FOR SELECT
    USING (family_id IN (
        SELECT family_id FROM public.family_members 
        WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update their own profile" ON public.family_members FOR UPDATE
    USING (user_id = auth.uid());

-- 일정 테이블 정책
CREATE POLICY "Users can view family schedules" ON public.child_schedules FOR SELECT
    USING (child_member_id IN (
        SELECT id FROM public.family_members 
        WHERE family_id IN (
            SELECT family_id FROM public.family_members 
            WHERE user_id = auth.uid()
        )
    ));

-- 메시지 테이블 정책
CREATE POLICY "Users can view family messages" ON public.family_messages FOR SELECT
    USING (family_id IN (
        SELECT family_id FROM public.family_members 
        WHERE user_id = auth.uid()
    ));

-- 인덱스 생성 (성능 최적화)
CREATE INDEX idx_family_members_family_id ON public.family_members(family_id);
CREATE INDEX idx_family_members_user_id ON public.family_members(user_id);
CREATE INDEX idx_child_schedules_child_member_id ON public.child_schedules(child_member_id);
CREATE INDEX idx_child_schedules_start_time ON public.child_schedules(start_time);
CREATE INDEX idx_location_tracking_member_id ON public.location_tracking(member_id);
CREATE INDEX idx_location_tracking_timestamp ON public.location_tracking(timestamp);
CREATE INDEX idx_family_messages_family_id ON public.family_messages(family_id);
CREATE INDEX idx_family_messages_recipient_ids ON public.family_messages USING GIN(recipient_ids);

-- 실시간 구독을 위한 테이블 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE public.family_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE public.child_schedules;

-- 자동 업데이트 타임스탬프 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
CREATE TRIGGER update_families_updated_at BEFORE UPDATE ON public.families
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_members_updated_at BEFORE UPDATE ON public.family_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_children_profiles_updated_at BEFORE UPDATE ON public.children_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activity_places_updated_at BEFORE UPDATE ON public.activity_places
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_child_schedules_updated_at BEFORE UPDATE ON public.child_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();