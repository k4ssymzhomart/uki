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
      answers: {
        Row: {
          choice_id: string
          question_id: string
          saved_at: string
          session_id: string
          synced_at: string | null
        }
        Insert: {
          choice_id: string
          question_id: string
          saved_at: string
          session_id: string
          synced_at?: string | null
        }
        Update: {
          choice_id?: string
          question_id?: string
          saved_at?: string
          session_id?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: string
          at: string
          id: number
          meta: Json
          object_id: string | null
          object_type: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind: string
          at?: string
          id?: never
          meta?: Json
          object_id?: string | null
          object_type: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: string
          at?: string
          id?: never
          meta?: Json
          object_id?: string | null
          object_type?: string
          workspace_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          app_version: string | null
          at: string
          data: Json
          exam_id: string
          frame_count: number
          id: string
          received_at: string
          review: Database["public"]["Enums"]["event_review"]
          seq: number | null
          session_id: string
          source: Database["public"]["Enums"]["event_source"]
          type: string
        }
        Insert: {
          app_version?: string | null
          at: string
          data?: Json
          exam_id: string
          frame_count?: number
          id: string
          received_at?: string
          review: Database["public"]["Enums"]["event_review"]
          seq?: number | null
          session_id: string
          source: Database["public"]["Enums"]["event_source"]
          type: string
        }
        Update: {
          app_version?: string | null
          at?: string
          data?: Json
          exam_id?: string
          frame_count?: number
          id?: string
          received_at?: string
          review?: Database["public"]["Enums"]["event_review"]
          seq?: number | null
          session_id?: string
          source?: Database["public"]["Enums"]["event_source"]
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_groups: {
        Row: {
          exam_id: string
          group_id: string
        }
        Insert: {
          exam_id: string
          group_id: string
        }
        Update: {
          exam_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_groups_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_groups_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          exam_id: string
          position: number
          question_id: string
        }
        Insert: {
          exam_id: string
          position: number
          question_id: string
        }
        Update: {
          exam_id?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_students: {
        Row: {
          exam_id: string
          invite_status: string
          seat: number | null
          student_id: string
        }
        Insert: {
          exam_id: string
          invite_status?: string
          seat?: number | null
          student_id: string
        }
        Update: {
          exam_id?: string
          invite_status?: string
          seat?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_students_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_students_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          allowed_sites: string[]
          checks: Json
          code: string | null
          course: string
          created_at: string | null
          created_by: string | null
          duration_min: number
          faculty_id: string | null
          id: string
          kind: string
          lms_done_path: string | null
          lms_url: string | null
          lobby_opens_at: string
          mode: Database["public"]["Enums"]["exam_mode"]
          starts_at: string
          status: Database["public"]["Enums"]["exam_status"]
          title: string
          workspace_id: string
        }
        Insert: {
          allowed_sites?: string[]
          checks?: Json
          code?: string | null
          course: string
          created_at?: string | null
          created_by?: string | null
          duration_min: number
          faculty_id?: string | null
          id?: string
          kind: string
          lms_done_path?: string | null
          lms_url?: string | null
          lobby_opens_at: string
          mode: Database["public"]["Enums"]["exam_mode"]
          starts_at: string
          status?: Database["public"]["Enums"]["exam_status"]
          title: string
          workspace_id: string
        }
        Update: {
          allowed_sites?: string[]
          checks?: Json
          code?: string | null
          course?: string
          created_at?: string | null
          created_by?: string | null
          duration_min?: number
          faculty_id?: string | null
          id?: string
          kind?: string
          lms_done_path?: string | null
          lms_url?: string | null
          lobby_opens_at?: string
          mode?: Database["public"]["Enums"]["exam_mode"]
          starts_at?: string
          status?: Database["public"]["Enums"]["exam_status"]
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      faculties: {
        Row: {
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      frames: {
        Row: {
          captured_at: string
          event_id: string
          exam_id: string
          id: string
          session_id: string
          storage_path: string
        }
        Insert: {
          captured_at: string
          event_id: string
          exam_id: string
          id: string
          session_id: string
          storage_path: string
        }
        Update: {
          captured_at?: string
          event_id?: string
          exam_id?: string
          id?: string
          session_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "frames_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frames_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frames_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frames_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          code: string
          faculty_id: string | null
          id: string
          workspace_id: string
        }
        Insert: {
          code: string
          faculty_id?: string | null
          id?: string
          workspace_id: string
        }
        Update: {
          code?: string
          faculty_id?: string | null
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      proctor_assignments: {
        Row: {
          confirmed_at: string | null
          exam_id: string
          is_lead: boolean
          languages: Database["public"]["Enums"]["locale"][]
          seat_from: number | null
          seat_to: number | null
          staff_id: string
        }
        Insert: {
          confirmed_at?: string | null
          exam_id: string
          is_lead?: boolean
          languages: Database["public"]["Enums"]["locale"][]
          seat_from?: number | null
          seat_to?: number | null
          staff_id: string
        }
        Update: {
          confirmed_at?: string | null
          exam_id?: string
          is_lead?: boolean
          languages?: Database["public"]["Enums"]["locale"][]
          seat_from?: number | null
          seat_to?: number | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proctor_assignments_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proctor_assignments_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proctor_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          body: Json
          choices: Json
          id: string
          topic: string | null
          workspace_id: string
        }
        Insert: {
          body: Json
          choices: Json
          id?: string
          topic?: string | null
          workspace_id: string
        }
        Update: {
          body?: Json
          choices?: Json
          id?: string
          topic?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      session_commands: {
        Row: {
          acked_at: string | null
          by_name: string
          exam_id: string
          group_id: string | null
          id: string
          issued_at: string | null
          issued_by: string
          payload: Json
          request_id: string | null
          session_id: string
          type: Database["public"]["Enums"]["command_type"]
        }
        Insert: {
          acked_at?: string | null
          by_name?: string
          exam_id: string
          group_id?: string | null
          id?: string
          issued_at?: string | null
          issued_by: string
          payload?: Json
          request_id?: string | null
          session_id: string
          type: Database["public"]["Enums"]["command_type"]
        }
        Update: {
          acked_at?: string | null
          by_name?: string
          exam_id?: string
          group_id?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string
          payload?: Json
          request_id?: string | null
          session_id?: string
          type?: Database["public"]["Enums"]["command_type"]
        }
        Relationships: [
          {
            foreignKeyName: "session_commands_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_commands_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_commands_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_commands_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          auth_uid: string
          device: Json
          end_reason: string | null
          ended_at: string | null
          exam_id: string
          extra_min: number
          id: string
          identity_result: string | null
          identity_score: number | null
          joined_at: string | null
          last_seen_at: string | null
          locale: Database["public"]["Enums"]["locale"]
          pause_event_id: string | null
          paused_s: number
          receipt_id: string | null
          self_paused_s: number
          started_at: string | null
          state: Database["public"]["Enums"]["session_state"]
          status: Json
          student_id: string
          submitted_at: string | null
          time_used_s: number
        }
        Insert: {
          auth_uid: string
          device?: Json
          end_reason?: string | null
          ended_at?: string | null
          exam_id: string
          extra_min?: number
          id?: string
          identity_result?: string | null
          identity_score?: number | null
          joined_at?: string | null
          last_seen_at?: string | null
          locale: Database["public"]["Enums"]["locale"]
          pause_event_id?: string | null
          paused_s?: number
          receipt_id?: string | null
          self_paused_s?: number
          started_at?: string | null
          state?: Database["public"]["Enums"]["session_state"]
          status?: Json
          student_id: string
          submitted_at?: string | null
          time_used_s?: number
        }
        Update: {
          auth_uid?: string
          device?: Json
          end_reason?: string | null
          ended_at?: string | null
          exam_id?: string
          extra_min?: number
          id?: string
          identity_result?: string | null
          identity_score?: number | null
          joined_at?: string | null
          last_seen_at?: string | null
          locale?: Database["public"]["Enums"]["locale"]
          pause_event_id?: string | null
          paused_s?: number
          receipt_id?: string | null
          self_paused_s?: number
          started_at?: string | null
          state?: Database["public"]["Enums"]["session_state"]
          status?: Json
          student_id?: string
          submitted_at?: string | null
          time_used_s?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          faculty_id: string | null
          full_name: string
          id: string
          languages: Database["public"]["Enums"]["locale"][]
          role: Database["public"]["Enums"]["staff_role"]
          workspace_id: string
        }
        Insert: {
          faculty_id?: string | null
          full_name: string
          id: string
          languages?: Database["public"]["Enums"]["locale"][]
          role: Database["public"]["Enums"]["staff_role"]
          workspace_id: string
        }
        Update: {
          faculty_id?: string | null
          full_name?: string
          id?: string
          languages?: Database["public"]["Enums"]["locale"][]
          role?: Database["public"]["Enums"]["staff_role"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          email: string | null
          full_name: string
          group_id: string | null
          id: string
          locale: Database["public"]["Enums"]["locale"]
          student_number: string
          workspace_id: string
        }
        Insert: {
          email?: string | null
          full_name: string
          group_id?: string | null
          id?: string
          locale?: Database["public"]["Enums"]["locale"]
          student_number: string
          workspace_id: string
        }
        Update: {
          email?: string | null
          full_name?: string
          group_id?: string | null
          id?: string
          locale?: Database["public"]["Enums"]["locale"]
          student_number?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
          timezone: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
          timezone?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
          timezone?: string
        }
        Relationships: []
      }
    }
    Views: {
      exam_overview: {
        Row: {
          checks: Json | null
          code: string | null
          course: string | null
          created_at: string | null
          duration_min: number | null
          ends_at: string | null
          faculty_id: string | null
          faculty_name: string | null
          flagged_events: number | null
          groups: string[] | null
          id: string | null
          joined: number | null
          kind: string | null
          lms_url: string | null
          lobby_opens_at: string | null
          mode: Database["public"]["Enums"]["exam_mode"] | null
          paused: number | null
          proctor_count: number | null
          question_count: number | null
          roster_size: number | null
          sessions_final: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["exam_status"] | null
          title: string | null
          workspace_id: string | null
          writing: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_read_topic: { Args: { p_topic: string }; Returns: boolean }
      confirm_frames: {
        Args: { p_event_id: string; p_paths: string[] }
        Returns: string[]
      }
      exam_question_count: { Args: { exam_id: string }; Returns: number }
      exam_started: { Args: { p_exam_id: string }; Returns: boolean }
      exam_workspace: { Args: { p_exam_id: string }; Returns: string }
      has_session_in: { Args: { p_exam_id: string }; Returns: boolean }
      ingest_batch: {
        Args: {
          p_events: Json
          p_owner?: string
          p_session_id: string
          p_status?: Json
        }
        Returns: Json
      }
      is_anonymous: { Args: never; Returns: boolean }
      is_exam_staff: { Args: { p_exam_id: string }; Returns: boolean }
      is_final_state: {
        Args: { p_state: Database["public"]["Enums"]["session_state"] }
        Returns: boolean
      }
      is_member_of: { Args: { p_workspace_id: string }; Returns: boolean }
      is_office_of_exam: { Args: { p_exam_id: string }; Returns: boolean }
      is_proctor_of: { Args: { p_exam_id: string }; Returns: boolean }
      is_staff_of: { Args: { p_workspace_id: string }; Returns: boolean }
      issue_command: {
        Args: {
          p_exam_id?: string
          p_payload?: Json
          p_request_id?: string
          p_scope?: string
          p_session_id?: string
          p_type?: Database["public"]["Enums"]["command_type"]
        }
        Returns: string[]
      }
      join_exam: {
        Args: {
          code: string
          device: Json
          locale: Database["public"]["Enums"]["locale"]
          student_number: string
        }
        Returns: Json
      }
      make_receipt_id: { Args: { p_student_id: string }; Returns: string }
      owns_session: { Args: { p_session_id: string }; Returns: boolean }
      pending_pause_s: {
        Args: { s: Database["public"]["Tables"]["sessions"]["Row"] }
        Returns: number
      }
      pre_exam_rank: { Args: { p_state: string }; Returns: number }
      receipt_initial: { Args: { p_word: string }; Returns: string }
      session_ends_at: {
        Args: { s: Database["public"]["Tables"]["sessions"]["Row"] }
        Returns: string
      }
      session_exam: { Args: { p_session_id: string }; Returns: string }
      session_json: {
        Args: { s: Database["public"]["Tables"]["sessions"]["Row"] }
        Returns: Json
      }
      session_tick: { Args: never; Returns: Json }
      start_exam: { Args: { exam_id: string }; Returns: Json }
      submit_session: { Args: { session_id: string }; Returns: Json }
    }
    Enums: {
      command_type:
        | "pause"
        | "resume"
        | "end"
        | "message"
        | "add_time"
        | "start"
      event_review: "flag" | "log" | "none"
      event_source: "app" | "lock" | "proctor" | "server"
      exam_mode: "app" | "browser"
      exam_status:
        | "draft"
        | "scheduled"
        | "live"
        | "to_review"
        | "reviewed"
        | "cancelled"
      locale: "kk" | "ru" | "en"
      session_state:
        | "joined"
        | "checking"
        | "identity"
        | "rules"
        | "ready"
        | "writing"
        | "paused"
        | "submitted"
        | "time_up"
        | "ended"
      staff_role: "exam_office" | "proctor" | "admin"
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
      command_type: ["pause", "resume", "end", "message", "add_time", "start"],
      event_review: ["flag", "log", "none"],
      event_source: ["app", "lock", "proctor", "server"],
      exam_mode: ["app", "browser"],
      exam_status: [
        "draft",
        "scheduled",
        "live",
        "to_review",
        "reviewed",
        "cancelled",
      ],
      locale: ["kk", "ru", "en"],
      session_state: [
        "joined",
        "checking",
        "identity",
        "rules",
        "ready",
        "writing",
        "paused",
        "submitted",
        "time_up",
        "ended",
      ],
      staff_role: ["exam_office", "proctor", "admin"],
    },
  },
} as const

