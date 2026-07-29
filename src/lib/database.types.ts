export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      candidate_invites: {
        Row: {
          candidate_email: string
          candidate_name: string | null
          completed_at: string | null
          created_at: string | null
          email_sent_at: string | null
          evaluation: Json | null
          id: string
          interview_link: string
          role_id: string
          role_title: string
          status: string | null
        }
        Insert: {
          candidate_email: string
          candidate_name?: string | null
          completed_at?: string | null
          created_at?: string | null
          email_sent_at?: string | null
          evaluation?: Json | null
          id: string
          interview_link: string
          role_id: string
          role_title: string
          status?: string | null
        }
        Update: {
          candidate_email?: string
          candidate_name?: string | null
          completed_at?: string | null
          created_at?: string | null
          email_sent_at?: string | null
          evaluation?: Json | null
          id?: string
          interview_link?: string
          role_id?: string
          role_title?: string
          status?: string | null
        }
        Relationships: []
      }
      candidate_results: {
        Row: {
          candidate_email: string | null
          candidate_linkedin: string | null
          candidate_name: string
          candidate_phone: string | null
          created_at: string | null
          date: number
          duration: number | null
          evaluation: Json | null
          id: string
          org_id: string | null
          role_id: string
          role_title: string
          source: string | null
          status: string | null
          transcript: Json | null
          video_url: string | null
        }
        Insert: {
          candidate_email?: string | null
          candidate_linkedin?: string | null
          candidate_name: string
          candidate_phone?: string | null
          created_at?: string | null
          date: number
          duration?: number | null
          evaluation?: Json | null
          id: string
          org_id?: string | null
          role_id: string
          role_title: string
          source?: string | null
          status?: string | null
          transcript?: Json | null
          video_url?: string | null
        }
        Update: {
          candidate_email?: string | null
          candidate_linkedin?: string | null
          candidate_name?: string
          candidate_phone?: string | null
          created_at?: string | null
          date?: number
          duration?: number | null
          evaluation?: Json | null
          id?: string
          org_id?: string | null
          role_id?: string
          role_title?: string
          source?: string | null
          status?: string | null
          transcript?: Json | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_results_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          org_id: string | null
          phone: string | null
          role_id: string | null
          source: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          org_id?: string | null
          phone?: string | null
          role_id?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          org_id?: string | null
          phone?: string | null
          role_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          org_id: string
          read: boolean | null
          session_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          org_id: string
          read?: boolean | null
          session_id?: string | null
          title?: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          org_id?: string
          read?: boolean | null
          session_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "info_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_settings: {
        Row: {
          accent_color: string | null
          additional_emails: string[] | null
          assistant_name: string | null
          auto_notify_on_investment: boolean | null
          conversation_tone: string | null
          created_at: string | null
          custom_instructions: string | null
          default_closing_mode: string | null
          default_session_duration: number | null
          email_daily_summary: boolean | null
          email_on_closing: boolean | null
          email_on_new_lead: boolean | null
          email_on_objection: boolean | null
          id: string
          integrations: Json | null
          notification_sound: boolean | null
          org_id: string
          public_welcome_message: string | null
          sales_persistence: number | null
          session_language: string | null
          show_org_name: boolean | null
          updated_at: string | null
          welcome_message: string | null
        }
        Insert: {
          accent_color?: string | null
          additional_emails?: string[] | null
          assistant_name?: string | null
          auto_notify_on_investment?: boolean | null
          conversation_tone?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          default_closing_mode?: string | null
          default_session_duration?: number | null
          email_daily_summary?: boolean | null
          email_on_closing?: boolean | null
          email_on_new_lead?: boolean | null
          email_on_objection?: boolean | null
          id?: string
          integrations?: Json | null
          notification_sound?: boolean | null
          org_id: string
          public_welcome_message?: string | null
          sales_persistence?: number | null
          session_language?: string | null
          show_org_name?: boolean | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Update: {
          accent_color?: string | null
          additional_emails?: string[] | null
          assistant_name?: string | null
          auto_notify_on_investment?: boolean | null
          conversation_tone?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          default_closing_mode?: string | null
          default_session_duration?: number | null
          email_daily_summary?: boolean | null
          email_on_closing?: boolean | null
          email_on_new_lead?: boolean | null
          email_on_objection?: boolean | null
          id?: string
          integrations?: Json | null
          notification_sound?: boolean | null
          org_id?: string
          public_welcome_message?: string | null
          sales_persistence?: number | null
          session_language?: string | null
          show_org_name?: boolean | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          addressee_id: string
          created_at: string | null
          id: string
          requester_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          addressee_id: string
          created_at?: string | null
          id?: string
          requester_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          addressee_id?: string
          created_at?: string | null
          id?: string
          requester_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          last_message_at: string | null
          participant_ids: string[]
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          participant_ids: string[]
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          participant_ids?: string[]
        }
        Relationships: []
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string | null
          description: string | null
          id: string
          order_index: number
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_plans: {
        Row: {
          course_id: string
          created_at: string | null
          currency: string | null
          features: string[] | null
          id: string
          is_recommended: boolean | null
          name: string
          order_index: number
          price: number
        }
        Insert: {
          course_id: string
          created_at?: string | null
          currency?: string | null
          features?: string[] | null
          id?: string
          is_recommended?: boolean | null
          name: string
          order_index?: number
          price?: number
        }
        Update: {
          course_id?: string
          created_at?: string | null
          currency?: string | null
          features?: string[] | null
          id?: string
          is_recommended?: boolean | null
          name?: string
          order_index?: number
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_plans_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          ai_overrides: Json | null
          benefits: string[] | null
          created_at: string | null
          description: string
          duration_info: string | null
          id: string
          is_active: boolean | null
          modality: string | null
          name: string
          objection_responses: Json | null
          objectives: string[] | null
          org_id: string
          session_duration: number | null
          target_audience: string | null
          testimonials: string[] | null
          topics: Json | null
          updated_at: string | null
          urgency_hooks: string[] | null
        }
        Insert: {
          ai_overrides?: Json | null
          benefits?: string[] | null
          created_at?: string | null
          description?: string
          duration_info?: string | null
          id?: string
          is_active?: boolean | null
          modality?: string | null
          name: string
          objection_responses?: Json | null
          objectives?: string[] | null
          org_id: string
          session_duration?: number | null
          target_audience?: string | null
          testimonials?: string[] | null
          topics?: Json | null
          updated_at?: string | null
          urgency_hooks?: string[] | null
        }
        Update: {
          ai_overrides?: Json | null
          benefits?: string[] | null
          created_at?: string | null
          description?: string
          duration_info?: string | null
          id?: string
          is_active?: boolean | null
          modality?: string | null
          name?: string
          objection_responses?: Json | null
          objectives?: string[] | null
          org_id?: string
          session_duration?: number | null
          target_audience?: string | null
          testimonials?: string[] | null
          topics?: Json | null
          updated_at?: string | null
          urgency_hooks?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      info_sessions: {
        Row: {
          client_age: number | null
          client_email: string | null
          client_name: string | null
          client_occupation: string | null
          client_phone: string | null
          closing_mode: string | null
          coach_notified: boolean | null
          conversion_result: string | null
          course_for: string | null
          course_id: string
          created_at: string | null
          id: string
          objections_detected: Json | null
          org_id: string
          session_metadata: Json | null
          status: string
          transcript: Json | null
          updated_at: string | null
        }
        Insert: {
          client_age?: number | null
          client_email?: string | null
          client_name?: string | null
          client_occupation?: string | null
          client_phone?: string | null
          closing_mode?: string | null
          coach_notified?: boolean | null
          conversion_result?: string | null
          course_for?: string | null
          course_id: string
          created_at?: string | null
          id?: string
          objections_detected?: Json | null
          org_id: string
          session_metadata?: Json | null
          status?: string
          transcript?: Json | null
          updated_at?: string | null
        }
        Update: {
          client_age?: number | null
          client_email?: string | null
          client_name?: string | null
          client_occupation?: string | null
          client_phone?: string | null
          closing_mode?: string | null
          coach_notified?: boolean | null
          conversion_result?: string | null
          course_for?: string | null
          course_id?: string
          created_at?: string | null
          id?: string
          objections_detected?: Json | null
          org_id?: string
          session_metadata?: Json | null
          status?: string
          transcript?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "info_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "info_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_telemetry: {
        Row: {
          candidate_name: string | null
          completion_tokens: number | null
          created_at: string
          duration_ms: number | null
          error_text: string | null
          id: string
          model: string
          prompt_text: string | null
          prompt_tokens: number | null
          raw_payload: Json | null
          reasoning_text: string | null
          reasoning_tokens: number | null
          response_text: string | null
          role_title: string | null
          session_id: string
          total_tokens: number | null
          turn_index: number
        }
        Insert: {
          candidate_name?: string | null
          completion_tokens?: number | null
          created_at?: string
          duration_ms?: number | null
          error_text?: string | null
          id?: string
          model: string
          prompt_text?: string | null
          prompt_tokens?: number | null
          raw_payload?: Json | null
          reasoning_text?: string | null
          reasoning_tokens?: number | null
          response_text?: string | null
          role_title?: string | null
          session_id: string
          total_tokens?: number | null
          turn_index: number
        }
        Update: {
          candidate_name?: string | null
          completion_tokens?: number | null
          created_at?: string
          duration_ms?: number | null
          error_text?: string | null
          id?: string
          model?: string
          prompt_text?: string | null
          prompt_tokens?: number | null
          raw_payload?: Json | null
          reasoning_text?: string | null
          reasoning_tokens?: number | null
          response_text?: string | null
          role_title?: string | null
          session_id?: string
          total_tokens?: number | null
          turn_index?: number
        }
        Relationships: []
      }
      interview_tickets: {
        Row: {
          candidate_name: string
          created_at: number
          expires_at: number
          id: string
          language: string | null
          org_id: string | null
          role_id: string
          token: string
          used: boolean | null
        }
        Insert: {
          candidate_name: string
          created_at: number
          expires_at: number
          id: string
          language?: string | null
          org_id?: string | null
          role_id: string
          token: string
          used?: boolean | null
        }
        Update: {
          candidate_name?: string
          created_at?: number
          expires_at?: number
          id?: string
          language?: string | null
          org_id?: string | null
          role_id?: string
          token?: string
          used?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          candidate_id: string | null
          created_at: string | null
          duration: number | null
          evaluation: Json | null
          id: string
          org_id: string | null
          status: string | null
          transcript: Json | null
          video_url: string | null
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string | null
          duration?: number | null
          evaluation?: Json | null
          id?: string
          org_id?: string | null
          status?: string | null
          transcript?: Json | null
          video_url?: string | null
        }
        Update: {
          candidate_id?: string | null
          created_at?: string | null
          duration?: number | null
          evaluation?: Json | null
          id?: string
          org_id?: string | null
          status?: string | null
          transcript?: Json | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_interval: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          max_interviews_per_month: number | null
          name: string
          plan: string | null
          plan_tier: string
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          subscription_status: string
        }
        Insert: {
          billing_interval?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          max_interviews_per_month?: number | null
          name: string
          plan?: string | null
          plan_tier?: string
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string
        }
        Update: {
          billing_interval?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          max_interviews_per_month?: number | null
          name?: string
          plan?: string | null
          plan_tier?: string
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          parent_id: string | null
          post_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          parent_id?: string | null
          post_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          parent_id?: string | null
          post_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          reaction_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          reaction_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          reaction_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          comments_count: number | null
          content: string
          created_at: string | null
          id: string
          image_url: string | null
          likes_count: number | null
          media_urls: string[] | null
          post_type: string | null
          shares_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comments_count?: number | null
          content: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          likes_count?: number | null
          media_urls?: string[] | null
          post_type?: string | null
          shares_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comments_count?: number | null
          content?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          likes_count?: number | null
          media_urls?: string[] | null
          post_type?: string | null
          shares_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          certifications: Json | null
          connections_count: number | null
          created_at: string | null
          education: Json | null
          experience: Json | null
          full_name: string
          headline: string | null
          id: string
          is_open_to_work: boolean | null
          is_public: boolean | null
          languages: Json | null
          location: string | null
          profile_views: number | null
          public_email: boolean | null
          search_vector: unknown
          skills: string[] | null
          updated_at: string | null
          user_id: string
          user_type: string | null
          username: string
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          certifications?: Json | null
          connections_count?: number | null
          created_at?: string | null
          education?: Json | null
          experience?: Json | null
          full_name: string
          headline?: string | null
          id?: string
          is_open_to_work?: boolean | null
          is_public?: boolean | null
          languages?: Json | null
          location?: string | null
          profile_views?: number | null
          public_email?: boolean | null
          search_vector?: unknown
          skills?: string[] | null
          updated_at?: string | null
          user_id: string
          user_type?: string | null
          username: string
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          certifications?: Json | null
          connections_count?: number | null
          created_at?: string | null
          education?: Json | null
          experience?: Json | null
          full_name?: string
          headline?: string | null
          id?: string
          is_open_to_work?: boolean | null
          is_public?: boolean | null
          languages?: Json | null
          location?: string | null
          profile_views?: number | null
          public_email?: boolean | null
          search_vector?: unknown
          skills?: string[] | null
          updated_at?: string | null
          user_id?: string
          user_type?: string | null
          username?: string
          website_url?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          interview_duration: number | null
          interview_mode: string
          is_published: boolean | null
          job_type: string | null
          location: string | null
          org_id: string | null
          public_token: string | null
          published_at: string | null
          salary: string | null
          search_vector: unknown
          title: string
          topics: Json | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          interview_duration?: number | null
          interview_mode?: string
          is_published?: boolean | null
          job_type?: string | null
          location?: string | null
          org_id?: string | null
          public_token?: string | null
          published_at?: string | null
          salary?: string | null
          search_vector?: unknown
          title: string
          topics?: Json | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          interview_duration?: number | null
          interview_mode?: string
          is_published?: boolean | null
          job_type?: string | null
          location?: string | null
          org_id?: string | null
          public_token?: string | null
          published_at?: string | null
          salary?: string | null
          search_vector?: unknown
          title?: string
          topics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          org_id: string
          role: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          org_id: string
          role?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_access_sessions: {
        Row: {
          created_at: string
          employee_id: string
          expires_at: string
          id: string
          last_seen_at: string
          revoked_at: string | null
          session_token_hash: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          expires_at: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          session_token_hash: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          expires_at?: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          session_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_access_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "training_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      training_document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          id: string
          metadata: Json
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          id?: string
          metadata?: Json
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "training_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "training_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      training_documents: {
        Row: {
          ai_summary: string | null
          ai_topics: Json | null
          checksum_sha256: string | null
          created_at: string | null
          extracted_text: string | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string | null
          id: string
          org_id: string
          processing_error: string | null
          program_id: string | null
          role_id: string | null
          scope: string
          sort_order: number | null
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          ai_topics?: Json | null
          checksum_sha256?: string | null
          created_at?: string | null
          extracted_text?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url?: string | null
          id?: string
          org_id: string
          processing_error?: string | null
          program_id?: string | null
          role_id?: string | null
          scope?: string
          sort_order?: number | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          ai_topics?: Json | null
          checksum_sha256?: string | null
          created_at?: string | null
          extracted_text?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string | null
          id?: string
          org_id?: string
          processing_error?: string | null
          program_id?: string | null
          role_id?: string | null
          scope?: string
          sort_order?: number | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_documents_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_documents_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_employees: {
        Row: {
          access_expires_at: string | null
          access_revoked_at: string | null
          access_token_hash: string | null
          candidate_result_id: string | null
          completed_at: string | null
          created_at: string | null
          email: string
          hired_at: string | null
          id: string
          interview_data: Json | null
          name: string
          org_id: string
          overall_progress: number | null
          overall_score: number | null
          personalization_notes: Json | null
          program_id: string
          role_id: string | null
          role_title: string | null
          started_at: string | null
          status: string | null
          token: string | null
          user_id: string | null
        }
        Insert: {
          access_expires_at?: string | null
          access_revoked_at?: string | null
          access_token_hash?: string | null
          candidate_result_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          email: string
          hired_at?: string | null
          id?: string
          interview_data?: Json | null
          name: string
          org_id: string
          overall_progress?: number | null
          overall_score?: number | null
          personalization_notes?: Json | null
          program_id: string
          role_id?: string | null
          role_title?: string | null
          started_at?: string | null
          status?: string | null
          token?: string | null
          user_id?: string | null
        }
        Update: {
          access_expires_at?: string | null
          access_revoked_at?: string | null
          access_token_hash?: string | null
          candidate_result_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          email?: string
          hired_at?: string | null
          id?: string
          interview_data?: Json | null
          name?: string
          org_id?: string
          overall_progress?: number | null
          overall_score?: number | null
          personalization_notes?: Json | null
          program_id?: string
          role_id?: string | null
          role_title?: string | null
          started_at?: string | null
          status?: string | null
          token?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_employees_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_employees_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_evaluations: {
        Row: {
          answers: Json
          attempts: number | null
          employee_id: string
          evaluated_at: string | null
          id: string
          module_id: string
          passed: boolean | null
          questions: Json
          score: number | null
        }
        Insert: {
          answers?: Json
          attempts?: number | null
          employee_id: string
          evaluated_at?: string | null
          id?: string
          module_id: string
          passed?: boolean | null
          questions?: Json
          score?: number | null
        }
        Update: {
          answers?: Json
          attempts?: number | null
          employee_id?: string
          evaluated_at?: string | null
          id?: string
          module_id?: string
          passed?: boolean | null
          questions?: Json
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_evaluations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "training_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_evaluations_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_module_documents: {
        Row: {
          document_id: string
          module_id: string
        }
        Insert: {
          document_id: string
          module_id: string
        }
        Update: {
          document_id?: string
          module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_module_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "training_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_module_documents_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          content: Json | null
          created_at: string | null
          description: string | null
          duration_estimate: number | null
          evaluation_enabled: boolean | null
          evaluation_questions: Json | null
          id: string
          program_id: string
          sort_order: number | null
          source_document_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          description?: string | null
          duration_estimate?: number | null
          evaluation_enabled?: boolean | null
          evaluation_questions?: Json | null
          id?: string
          program_id: string
          sort_order?: number | null
          source_document_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          description?: string | null
          duration_estimate?: number | null
          evaluation_enabled?: boolean | null
          evaluation_questions?: Json | null
          id?: string
          program_id?: string
          sort_order?: number | null
          source_document_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_modules_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_modules_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "training_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      training_program_documents: {
        Row: {
          created_at: string
          document_id: string
          program_id: string
          required: boolean
          sort_order: number
        }
        Insert: {
          created_at?: string
          document_id: string
          program_id: string
          required?: boolean
          sort_order?: number
        }
        Update: {
          created_at?: string
          document_id?: string
          program_id?: string
          required?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_program_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "training_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_program_documents_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_programs: {
        Row: {
          ai_personality: string | null
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          org_id: string
          passing_score: number
          published_at: string | null
          role_id: string | null
          status: string
          title: string
          updated_at: string | null
          version: number
          welcome_message: string | null
        }
        Insert: {
          ai_personality?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          org_id: string
          passing_score?: number
          published_at?: string | null
          role_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
          version?: number
          welcome_message?: string | null
        }
        Update: {
          ai_personality?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          org_id?: string
          passing_score?: number
          published_at?: string | null
          role_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          version?: number
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_programs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_programs_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_progress: {
        Row: {
          ai_feedback: string | null
          completed_at: string | null
          created_at: string | null
          employee_id: string
          id: string
          module_id: string
          score: number | null
          started_at: string | null
          status: string | null
          time_spent: number | null
        }
        Insert: {
          ai_feedback?: string | null
          completed_at?: string | null
          created_at?: string | null
          employee_id: string
          id?: string
          module_id: string
          score?: number | null
          started_at?: string | null
          status?: string | null
          time_spent?: number | null
        }
        Update: {
          ai_feedback?: string | null
          completed_at?: string | null
          created_at?: string | null
          employee_id?: string
          id?: string
          module_id?: string
          score?: number | null
          started_at?: string | null
          status?: string | null
          time_spent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "training_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          employee_id: string
          ended_at: string | null
          id: string
          messages: Json
          module_id: string | null
          session_type: string | null
          started_at: string | null
        }
        Insert: {
          employee_id: string
          ended_at?: string | null
          id?: string
          messages?: Json
          module_id?: string | null
          session_type?: string | null
          started_at?: string | null
        }
        Update: {
          employee_id?: string
          ended_at?: string | null
          id?: string
          messages?: Json
          module_id?: string | null
          session_type?: string | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "training_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          onboarding_completed: boolean | null
          org_id: string | null
          role: string | null
          user_id: string
          user_type: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          onboarding_completed?: boolean | null
          org_id?: string | null
          role?: string | null
          user_id: string
          user_type?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          onboarding_completed?: boolean | null
          org_id?: string | null
          role?: string | null
          user_id?: string
          user_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_configs: {
        Row: {
          created_at: string | null
          id: string
          org_id: string | null
          updated_at: string | null
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id?: string | null
          updated_at?: string | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string | null
          updated_at?: string | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_training_session_messages: {
        Args: { p_employee_id: string; p_messages: Json; p_session_id: string }
        Returns: Json
      }
      calculate_training_progress: {
        Args: { p_employee_id: string }
        Returns: number
      }
      complete_training_module_without_evaluation: {
        Args: { p_employee_id: string; p_module_id: string }
        Returns: Json
      }
      create_training_program: {
        Args: {
          p_actor_user_id: string
          p_ai_personality: string
          p_description: string
          p_role_id: string
          p_title: string
          p_welcome_message: string
        }
        Returns: string
      }
      create_training_program_version: {
        Args: { p_actor_user_id: string; p_source_program_id: string }
        Returns: string
      }
      detach_training_program_document: {
        Args: {
          p_actor_user_id: string
          p_document_id: string
          p_program_id: string
        }
        Returns: undefined
      }
      finalize_training_evaluation: {
        Args: {
          p_answers: Json
          p_employee_id: string
          p_feedback: string
          p_module_id: string
          p_questions: Json
          p_score: number
        }
        Returns: Json
      }
      hire_training_candidate: {
        Args: {
          p_access_expires_at: string
          p_access_token_hash: string
          p_actor_user_id: string
          p_candidate_result_id: string
          p_program_id: string
        }
        Returns: string
      }
      increment_training_time: {
        Args: {
          p_employee_id: string
          p_minutes_delta: number
          p_module_id: string
        }
        Returns: number
      }
      is_training_admin: { Args: { p_org_id: string }; Returns: boolean }
      publish_training_program: {
        Args: { p_actor_user_id: string; p_program_id: string }
        Returns: string
      }
      replace_training_modules: {
        Args: { p_actor_user_id: string; p_modules: Json; p_program_id: string }
        Returns: Json
      }
      start_training_module: {
        Args: { p_employee_id: string; p_module_id: string }
        Returns: Json
      }
      update_org_subscription: {
        Args: {
          p_billing_interval?: string
          p_lookup_by_customer?: string
          p_lookup_by_subscription?: string
          p_org_id?: string
          p_plan_tier?: string
          p_stripe_customer_id?: string
          p_stripe_subscription_id?: string
          p_subscription_period_end?: string
          p_subscription_status?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
