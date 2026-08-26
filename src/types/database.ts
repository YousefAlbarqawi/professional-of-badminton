export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      announcements: {
        Row: {
          author_id: string
          body: string
          id: string
          is_deleted: boolean
          language: string
          published_at: string
          push_sent_at: string | null
        }
        Insert: {
          author_id: string
          body: string
          id?: string
          is_deleted?: boolean
          language: string
          published_at?: string
          push_sent_at?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          id?: string
          is_deleted?: boolean
          language?: string
          published_at?: string
          push_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_entries: {
        Row: {
          amount_fils: number
          booking_id: string | null
          created_at: string
          created_by: string
          id: string
          note: string | null
          player_id: string
          session_id: string | null
        }
        Insert: {
          amount_fils: number
          booking_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          player_id: string
          session_id?: string | null
        }
        Update: {
          amount_fils?: number
          booking_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          player_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "balance_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_financials"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "balance_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_occupancy"
            referencedColumns: ["session_id"]
          },
        ]
      }
      bookings: {
        Row: {
          attendee_kind: Database["public"]["Enums"]["attendee_kind"]
          booked_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          created_by: string | null
          credit_txn_id: string | null
          expected_fils: number
          guest_name: string | null
          guest_tier: Database["public"]["Enums"]["tier"] | null
          id: string
          is_coach_slot: boolean
          note: string | null
          paid_fils: number
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          player_id: string | null
          session_id: string
          settled_at: string | null
          source: Database["public"]["Enums"]["booking_source"]
          status: Database["public"]["Enums"]["booking_status"]
          tier_snapshot: Database["public"]["Enums"]["tier"] | null
        }
        Insert: {
          attendee_kind: Database["public"]["Enums"]["attendee_kind"]
          booked_at?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_by?: string | null
          credit_txn_id?: string | null
          expected_fils: number
          guest_name?: string | null
          guest_tier?: Database["public"]["Enums"]["tier"] | null
          id?: string
          is_coach_slot?: boolean
          note?: string | null
          paid_fils?: number
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          player_id?: string | null
          session_id: string
          settled_at?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          tier_snapshot?: Database["public"]["Enums"]["tier"] | null
        }
        Update: {
          attendee_kind?: Database["public"]["Enums"]["attendee_kind"]
          booked_at?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_by?: string | null
          credit_txn_id?: string | null
          expected_fils?: number
          guest_name?: string | null
          guest_tier?: Database["public"]["Enums"]["tier"] | null
          id?: string
          is_coach_slot?: boolean
          note?: string | null
          paid_fils?: number
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          player_id?: string | null
          session_id?: string
          settled_at?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          tier_snapshot?: Database["public"]["Enums"]["tier"] | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_financials"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_occupancy"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "fk_booking_credit_txn"
            columns: ["credit_txn_id"]
            isOneToOne: false
            referencedRelation: "credit_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_fee_rates: {
        Row: {
          created_at: string
          daily_fee_fils: number
          effective_from: string
          effective_to: string | null
          id: string
        }
        Insert: {
          created_at?: string
          daily_fee_fils: number
          effective_from: string
          effective_to?: string | null
          id?: string
        }
        Update: {
          created_at?: string
          daily_fee_fils?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
        }
        Relationships: []
      }
      consumable_costs: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          session_type: Database["public"]["Enums"]["session_type"]
          water_cost_fils: number
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          session_type: Database["public"]["Enums"]["session_type"]
          water_cost_fils: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          water_cost_fils?: number
        }
        Relationships: []
      }
      court_assignments: {
        Row: {
          booking_id: string
          court_number: number
          id: string
          is_locked: boolean
          rotation_id: string
          team: number
        }
        Insert: {
          booking_id: string
          court_number: number
          id?: string
          is_locked?: boolean
          rotation_id: string
          team: number
        }
        Update: {
          booking_id?: string
          court_number?: number
          id?: string
          is_locked?: boolean
          rotation_id?: string
          team?: number
        }
        Relationships: [
          {
            foreignKeyName: "court_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_assignments_rotation_id_fkey"
            columns: ["rotation_id"]
            isOneToOne: false
            referencedRelation: "rotations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          booking_id: string | null
          created_at: string
          created_by: string | null
          delta: number
          id: string
          note: string | null
          player_id: string
          reason: Database["public"]["Enums"]["credit_reason"]
          subscription_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          note?: string | null
          player_id: string
          reason: Database["public"]["Enums"]["credit_reason"]
          subscription_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          note?: string | null
          player_id?: string
          reason?: Database["public"]["Enums"]["credit_reason"]
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "player_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_player_credit_balance"
            referencedColumns: ["subscription_id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          locale: string
          platform: string
          player_id: string
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          locale?: string
          platform: string
          player_id: string
          token: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          locale?: string
          platform?: string
          player_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locked_courts: {
        Row: {
          booking_ids: string[]
          court_number: number
          created_at: string
          id: string
          session_id: string
        }
        Insert: {
          booking_ids: string[]
          court_number: number
          created_at?: string
          id?: string
          session_id: string
        }
        Update: {
          booking_ids?: string[]
          court_number?: number
          created_at?: string
          id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locked_courts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locked_courts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_financials"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "locked_courts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_occupancy"
            referencedColumns: ["session_id"]
          },
        ]
      }
      packages: {
        Row: {
          display_order: number
          duration_months: number
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          per_visit_fils: number | null
          price_fils: number
          visit_count: number
        }
        Insert: {
          display_order?: number
          duration_months: number
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          per_visit_fils?: number | null
          price_fils: number
          visit_count: number
        }
        Update: {
          display_order?: number
          duration_months?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          per_visit_fils?: number | null
          price_fils?: number
          visit_count?: number
        }
        Relationships: []
      }
      pairing_rules: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["pairing_rule_kind"]
          player_a_id: string
          player_b_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind: Database["public"]["Enums"]["pairing_rule_kind"]
          player_a_id: string
          player_b_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["public"]["Enums"]["pairing_rule_kind"]
          player_a_id?: string
          player_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pairing_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairing_rules_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairing_rules_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_proofs: {
        Row: {
          booking_id: string
          file_size_bytes: number
          id: string
          mime_type: string
          purge_after: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          booking_id: string
          file_size_bytes: number
          id?: string
          mime_type: string
          purge_after?: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          booking_id?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          purge_after?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      player_subscriptions: {
        Row: {
          created_at: string
          expires_on: string
          granted_by: string
          granted_visits: number
          id: string
          is_voided: boolean
          note: string | null
          package_id: string
          per_visit_fils: number
          player_id: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          expires_on: string
          granted_by: string
          granted_visits: number
          id?: string
          is_voided?: boolean
          note?: string | null
          package_id: string
          per_visit_fils: number
          player_id: string
          starts_on: string
        }
        Update: {
          created_at?: string
          expires_on?: string
          granted_by?: string
          granted_visits?: number
          id?: string
          is_voided?: boolean
          note?: string | null
          package_id?: string
          per_visit_fils?: number
          player_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_subscriptions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_subscriptions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          custom_rate_extended_fils: number | null
          custom_rate_standard_fils: number | null
          deleted_at: string | null
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          phone: string | null
          preferred_locale: string
          role: Database["public"]["Enums"]["user_role"]
          tier: Database["public"]["Enums"]["tier"] | null
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility_level"]
        }
        Insert: {
          created_at?: string
          custom_rate_extended_fils?: number | null
          custom_rate_standard_fils?: number | null
          deleted_at?: string | null
          first_name: string
          id: string
          is_active?: boolean
          last_name: string
          phone?: string | null
          preferred_locale?: string
          role?: Database["public"]["Enums"]["user_role"]
          tier?: Database["public"]["Enums"]["tier"] | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Update: {
          created_at?: string
          custom_rate_extended_fils?: number | null
          custom_rate_standard_fils?: number | null
          deleted_at?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          phone?: string | null
          preferred_locale?: string
          role?: Database["public"]["Enums"]["user_role"]
          tier?: Database["public"]["Enums"]["tier"] | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Relationships: []
      }
      push_deliveries: {
        Row: {
          checked_at: string | null
          error_code: string | null
          id: string
          job_id: string
          sent_at: string
          status: string
          ticket_id: string | null
          token: string
        }
        Insert: {
          checked_at?: string | null
          error_code?: string | null
          id?: string
          job_id: string
          sent_at?: string
          status: string
          ticket_id?: string | null
          token: string
        }
        Update: {
          checked_at?: string | null
          error_code?: string | null
          id?: string
          job_id?: string
          sent_at?: string
          status?: string
          ticket_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_deliveries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "push_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      push_jobs: {
        Row: {
          announcement_id: string | null
          attempts: number
          claimed_at: string | null
          created_at: string
          device_count: number
          id: string
          kind: Database["public"]["Enums"]["push_job_kind"]
          last_error: string | null
          payload: Json
          recipient_ids: string[] | null
          sent_at: string | null
          session_id: string | null
        }
        Insert: {
          announcement_id?: string | null
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          device_count?: number
          id?: string
          kind: Database["public"]["Enums"]["push_job_kind"]
          last_error?: string | null
          payload?: Json
          recipient_ids?: string[] | null
          sent_at?: string | null
          session_id?: string | null
        }
        Update: {
          announcement_id?: string | null
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          device_count?: number
          id?: string
          kind?: Database["public"]["Enums"]["push_job_kind"]
          last_error?: string | null
          payload?: Json
          recipient_ids?: string[] | null
          sent_at?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_jobs_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_financials"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "push_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_occupancy"
            referencedColumns: ["session_id"]
          },
        ]
      }
      rotation_sitouts: {
        Row: {
          booking_id: string
          id: string
          rotation_id: string
        }
        Insert: {
          booking_id: string
          id?: string
          rotation_id: string
        }
        Update: {
          booking_id?: string
          id?: string
          rotation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotation_sitouts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_sitouts_rotation_id_fkey"
            columns: ["rotation_id"]
            isOneToOne: false
            referencedRelation: "rotations"
            referencedColumns: ["id"]
          },
        ]
      }
      rotations: {
        Row: {
          generated_at: string
          id: string
          rotation_index: number
          rule: Database["public"]["Enums"]["rotation_rule"]
          session_id: string
        }
        Insert: {
          generated_at?: string
          id?: string
          rotation_index: number
          rule: Database["public"]["Enums"]["rotation_rule"]
          session_id: string
        }
        Update: {
          generated_at?: string
          id?: string
          rotation_index?: number
          rule?: Database["public"]["Enums"]["rotation_rule"]
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_financials"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "rotations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_occupancy"
            referencedColumns: ["session_id"]
          },
        ]
      }
      session_coaches: {
        Row: {
          added_by: string
          coach_id: string
          created_at: string
          fee_share_fils: number
          id: string
          is_paid: boolean
          night_key: string
          paid_at: string | null
          session_id: string
        }
        Insert: {
          added_by: string
          coach_id: string
          created_at?: string
          fee_share_fils?: number
          id?: string
          is_paid?: boolean
          night_key: string
          paid_at?: string | null
          session_id: string
        }
        Update: {
          added_by?: string
          coach_id?: string
          created_at?: string
          fee_share_fils?: number
          id?: string
          is_paid?: boolean
          night_key?: string
          paid_at?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_coaches_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_coaches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_coaches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_financials"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "session_coaches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_occupancy"
            referencedColumns: ["session_id"]
          },
        ]
      }
      session_instances: {
        Row: {
          assistant_coach_count: number
          cancellation_note: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity: number | null
          coach_fee_share_fils: number
          court_cost_share_fils: number
          court_count: number
          created_at: string
          ends_at: string
          has_manual_lineup: boolean
          id: string
          locked_at: string | null
          notes: string | null
          price_fils: number
          reviewed_at: string | null
          reviewed_by: string | null
          rotation_count: number
          session_date: string
          session_type: Database["public"]["Enums"]["session_type"]
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          template_id: string | null
          updated_at: string
          venue_id: string
          water_cost_fils: number
        }
        Insert: {
          assistant_coach_count?: number
          cancellation_note?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity?: number | null
          coach_fee_share_fils?: number
          court_cost_share_fils?: number
          court_count: number
          created_at?: string
          ends_at: string
          has_manual_lineup?: boolean
          id?: string
          locked_at?: string | null
          notes?: string | null
          price_fils: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          rotation_count: number
          session_date: string
          session_type: Database["public"]["Enums"]["session_type"]
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
          template_id?: string | null
          updated_at?: string
          venue_id: string
          water_cost_fils?: number
        }
        Update: {
          assistant_coach_count?: number
          cancellation_note?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity?: number | null
          coach_fee_share_fils?: number
          court_cost_share_fils?: number
          court_count?: number
          created_at?: string
          ends_at?: string
          has_manual_lineup?: boolean
          id?: string
          locked_at?: string | null
          notes?: string | null
          price_fils?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          rotation_count?: number
          session_date?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          template_id?: string | null
          updated_at?: string
          venue_id?: string
          water_cost_fils?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_instances_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_instances_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "session_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_instances_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      session_templates: {
        Row: {
          court_count: number
          created_at: string
          duration_minutes: number
          id: string
          is_active: boolean
          price_fils: number
          rotation_count: number
          session_type: Database["public"]["Enums"]["session_type"]
          start_time: string
          updated_at: string
          venue_id: string
          weekday: number
        }
        Insert: {
          court_count: number
          created_at?: string
          duration_minutes: number
          id?: string
          is_active?: boolean
          price_fils: number
          rotation_count: number
          session_type: Database["public"]["Enums"]["session_type"]
          start_time: string
          updated_at?: string
          venue_id: string
          weekday: number
        }
        Update: {
          court_count?: number
          created_at?: string
          duration_minutes?: number
          id?: string
          is_active?: boolean
          price_fils?: number
          rotation_count?: number
          session_type?: Database["public"]["Enums"]["session_type"]
          start_time?: string
          updated_at?: string
          venue_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_templates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_night_costs: {
        Row: {
          court_cost_fils: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          venue_id: string
          weekday: number
        }
        Insert: {
          court_cost_fils: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          venue_id: string
          weekday: number
        }
        Update: {
          court_cost_fils?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          venue_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_night_costs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          area_ar: string
          area_en: string
          court_count: number
          created_at: string
          display_order: number
          google_maps_url: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
        }
        Insert: {
          area_ar: string
          area_en: string
          court_count: number
          created_at?: string
          display_order?: number
          google_maps_url?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
        }
        Update: {
          area_ar?: string
          area_en?: string
          court_count?: number
          created_at?: string
          display_order?: number
          google_maps_url?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          id: string
          joined_at: string
          left_at: string | null
          notified_at: string | null
          player_id: string
          session_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          left_at?: string | null
          notified_at?: string | null
          player_id: string
          session_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          left_at?: string | null
          notified_at?: string | null
          player_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_financials"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "waitlist_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_occupancy"
            referencedColumns: ["session_id"]
          },
        ]
      }
    }
    Views: {
      v_player_credit_balance: {
        Row: {
          expires_on: string | null
          per_visit_fils: number | null
          player_id: string | null
          remaining: number | null
          subscription_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_subscriptions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_player_total_balance: {
        Row: {
          owed_fils: number | null
          player_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "balance_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_session_financials: {
        Row: {
          cash_revenue_fils: number | null
          cliq_revenue_fils: number | null
          cost_fils: number | null
          credit_revenue_fils: number | null
          outstanding_fils: number | null
          session_date: string | null
          session_id: string | null
          session_type: Database["public"]["Enums"]["session_type"] | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_instances_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      v_session_occupancy: {
        Row: {
          capacity: number | null
          remaining: number | null
          session_id: string | null
          taken: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_rotation: {
        Args: { p_session_id: string }
        Returns: number
      }
      adjust_credits: {
        Args: { p_delta: number; p_note: string; p_subscription_id: string }
        Returns: string
      }
      admin_add_coach: {
        Args: { p_coach_id: string; p_is_paid?: boolean; p_session_id: string }
        Returns: string
      }
      admin_add_guest: {
        Args: {
          p_amount_fils?: number
          p_guest_name: string
          p_guest_tier: Database["public"]["Enums"]["tier"]
          p_is_free: boolean
          p_session_id: string
        }
        Returns: string
      }
      admin_add_player: {
        Args: {
          p_player_id: string
          p_session_id: string
          p_use_credit?: boolean
        }
        Returns: string
      }
      admin_move_booking: {
        Args: { p_booking_id: string; p_target_session_id: string }
        Returns: string
      }
      admin_remove_booking: {
        Args: { p_booking_id: string; p_return_credit?: boolean }
        Returns: undefined
      }
      advance_session_states: { Args: never; Returns: number }
      amman_today: { Args: never; Returns: string }
      anonymise_player_account: {
        Args: { p_player_id: string }
        Returns: string[]
      }
      assert_can_book: {
        Args: { p_session_id: string }
        Returns: {
          assistant_coach_count: number
          cancellation_note: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity: number | null
          coach_fee_share_fils: number
          court_cost_share_fils: number
          court_count: number
          created_at: string
          ends_at: string
          has_manual_lineup: boolean
          id: string
          locked_at: string | null
          notes: string | null
          price_fils: number
          reviewed_at: string | null
          reviewed_by: string | null
          rotation_count: number
          session_date: string
          session_type: Database["public"]["Enums"]["session_type"]
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          template_id: string | null
          updated_at: string
          venue_id: string
          water_cost_fils: number
        }
        SetofOptions: {
          from: "*"
          to: "session_instances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_session_addable: {
        Args: { p_session_id: string }
        Returns: {
          assistant_coach_count: number
          cancellation_note: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity: number | null
          coach_fee_share_fils: number
          court_cost_share_fils: number
          court_count: number
          created_at: string
          ends_at: string
          has_manual_lineup: boolean
          id: string
          locked_at: string | null
          notes: string | null
          price_fils: number
          reviewed_at: string | null
          reviewed_by: string | null
          rotation_count: number
          session_date: string
          session_type: Database["public"]["Enums"]["session_type"]
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          template_id: string | null
          updated_at: string
          venue_id: string
          water_cost_fils: number
        }
        SetofOptions: {
          from: "*"
          to: "session_instances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_session_unlocked: {
        Args: { p_session_id: string }
        Returns: {
          assistant_coach_count: number
          cancellation_note: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity: number | null
          coach_fee_share_fils: number
          court_cost_share_fils: number
          court_count: number
          created_at: string
          ends_at: string
          has_manual_lineup: boolean
          id: string
          locked_at: string | null
          notes: string | null
          price_fils: number
          reviewed_at: string | null
          reviewed_by: string | null
          rotation_count: number
          session_date: string
          session_type: Database["public"]["Enums"]["session_type"]
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          template_id: string | null
          updated_at: string
          venue_id: string
          water_cost_fils: number
        }
        SetofOptions: {
          from: "*"
          to: "session_instances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      auth_visibility: {
        Args: never
        Returns: Database["public"]["Enums"]["visibility_level"]
      }
      cancel_own_booking: { Args: { p_booking_id: string }; Returns: undefined }
      cancel_session: {
        Args: { p_note?: string; p_session_id: string }
        Returns: undefined
      }
      claim_push_jobs: { Args: { p_limit?: number }; Returns: Json }
      close_started_waitlists: { Args: never; Returns: number }
      complete_push_job: {
        Args: { p_error?: string; p_job_id: string; p_tickets: Json }
        Returns: number
      }
      confirm_session_review: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      count_lineup_changes: { Args: { p_session_id: string }; Returns: number }
      create_booking: {
        Args: {
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_session_id: string
        }
        Returns: string
      }
      create_cliq_booking: {
        Args: {
          p_booking_id: string
          p_file_size_bytes: number
          p_mime_type: string
          p_session_id: string
          p_storage_path: string
        }
        Returns: string
      }
      create_one_off_session: {
        Args: {
          p_court_count: number
          p_duration_minutes: number
          p_price_fils: number
          p_rotation_count?: number
          p_session_date: string
          p_start_time: string
          p_venue_id: string
        }
        Returns: string
      }
      default_rotation_count: { Args: { p_minutes: number }; Returns: number }
      delete_announcement: { Args: { p_id: string }; Returns: undefined }
      delete_pairing_rule: { Args: { p_rule_id: string }; Returns: undefined }
      enqueue_push_job: {
        Args: {
          p_announcement_id: string
          p_kind: Database["public"]["Enums"]["push_job_kind"]
          p_payload: Json
          p_recipient_ids: string[]
          p_session_id: string
        }
        Returns: string
      }
      extend_subscription: {
        Args: { p_expires_on: string; p_subscription_id: string }
        Returns: undefined
      }
      fail_push_job: {
        Args: { p_error: string; p_job_id: string }
        Returns: undefined
      }
      generate_sessions: { Args: { p_days_ahead?: number }; Returns: number }
      get_session_attendees: {
        Args: { p_session_id: string }
        Returns: {
          booking_id: string
          display_name: string
          is_self: boolean
          tier: Database["public"]["Enums"]["tier"]
        }[]
      }
      get_session_money_summary: {
        Args: { p_session_id: string }
        Returns: {
          attendee_count: number
          collected_fils: number
          cost_fils: number
          credit_revenue_fils: number
          expected_fils: number
          outstanding_fils: number
          profit_fils: number
          profit_if_collected_fils: number
          unsettled_count: number
        }[]
      }
      get_sessions_money_summary: {
        Args: { p_session_ids: string[] }
        Returns: {
          collected_fils: number
          outstanding_fils: number
          session_id: string
        }[]
      }
      grant_subscription: {
        Args: {
          p_expires_on?: string
          p_granted_visits?: number
          p_note?: string
          p_package_id: string
          p_player_id: string
          p_starts_on?: string
        }
        Returns: string
      }
      is_coach: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      join_waitlist: { Args: { p_session_id: string }; Returns: undefined }
      leave_waitlist: { Args: { p_session_id: string }; Returns: undefined }
      lineup_session_for_update: {
        Args: { p_session_id: string }
        Returns: {
          assistant_coach_count: number
          cancellation_note: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity: number | null
          coach_fee_share_fils: number
          court_cost_share_fils: number
          court_count: number
          created_at: string
          ends_at: string
          has_manual_lineup: boolean
          id: string
          locked_at: string | null
          notes: string | null
          price_fils: number
          reviewed_at: string | null
          reviewed_by: string | null
          rotation_count: number
          session_date: string
          session_type: Database["public"]["Enums"]["session_type"]
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          template_id: string | null
          updated_at: string
          venue_id: string
          water_cost_fils: number
        }
        SetofOptions: {
          from: "*"
          to: "session_instances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_coach_options: {
        Args: { p_session_id: string }
        Returns: {
          coach_id: string
          display_name: string
          is_on_night: boolean
          is_on_session: boolean
          tier: Database["public"]["Enums"]["tier"]
        }[]
      }
      lock_court: {
        Args: { p_court_number: number; p_rotation_id: string }
        Returns: undefined
      }
      lock_expired_sessions: { Args: never; Returns: number }
      mark_lineup_stale: { Args: { p_session_id: string }; Returns: undefined }
      notify_waitlist: { Args: { p_session_id: string }; Returns: number }
      pending_push_receipts: {
        Args: { p_limit?: number; p_min_age_seconds?: number }
        Returns: Json
      }
      pick_subscription: { Args: { p_player_id: string }; Returns: string }
      prepare_cliq_booking: { Args: { p_session_id: string }; Returns: string }
      publish_announcement: {
        Args: { p_body: string; p_language: string }
        Returns: string
      }
      purge_payment_proofs: {
        Args: never
        Returns: {
          storage_path: string
        }[]
      }
      recompute_night_costs: {
        Args: { p_session_date: string; p_venue_id: string }
        Returns: undefined
      }
      record_payment: {
        Args: {
          p_booking_id: string
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_note?: string
          p_paid_fils: number
        }
        Returns: undefined
      }
      register_device_token: {
        Args: { p_locale: string; p_platform: string; p_token: string }
        Returns: undefined
      }
      reopen_session_review: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      report_outstanding: {
        Args: { p_month: string }
        Returns: {
          display_name: string
          month_owed_fils: number
          owed_fils: number
          player_id: string
        }[]
      }
      report_players: {
        Args: { p_month: string }
        Returns: {
          active_previous_month: number
          active_this_month: number
          new_registrations: number
        }[]
      }
      report_revenue_by_week: {
        Args: { p_month: string }
        Returns: {
          cash_fils: number
          cliq_fils: number
          credit_fils: number
          session_count: number
          total_fils: number
          week_start: string
        }[]
      }
      report_sections: {
        Args: { p_month: string }
        Returns: Json
      }
      report_session_table: {
        Args: { p_month: string }
        Returns: {
          capacity: number
          cost_fils: number
          ends_at: string
          outstanding_fils: number
          player_count: number
          profit_fils: number
          revenue_fils: number
          session_date: string
          session_id: string
          session_type: Database["public"]["Enums"]["session_type"]
          starts_at: string
          venue_id: string
          venue_name_ar: string
          venue_name_en: string
        }[]
      }
      report_slot_attendance: {
        Args: { p_month: string }
        Returns: {
          attendee_total: number
          capacity_total: number
          session_type: Database["public"]["Enums"]["session_type"]
          sessions_run: number
          start_time: string
          template_id: string
          venue_id: string
          venue_name_ar: string
          venue_name_en: string
          weekday: number
        }[]
      }
      report_subscriptions: {
        Args: { p_month: string }
        Returns: {
          credits_expired: number
          credits_used: number
          sold_count: number
          sold_value_fils: number
        }[]
      }
      report_totals: {
        Args: { p_month: string }
        Returns: {
          attendee_count: number
          capacity_total: number
          cash_cost_fils: number
          cash_fils: number
          cliq_fils: number
          coach_fee_accrued_fils: number
          coach_fee_fils: number
          cost_fils: number
          court_cost_fils: number
          credit_fils: number
          outstanding_fils: number
          owed_to_date_fils: number
          profit_fils: number
          profit_if_collected_fils: number
          revenue_fils: number
          sessions_cancelled: number
          sessions_run: number
          water_cost_fils: number
        }[]
      }
      report_venue_fill: {
        Args: { p_month: string }
        Returns: {
          attendee_total: number
          capacity_total: number
          sessions_run: number
          venue_id: string
          venue_name_ar: string
          venue_name_en: string
        }[]
      }
      resolve_price: {
        Args: {
          p_player_id: string
          p_session_price: number
          p_session_type: Database["public"]["Enums"]["session_type"]
        }
        Returns: number
      }
      save_lineup: {
        Args: { p_lineup: Json; p_session_id: string }
        Returns: undefined
      }
      search_players: {
        Args: {
          p_has_subscription?: boolean
          p_limit?: number
          p_owes_money?: boolean
          p_query?: string
          p_sort?: string
          p_tier?: Database["public"]["Enums"]["tier"]
          p_visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Returns: {
          credit_expires: string
          credits: number
          display_name: string
          owed_fils: number
          player_id: string
          tier: Database["public"]["Enums"]["tier"]
          visibility: Database["public"]["Enums"]["visibility_level"]
        }[]
      }
      search_players_for_session: {
        Args: { p_query: string; p_session_id: string }
        Returns: {
          credit_expires: string
          credits: number
          display_name: string
          is_booked: boolean
          player_id: string
          tier: Database["public"]["Enums"]["tier"]
        }[]
      }
      session_type_for_duration: {
        Args: { p_minutes: number }
        Returns: Database["public"]["Enums"]["session_type"]
      }
      set_pairing_rule: {
        Args: {
          p_kind: Database["public"]["Enums"]["pairing_rule_kind"]
          p_player_a: string
          p_player_b: string
        }
        Returns: string
      }
      settle_push_receipts: { Args: { p_results: Json }; Returns: number }
      split_share: {
        Args: { p_index: number; p_parts: number; p_total: number }
        Returns: number
      }
      subscription_remaining: {
        Args: { p_subscription_id: string }
        Returns: number
      }
      swap_lineup_players: {
        Args: {
          p_booking_a: string
          p_booking_b: string
          p_rotation_id: string
        }
        Returns: undefined
      }
      unlock_court: {
        Args: { p_court_number: number; p_session_id: string }
        Returns: undefined
      }
      update_session_instance: {
        Args: {
          p_court_count: number
          p_duration_minutes: number
          p_notes?: string
          p_price_fils: number
          p_session_id: string
          p_start_time: string
        }
        Returns: undefined
      }
      void_expired_subscriptions: { Args: never; Returns: number }
    }
    Enums: {
      attendee_kind: "player" | "guest" | "coach"
      booking_source: "self" | "admin_added" | "waitlist_claim"
      booking_status:
        | "confirmed"
        | "cancelled_by_player"
        | "cancelled_by_admin"
        | "settled"
      credit_reason:
        | "grant"
        | "booking"
        | "booking_refund"
        | "expiry"
        | "manual_adjustment"
        | "session_cancelled"
      pairing_rule_kind: "never_pair" | "always_pair"
      payment_method: "cash" | "cliq" | "credit" | "free"
      payment_status: "unpaid" | "paid" | "partial" | "waived"
      push_job_kind: "waitlist_spot" | "announcement"
      rotation_rule: "rule_1_similar" | "rule_2_mixed"
      session_status:
        | "scheduled"
        | "in_progress"
        | "pending_review"
        | "confirmed"
        | "locked"
        | "cancelled"
      session_type: "standard" | "extended"
      tier: "C-" | "C" | "C+" | "B-" | "B" | "B+" | "A-" | "A" | "A+"
      user_role: "player" | "assistant_coach" | "admin" | "coach"
      visibility_level: "level_0" | "level_1" | "level_2"
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
    Enums: {
      attendee_kind: ["player", "guest", "coach"],
      booking_source: ["self", "admin_added", "waitlist_claim"],
      booking_status: [
        "confirmed",
        "cancelled_by_player",
        "cancelled_by_admin",
        "settled",
      ],
      credit_reason: [
        "grant",
        "booking",
        "booking_refund",
        "expiry",
        "manual_adjustment",
        "session_cancelled",
      ],
      pairing_rule_kind: ["never_pair", "always_pair"],
      payment_method: ["cash", "cliq", "credit", "free"],
      payment_status: ["unpaid", "paid", "partial", "waived"],
      push_job_kind: ["waitlist_spot", "announcement"],
      rotation_rule: ["rule_1_similar", "rule_2_mixed"],
      session_status: [
        "scheduled",
        "in_progress",
        "pending_review",
        "confirmed",
        "locked",
        "cancelled",
      ],
      session_type: ["standard", "extended"],
      tier: ["C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"],
      user_role: ["player", "assistant_coach", "admin", "coach"],
      visibility_level: ["level_0", "level_1", "level_2"],
    },
  },
} as const

