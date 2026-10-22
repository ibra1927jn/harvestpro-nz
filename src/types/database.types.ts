export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      account_locks: {
        Row: {
          email: string
          id: string
          locked_at: string | null
          locked_by_system: boolean | null
          locked_until: string
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          user_id: string | null
        }
        Insert: {
          email: string
          id?: string
          locked_at?: string | null
          locked_by_system?: boolean | null
          locked_until: string
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          user_id?: string | null
        }
        Update: {
          email?: string
          id?: string
          locked_at?: string | null
          locked_by_system?: boolean | null
          locked_until?: string
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      allowed_registrations: {
        Row: {
          assigned_role: string
          created_at: string | null
          created_by: string | null
          email: string
          id: string
          orchard_id: string | null
          role: string | null
          used_at: string | null
        }
        Insert: {
          assigned_role?: string
          created_at?: string | null
          created_by?: string | null
          email: string
          id?: string
          orchard_id?: string | null
          role?: string | null
          used_at?: string | null
        }
        Update: {
          assigned_role?: string
          created_at?: string | null
          created_by?: string | null
          email?: string
          id?: string
          orchard_id?: string | null
          role?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allowed_registrations_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bins: {
        Row: {
          bin_code: string | null
          block_id: string | null
          created_at: string | null
          deleted_at: string | null
          filled_at: string | null
          id: string
          location: Json | null
          movement_history: Json[] | null
          orchard_id: string | null
          status: string | null
          updated_at: string | null
          variety: string | null
        }
        Insert: {
          bin_code?: string | null
          block_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          filled_at?: string | null
          id?: string
          location?: Json | null
          movement_history?: Json[] | null
          orchard_id?: string | null
          status?: string | null
          updated_at?: string | null
          variety?: string | null
        }
        Update: {
          bin_code?: string | null
          block_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          filled_at?: string | null
          id?: string
          location?: Json | null
          movement_history?: Json[] | null
          orchard_id?: string | null
          status?: string | null
          updated_at?: string | null
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bins_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "orchard_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bins_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
      block_rows: {
        Row: {
          block_id: string
          created_at: string | null
          deleted_at: string | null
          id: string
          row_number: number
          target_buckets: number | null
          variety: string | null
        }
        Insert: {
          block_id: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          row_number: number
          target_buckets?: number | null
          variety?: string | null
        }
        Update: {
          block_id?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          row_number?: number
          target_buckets?: number | null
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "block_rows_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "orchard_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          acknowledged_by: string[] | null
          content: string
          created_at: string
          id: string
          orchard_id: string
          priority: string
          sender_id: string
          target_roles: string[] | null
          title: string
        }
        Insert: {
          acknowledged_by?: string[] | null
          content: string
          created_at?: string
          id?: string
          orchard_id: string
          priority?: string
          sender_id: string
          target_roles?: string[] | null
          title: string
        }
        Update: {
          acknowledged_by?: string[] | null
          content?: string
          created_at?: string
          id?: string
          orchard_id?: string
          priority?: string
          sender_id?: string
          target_roles?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
      bucket_records: {
        Row: {
          bin_id: string | null
          block_row_id: string | null
          coords: Json | null
          created_at: string | null
          deleted_at: string | null
          id: string
          orchard_id: string | null
          picker_id: string | null
          quality_grade: string | null
          row_id: string | null
          row_number: number | null
          scanned_at: string | null
          scanned_by: string | null
          season_id: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          bin_id?: string | null
          block_row_id?: string | null
          coords?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          orchard_id?: string | null
          picker_id?: string | null
          quality_grade?: string | null
          row_id?: string | null
          row_number?: number | null
          scanned_at?: string | null
          scanned_by?: string | null
          season_id?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          bin_id?: string | null
          block_row_id?: string | null
          coords?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          orchard_id?: string | null
          picker_id?: string | null
          quality_grade?: string | null
          row_id?: string | null
          row_number?: number | null
          scanned_at?: string | null
          scanned_by?: string | null
          season_id?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bucket_records_block_row_id_fkey"
            columns: ["block_row_id"]
            isOneToOne: false
            referencedRelation: "block_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_records_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_records_picker_id_fkey"
            columns: ["picker_id"]
            isOneToOne: false
            referencedRelation: "pickers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_records_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "block_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_records_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_records_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_records_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "harvest_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          read_by: string[] | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          read_by?: string[] | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          read_by?: string[] | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          employee_id: string
          end_date: string | null
          hourly_rate: number
          id: string
          notes: string | null
          orchard_id: string
          start_date: string
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          employee_id: string
          end_date?: string | null
          hourly_rate?: number
          id?: string
          notes?: string | null
          orchard_id: string
          start_date: string
          status?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          employee_id?: string
          end_date?: string | null
          hourly_rate?: number
          id?: string
          notes?: string | null
          orchard_id?: string
          start_date?: string
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string | null
          participant_ids: string[]
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          participant_ids?: string[]
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          participant_ids?: string[]
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_attendance: {
        Row: {
          check_in: string | null
          break_minutes: number
          break_start: string | null
          check_out: string | null
          corrected_at: string | null
          corrected_by: string | null
          correction_reason: string | null
          created_at: string | null
          date: string
          deleted_at: string | null
          hours_worked: number | null
          id: string
          notes: string | null
          orchard_id: string
          picker_id: string
          recorded_by: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          safety_harness_verified: boolean | null
          season_id: string | null
          status: string
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
          version: number | null
        }
        Insert: {
          check_in?: string | null
          break_minutes?: number
          break_start?: string | null
          check_out?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          correction_reason?: string | null
          created_at?: string | null
          date?: string
          deleted_at?: string | null
          hours_worked?: number | null
          id?: string
          notes?: string | null
          orchard_id: string
          picker_id: string
          recorded_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          safety_harness_verified?: boolean | null
          season_id?: string | null
          status?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number | null
        }
        Update: {
          check_in?: string | null
          break_minutes?: number
          break_start?: string | null
          check_out?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          correction_reason?: string | null
          created_at?: string | null
          date?: string
          deleted_at?: string | null
          hours_worked?: number | null
          id?: string
          notes?: string | null
          orchard_id?: string
          picker_id?: string
          recorded_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          safety_harness_verified?: boolean | null
          season_id?: string | null
          status?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_picker_id_fkey"
            columns: ["picker_id"]
            isOneToOne: false
            referencedRelation: "pickers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "harvest_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      day_closures: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          date: string
          deleted_at: string | null
          id: string
          orchard_id: string
          status: string
          total_buckets: number
          total_cost: number
          total_hours: number | null
          updated_at: string | null
          wage_violations: number | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          date: string
          deleted_at?: string | null
          id?: string
          orchard_id: string
          status: string
          total_buckets?: number
          total_cost?: number
          total_hours?: number | null
          updated_at?: string | null
          wage_violations?: number | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          date?: string
          deleted_at?: string | null
          id?: string
          orchard_id?: string
          status?: string
          total_buckets?: number
          total_cost?: number
          total_hours?: number | null
          updated_at?: string | null
          wage_violations?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "day_closures_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_closures_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_closures_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
      day_setups: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string | null
          deleted_at: string | null
          id: string
          min_wage_rate: number | null
          orchard_id: string | null
          piece_rate: number | null
          season_id: string | null
          start_time: string | null
          target_tons: number | null
          variety: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          min_wage_rate?: number | null
          orchard_id?: string | null
          piece_rate?: number | null
          season_id?: string | null
          start_time?: string | null
          target_tons?: number | null
          variety?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          min_wage_rate?: number | null
          orchard_id?: string | null
          piece_rate?: number | null
          season_id?: string | null
          start_time?: string | null
          target_tons?: number | null
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "day_setups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_setups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_setups_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_setups_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "harvest_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vehicles: {
        Row: {
          bins_loaded: number | null
          cof_expiry: string | null
          created_at: string | null
          deleted_at: string | null
          driver_id: string | null
          driver_name: string | null
          fuel_level: number | null
          id: string
          last_service_date: string | null
          load_status: string | null
          max_capacity: number | null
          name: string
          next_service_date: string | null
          orchard_id: string
          registration: string | null
          status: string
          updated_at: string | null
          wof_expiry: string | null
          zone: string | null
          type: string
        }
        Insert: {
          bins_loaded?: number | null
          cof_expiry?: string | null
          created_at?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          driver_name?: string | null
          fuel_level?: number | null
          id?: string
          last_service_date?: string | null
          load_status?: string | null
          max_capacity?: number | null
          name: string
          next_service_date?: string | null
          orchard_id: string
          registration?: string | null
          status?: string
          updated_at?: string | null
          wof_expiry?: string | null
          zone?: string | null
          type?: string
        }
        Update: {
          bins_loaded?: number | null
          cof_expiry?: string | null
          created_at?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          driver_name?: string | null
          fuel_level?: number | null
          id?: string
          last_service_date?: string | null
          load_status?: string | null
          max_capacity?: number | null
          name?: string
          next_service_date?: string | null
          orchard_id?: string
          registration?: string | null
          status?: string
          updated_at?: string | null
          wof_expiry?: string | null
          zone?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_seasons: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          end_date: string | null
          id: string
          name: string
          orchard_id: string
          start_date: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          name: string
          orchard_id: string
          start_date: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          name?: string
          orchard_id?: string
          start_date?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harvest_seasons_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_settings: {
        Row: {
          created_at: string | null
          mfa_device_trust_ttl_hours: number | null
          min_buckets_per_hour: number | null
          min_wage_rate: number | null
          orchard_id: string
          piece_rate: number | null
          shift_end_time: string | null
          shift_start_time: string | null
          target_tons: number | null
          updated_at: string | null
          variety: string | null
        }
        Insert: {
          created_at?: string | null
          mfa_device_trust_ttl_hours?: number | null
          min_buckets_per_hour?: number | null
          min_wage_rate?: number | null
          orchard_id: string
          piece_rate?: number | null
          shift_end_time?: string | null
          shift_start_time?: string | null
          target_tons?: number | null
          updated_at?: string | null
          variety?: string | null
        }
        Update: {
          created_at?: string | null
          mfa_device_trust_ttl_hours?: number | null
          min_buckets_per_hour?: number | null
          min_wage_rate?: number | null
          orchard_id?: string
          piece_rate?: number | null
          shift_end_time?: string | null
          shift_start_time?: string | null
          target_tons?: number | null
          updated_at?: string | null
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harvest_settings_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: true
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempt_time: string | null
          email: string
          failure_reason: string | null
          id: string
          ip_address: unknown
          success: boolean | null
          user_agent: string | null
        }
        Insert: {
          attempt_time?: string | null
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          success?: boolean | null
          user_agent?: string | null
        }
        Update: {
          attempt_time?: string | null
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          success?: boolean | null
          user_agent?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          read: boolean | null
          receiver_id: string
          sender_id: string
          type: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          receiver_id: string
          sender_id: string
          type?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          receiver_id?: string
          sender_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orchard_blocks: {
        Row: {
          color_code: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          name: string
          orchard_id: string
          season_id: string
          start_row: number
          status: string
          total_rows: number
          updated_at: string | null
        }
        Insert: {
          color_code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          orchard_id: string
          season_id: string
          start_row?: number
          status?: string
          total_rows?: number
          updated_at?: string | null
        }
        Update: {
          color_code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          orchard_id?: string
          season_id?: string
          start_row?: number
          status?: string
          total_rows?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orchard_blocks_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchard_blocks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "harvest_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      orchards: {
        Row: {
          code: string | null
          created_at: string | null
          crop_type: string | null
          deleted_at: string | null
          id: string
          location: string | null
          name: string
          total_blocks: number | null
          total_rows: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          crop_type?: string | null
          deleted_at?: string | null
          id?: string
          location?: string | null
          name: string
          total_blocks?: number | null
          total_rows?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          crop_type?: string | null
          deleted_at?: string | null
          id?: string
          location?: string | null
          name?: string
          total_blocks?: number | null
          total_rows?: number | null
        }
        Relationships: []
      }
      pickers: {
        Row: {
          archived_at: string | null
          created_at: string | null
          current_row: number | null
          deleted_at: string | null
          harness_number: string | null
          id: string
          name: string
          orchard_id: string | null
          picker_id: string
          role: string | null
          safety_verified: boolean | null
          status: string | null
          team_leader_id: string | null
          total_buckets_today: number | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          current_row?: number | null
          deleted_at?: string | null
          harness_number?: string | null
          id?: string
          name: string
          orchard_id?: string | null
          picker_id: string
          role?: string | null
          safety_verified?: boolean | null
          status?: string | null
          team_leader_id?: string | null
          total_buckets_today?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          current_row?: number | null
          deleted_at?: string | null
          harness_number?: string | null
          id?: string
          name?: string
          orchard_id?: string | null
          picker_id?: string
          role?: string | null
          safety_verified?: boolean | null
          status?: string | null
          team_leader_id?: string | null
          total_buckets_today?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pickers_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickers_team_leader_id_fkey"
            columns: ["team_leader_id"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickers_team_leader_id_fkey"
            columns: ["team_leader_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_consent_log: {
        Row: {
          consent_given: boolean
          consent_type: string
          consented_at: string
          created_at: string
          id: string
          policy_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consent_given?: boolean
          consent_type?: string
          consented_at?: string
          created_at?: string
          id?: string
          policy_version?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consent_given?: boolean
          consent_type?: string
          consented_at?: string
          created_at?: string
          id?: string
          policy_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      qc_inspections: {
        Row: {
          comfortable: boolean | null
          created_at: string | null
          criteria: Json | null
          grade: string
          id: string
          informed: boolean | null
          inspector_id: string
          notes: string | null
          orchard_id: string
          photo_url: string | null
          picker_id: string
          row_number: number | null
          score: number | null
          wellbeing_notes: string | null
        }
        Insert: {
          comfortable?: boolean | null
          created_at?: string | null
          criteria?: Json | null
          grade: string
          id?: string
          informed?: boolean | null
          inspector_id: string
          notes?: string | null
          orchard_id: string
          photo_url?: string | null
          picker_id: string
          row_number?: number | null
          score?: number | null
          wellbeing_notes?: string | null
        }
        Update: {
          comfortable?: boolean | null
          created_at?: string | null
          criteria?: Json | null
          grade?: string
          id?: string
          informed?: boolean | null
          inspector_id?: string
          notes?: string | null
          orchard_id?: string
          photo_url?: string | null
          picker_id?: string
          row_number?: number | null
          score?: number | null
          wellbeing_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_picker_id_fkey"
            columns: ["picker_id"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_picker_id_fkey"
            columns: ["picker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_inspections: {
        Row: {
          bucket_id: string | null
          coords: Json | null
          created_at: string | null
          id: string
          inspector_id: string | null
          notes: string | null
          photo_url: string | null
          picker_id: string | null
          quality_grade: string | null
        }
        Insert: {
          bucket_id?: string | null
          coords?: Json | null
          created_at?: string | null
          id?: string
          inspector_id?: string | null
          notes?: string | null
          photo_url?: string | null
          picker_id?: string | null
          quality_grade?: string | null
        }
        Update: {
          bucket_id?: string | null
          coords?: Json | null
          created_at?: string | null
          id?: string
          inspector_id?: string | null
          notes?: string | null
          photo_url?: string | null
          picker_id?: string | null
          quality_grade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_inspections_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "bucket_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_inspections_picker_id_fkey"
            columns: ["picker_id"]
            isOneToOne: false
            referencedRelation: "pickers"
            referencedColumns: ["id"]
          },
        ]
      }
      row_assignments: {
        Row: {
          assigned_at: string | null
          assigned_pickers: string[] | null
          block_row_id: string | null
          completion_percentage: number | null
          deleted_at: string | null
          id: string
          orchard_id: string | null
          row_number: number
          season_id: string | null
          side: string | null
          status: string | null
          version: number | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_pickers?: string[] | null
          block_row_id?: string | null
          completion_percentage?: number | null
          deleted_at?: string | null
          id?: string
          orchard_id?: string | null
          row_number: number
          season_id?: string | null
          side?: string | null
          status?: string | null
          version?: number | null
        }
        Update: {
          assigned_at?: string | null
          assigned_pickers?: string[] | null
          block_row_id?: string | null
          completion_percentage?: number | null
          deleted_at?: string | null
          id?: string
          orchard_id?: string | null
          row_number?: number
          season_id?: string | null
          side?: string | null
          status?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "row_assignments_block_row_id_fkey"
            columns: ["block_row_id"]
            isOneToOne: false
            referencedRelation: "block_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "row_assignments_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "row_assignments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "harvest_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_conflicts: {
        Row: {
          created_at: string | null
          id: string
          local_updated_at: string | null
          local_values: Json | null
          record_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          server_updated_at: string | null
          server_values: Json | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          local_updated_at?: string | null
          local_values?: Json | null
          record_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          server_updated_at?: string | null
          server_values?: Json | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          local_updated_at?: string | null
          local_values?: Json | null
          record_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          server_updated_at?: string | null
          server_values?: Json | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transport_requests: {
        Row: {
          assigned_by: string | null
          assigned_vehicle: string | null
          bins_count: number
          completed_at: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          orchard_id: string
          priority: string
          requested_by: string
          requester_name: string
          status: string
          updated_at: string | null
          zone: string
        }
        Insert: {
          assigned_by?: string | null
          assigned_vehicle?: string | null
          bins_count?: number
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          orchard_id: string
          priority?: string
          requested_by: string
          requester_name: string
          status?: string
          updated_at?: string | null
          zone: string
        }
        Update: {
          assigned_by?: string | null
          assigned_vehicle?: string | null
          bins_count?: number
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          orchard_id?: string
          priority?: string
          requested_by?: string
          requester_name?: string
          status?: string
          updated_at?: string | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_requests_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_assigned_vehicle_fkey"
            columns: ["assigned_vehicle"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "pickers_performance_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          orchard_id: string | null
          phone: string | null
          preferred_locale: string | null
          privacy_consent_at: string | null
          role: string | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          orchard_id?: string | null
          phone?: string | null
          preferred_locale?: string | null
          privacy_consent_at?: string | null
          role?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          orchard_id?: string | null
          phone?: string | null
          preferred_locale?: string | null
          privacy_consent_at?: string | null
          role?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
      wage_rates: {
        Row: {
          created_at: string
          effective_date: string
          hourly_rate: number
          id: string
          job_type: string
          notes: string | null
          orchard_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_date?: string
          hourly_rate: number
          id?: string
          job_type: string
          notes?: string | null
          orchard_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_date?: string
          hourly_rate?: number
          id?: string
          job_type?: string
          notes?: string | null
          orchard_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wage_rates_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
      // Añadido a mano (sin generador): 20260418000000_hr_documents + 20261022040000_hr_contract_document
      hr_documents: {
        Row: {
          contract_id: string | null
          deleted_at: string | null
          document_type: string
          expires_at: string | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          notes: string | null
          orchard_id: string
          picker_id: string | null
          storage_path: string
          title: string
          uploaded_at: string
          uploaded_by: string | null
          user_id: string | null
        }
        Insert: {
          contract_id?: string | null
          deleted_at?: string | null
          document_type: string
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          orchard_id: string
          picker_id?: string | null
          storage_path: string
          title: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string | null
        }
        Update: {
          contract_id?: string | null
          deleted_at?: string | null
          document_type?: string
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          orchard_id?: string
          picker_id?: string | null
          storage_path?: string
          title?: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_picker_id_fkey"
            columns: ["picker_id"]
            isOneToOne: false
            referencedRelation: "pickers"
            referencedColumns: ["id"]
          },
        ]
      }
      // Añadido a mano (sin generador): 20261022041000_leave_requests
      leave_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          deleted_at: string | null
          end_date: string
          half_day: boolean
          id: string
          orchard_id: string
          picker_id: string
          reason: string | null
          requested_by: string | null
          start_date: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          deleted_at?: string | null
          end_date: string
          half_day?: boolean
          id?: string
          orchard_id: string
          picker_id: string
          reason?: string | null
          requested_by?: string | null
          start_date: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          deleted_at?: string | null
          end_date?: string
          half_day?: boolean
          id?: string
          orchard_id?: string
          picker_id?: string
          reason?: string | null
          requested_by?: string | null
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_picker_id_fkey"
            columns: ["picker_id"]
            isOneToOne: false
            referencedRelation: "pickers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pickers_performance_today: {
        Row: {
          buckets_today: number | null
          full_name: string | null
          grade_a: number | null
          grade_b: number | null
          grade_c: number | null
          id: string | null
          orchard_id: string | null
          rejects: number | null
        }
        Relationships: [
          {
            foreignKeyName: "users_orchard_id_fkey"
            columns: ["orchard_id"]
            isOneToOne: false
            referencedRelation: "orchards"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_in_picker: {
        Args: {
          p_orchard_id: string
          p_picker_id: string
          p_verified_by?: string
        }
        Returns: Json
      }
      check_out_picker: { Args: { p_attendance_id: string }; Returns: Json }
      check_rate_limit: { Args: { check_email: string }; Returns: Json }
      cleanup_old_account_locks: { Args: never; Returns: undefined }
      cleanup_old_audit_logs: { Args: never; Returns: undefined }
      cleanup_old_login_attempts: { Args: never; Returns: undefined }
      close_payroll_period: {
        Args: {
          p_orchard_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      correct_attendance: {
        Args: {
          p_admin_id?: string
          p_attendance_id: string
          p_check_in_time?: string
          p_check_out_time?: string
          p_reason?: string
        }
        Returns: undefined
      }
      get_auth_orchard_id: { Args: never; Returns: string }
      get_auth_role: { Args: never; Returns: string }
      get_failed_login_count: { Args: { check_email: string }; Returns: number }
      get_my_orchard_id: { Args: never; Returns: string }
      get_record_audit_trail: {
        Args: { p_record_id: string; p_table_name: string }
        Returns: {
          action: string
          created_at: string
          id: string
          new_values: Json
          old_values: Json
          user_email: string
        }[]
      }
      health_check: { Args: never; Returns: Json }
      is_account_locked: { Args: { check_email: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_hr_manager_or_admin: { Args: never; Returns: boolean }
      is_logistics_or_manager: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_manager_or_leader: { Args: never; Returns: boolean }
      is_role: { Args: { allowed_roles: string[] }; Returns: boolean }
      setup_orchard_atomic: {
        Args: {
          p_code: string
          p_location?: string
          p_name: string
          p_piece_rate?: number
          p_start_time?: string
          p_total_rows?: number
        }
        Returns: Json
      }
      unlock_account: {
        Args: { target_email: string; unlock_reason_text?: string }
        Returns: boolean
      }
      update_my_profile: {
        Args: {
          p_avatar_url?: string | null
          p_full_name?: string | null
          p_phone?: string | null
          p_preferred_locale?: string | null
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
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

// ─── Type aliases y runtime type guards (escritos a mano — NO borrar al regenerar) ──────────

/** Alias conveniente para la fila de la tabla pickers */
export type SupabasePicker = Database['public']['Tables']['pickers']['Row'];

/** Alias conveniente para la vista pickers_performance_today */
export type SupabasePerformanceStat = Database['public']['Views']['pickers_performance_today']['Row'] & {
    picker_id?: string | null;
};

export function isSupabasePicker(v: unknown): v is Database['public']['Tables']['pickers']['Row'] {
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    return typeof o['id'] === 'string' && typeof o['picker_id'] === 'string' && typeof o['created_at'] === 'string';
}

export function isSupabaseUser(v: unknown): v is Database['public']['Tables']['users']['Row'] {
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    return typeof o['id'] === 'string' && typeof o['role'] === 'string' && typeof o['created_at'] === 'string';
}

export function isSupabaseChatMessage(v: unknown): v is Database['public']['Tables']['chat_messages']['Row'] {
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    return (
        typeof o['id'] === 'string' &&
        typeof o['conversation_id'] === 'string' &&
        typeof o['sender_id'] === 'string' &&
        typeof o['content'] === 'string' &&
        typeof o['created_at'] === 'string'
    );
}

export function isSupabaseAttendanceRecord(v: unknown): v is Database['public']['Tables']['daily_attendance']['Row'] {
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    return (
        typeof o['id'] === 'string' &&
        typeof o['picker_id'] === 'string' &&
        typeof o['orchard_id'] === 'string' &&
        typeof o['created_at'] === 'string'
    );
}

export function isSupabasePickerArray(v: unknown): v is Database['public']['Tables']['pickers']['Row'][] {
    return Array.isArray(v) && v.every(isSupabasePicker);
}

export function isSupabaseUserArray(v: unknown): v is Database['public']['Tables']['users']['Row'][] {
    return Array.isArray(v) && v.every(isSupabaseUser);
}

export function isSupabaseChatMessageArray(v: unknown): v is Database['public']['Tables']['chat_messages']['Row'][] {
    return Array.isArray(v) && v.every(isSupabaseChatMessage);
}

