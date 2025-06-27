import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

interface Database {
  public: {
    Tables: {
      families: {
        Row: {
          id: string;
          family_name: string;
          family_code: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_name: string;
          family_code?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          family_name?: string;
          family_code?: string;
          timezone?: string;
          updated_at?: string;
        };
      };
      family_members: {
        Row: {
          id: string;
          family_id: string;
          user_id: string | null;
          name: string;
          nickname: string | null;
          member_role: 'parent_admin' | 'parent' | 'child' | 'guardian' | 'observer';
          member_type: 'father' | 'mother' | 'son' | 'daughter' | 'grandfather' | 'grandmother' | 'other';
          birth_date: string | null;
          phone_number: string | null;
          emergency_contact: string | null;
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          user_id?: string | null;
          name: string;
          nickname?: string | null;
          member_role: 'parent_admin' | 'parent' | 'child' | 'guardian' | 'observer';
          member_type: 'father' | 'mother' | 'son' | 'daughter' | 'grandfather' | 'grandmother' | 'other';
          birth_date?: string | null;
          phone_number?: string | null;
          emergency_contact?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          family_id?: string;
          user_id?: string | null;
          name?: string;
          nickname?: string | null;
          member_role?: 'parent_admin' | 'parent' | 'child' | 'guardian' | 'observer';
          member_type?: 'father' | 'mother' | 'son' | 'daughter' | 'grandfather' | 'grandmother' | 'other';
          birth_date?: string | null;
          phone_number?: string | null;
          emergency_contact?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      family_messages: {
        Row: {
          id: string;
          family_id: string;
          sender_id: string | null;
          recipient_ids: string[];
          message_type: 'schedule_reminder' | 'location_alert' | 'emergency' | 'family_message' | 'auto_response';
          channel: 'kakao' | 'sms' | 'push' | 'in_app';
          subject: string | null;
          content: string;
          metadata: any;
          status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
          priority: string;
          scheduled_at: string | null;
          sent_at: string | null;
          delivered_at: string | null;
          read_at: string | null;
          failure_reason: string | null;
          retry_count: number;
          max_retries: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          sender_id?: string | null;
          recipient_ids: string[];
          message_type: 'schedule_reminder' | 'location_alert' | 'emergency' | 'family_message' | 'auto_response';
          channel: 'kakao' | 'sms' | 'push' | 'in_app';
          subject?: string | null;
          content: string;
          metadata?: any;
          status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
          priority?: string;
          scheduled_at?: string | null;
          retry_count?: number;
          max_retries?: number;
        };
        Update: {
          id?: string;
          family_id?: string;
          sender_id?: string | null;
          recipient_ids?: string[];
          message_type?: 'schedule_reminder' | 'location_alert' | 'emergency' | 'family_message' | 'auto_response';
          channel?: 'kakao' | 'sms' | 'push' | 'in_app';
          subject?: string | null;
          content?: string;
          metadata?: any;
          status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
          priority?: string;
          scheduled_at?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          read_at?: string | null;
          failure_reason?: string | null;
          retry_count?: number;
          max_retries?: number;
        };
      };
      child_schedules: {
        Row: {
          id: string;
          child_member_id: string;
          place_id: string | null;
          title: string;
          description: string | null;
          schedule_type: 'academy' | 'school' | 'medical' | 'activity' | 'family' | 'other';
          start_time: string;
          end_time: string;
          recurring_pattern: string | null;
          reminder_settings: any;
          attendance_required: boolean;
          status: 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          child_member_id: string;
          place_id?: string | null;
          title: string;
          description?: string | null;
          schedule_type: 'academy' | 'school' | 'medical' | 'activity' | 'family' | 'other';
          start_time: string;
          end_time: string;
          recurring_pattern?: string | null;
          reminder_settings?: any;
          attendance_required?: boolean;
          status?: 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
        };
        Update: {
          id?: string;
          child_member_id?: string;
          place_id?: string | null;
          title?: string;
          description?: string | null;
          schedule_type?: 'academy' | 'school' | 'medical' | 'activity' | 'family' | 'other';
          start_time?: string;
          end_time?: string;
          recurring_pattern?: string | null;
          reminder_settings?: any;
          attendance_required?: boolean;
          status?: 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
          updated_at?: string;
        };
      };
      activity_places: {
        Row: {
          id: string;
          family_id: string;
          place_name: string;
          place_type: string | null;
          address: string;
          latitude: number | null;
          longitude: number | null;
          contact_phone: string | null;
          notes: string | null;
          is_safe_zone: boolean;
          safe_zone_radius: number;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
}

export class SupabaseConfig {
  private static instance: SupabaseConfig;
  private supabase: any;

  private constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and Key are required');
    }

    this.supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false // 서버 사이드에서는 세션 저장 안함
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });

    logger.info('Supabase client initialized');
  }

  static getInstance(): SupabaseConfig {
    if (!SupabaseConfig.instance) {
      SupabaseConfig.instance = new SupabaseConfig();
    }
    return SupabaseConfig.instance;
  }

  getClient() {
    return this.supabase;
  }

  // 메시지 관련 헬퍼 메서드들
  async insertMessage(message: Database['public']['Tables']['family_messages']['Insert']) {
    try {
      const { data, error } = await this.supabase
        .from('family_messages')
        .insert(message)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Failed to insert message:', error);
      throw error;
    }
  }

  async updateMessageStatus(
    messageId: string, 
    status: 'sent' | 'delivered' | 'read' | 'failed',
    additionalData?: Partial<Database['public']['Tables']['family_messages']['Update']>
  ) {
    try {
      const updateData: any = { 
        status,
        ...additionalData
      };

      // 상태별 타임스탬프 설정
      switch (status) {
        case 'sent':
          updateData.sent_at = new Date().toISOString();
          break;
        case 'delivered':
          updateData.delivered_at = new Date().toISOString();
          break;
        case 'read':
          updateData.read_at = new Date().toISOString();
          break;
      }

      const { data, error } = await this.supabase
        .from('family_messages')
        .update(updateData)
        .eq('id', messageId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Failed to update message status:', error);
      throw error;
    }
  }

  async getMessageHistory(familyId: string, limit: number = 50, offset: number = 0) {
    try {
      const { data, error } = await this.supabase
        .from('family_messages')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Failed to get message history:', error);
      throw error;
    }
  }

  async getScheduledMessages() {
    try {
      const { data, error } = await this.supabase
        .from('family_messages')
        .select('*')
        .eq('status', 'pending')
        .not('scheduled_at', 'is', null)
        .lte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Failed to get scheduled messages:', error);
      throw error;
    }
  }

  async getFamilyMembers(familyId: string) {
    try {
      const { data, error } = await this.supabase
        .from('family_members')
        .select('*')
        .eq('family_id', familyId)
        .eq('is_active', true);

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Failed to get family members:', error);
      throw error;
    }
  }

  async getChildSchedules(childId: string, startDate?: string, endDate?: string) {
    try {
      let query = this.supabase
        .from('child_schedules')
        .select(`
          *,
          activity_places:place_id (
            place_name,
            address,
            latitude,
            longitude,
            is_safe_zone
          )
        `)
        .eq('child_member_id', childId);

      if (startDate) {
        query = query.gte('start_time', startDate);
      }

      if (endDate) {
        query = query.lte('start_time', endDate);
      }

      const { data, error } = await query.order('start_time', { ascending: true });

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Failed to get child schedules:', error);
      throw error;
    }
  }

  // 실시간 구독 설정
  subscribeToMessages(familyId: string, callback: (payload: any) => void) {
    return this.supabase
      .channel(`family_messages:${familyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'family_messages',
          filter: `family_id=eq.${familyId}`
        },
        callback
      )
      .subscribe();
  }

  subscribeToSchedules(childId: string, callback: (payload: any) => void) {
    return this.supabase
      .channel(`child_schedules:${childId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'child_schedules',
          filter: `child_member_id=eq.${childId}`
        },
        callback
      )
      .subscribe();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('families')
        .select('count')
        .limit(1)
        .single();

      return !error;
    } catch (error) {
      logger.error('Supabase health check failed:', error);
      return false;
    }
  }
}

export const supabase = SupabaseConfig.getInstance().getClient();