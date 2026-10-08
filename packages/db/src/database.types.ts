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
            referencedRelation: "review_queue"
            referencedColumns: ["session_id"]
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
      data_requests: {
        Row: {
          done_at: string | null
          done_by: string | null
          due_at: string
          export_path: string | null
          id: string
          kind: Database["public"]["Enums"]["data_request_kind"]
          received_at: string
          reply: string | null
          status: Database["public"]["Enums"]["data_request_status"]
          student_id: string
          workspace_id: string
        }
        Insert: {
          done_at?: string | null
          done_by?: string | null
          due_at?: string
          export_path?: string | null
          id?: string
          kind: Database["public"]["Enums"]["data_request_kind"]
          received_at?: string
          reply?: string | null
          status?: Database["public"]["Enums"]["data_request_status"]
          student_id: string
          workspace_id: string
        }
        Update: {
          done_at?: string | null
          done_by?: string | null
          due_at?: string
          export_path?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["data_request_kind"]
          received_at?: string
          reply?: string | null
          status?: Database["public"]["Enums"]["data_request_status"]
          student_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "events_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "events_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "events_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "review_queue"
            referencedColumns: ["session_id"]
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
            foreignKeyName: "exam_groups_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "exam_groups_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "exam_groups_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
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
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
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
            foreignKeyName: "exam_students_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "exam_students_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "exam_students_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "exam_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
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
          browser_rules: Json
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
          room: string | null
          rules_locale: Database["public"]["Enums"]["locale"] | null
          scheduled_at: string | null
          starts_at: string
          status: Database["public"]["Enums"]["exam_status"]
          title: string
          workspace_id: string
        }
        Insert: {
          allowed_sites?: string[]
          browser_rules?: Json
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
          room?: string | null
          rules_locale?: Database["public"]["Enums"]["locale"] | null
          scheduled_at?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["exam_status"]
          title: string
          workspace_id: string
        }
        Update: {
          allowed_sites?: string[]
          browser_rules?: Json
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
          room?: string | null
          rules_locale?: Database["public"]["Enums"]["locale"] | null
          scheduled_at?: string | null
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
            foreignKeyName: "frames_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "frames_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "frames_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "frames_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "review_queue"
            referencedColumns: ["session_id"]
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
      help_requests: {
        Row: {
          created_at: string
          done_at: string | null
          done_by: string | null
          event_id: string | null
          exam_id: string
          id: string
          reply: string | null
          session_id: string
          text: string | null
          topic: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          event_id?: string | null
          exam_id: string
          id?: string
          reply?: string | null
          session_id: string
          text?: string | null
          topic: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          event_id?: string | null
          exam_id?: string
          id?: string
          reply?: string | null
          session_id?: string
          text?: string | null
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_requests_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "help_requests_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "help_requests_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "help_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "review_queue"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "help_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          email: string
          error: string | null
          exam_id: string
          id: string
          locale: Database["public"]["Enums"]["locale"]
          provider_id: string | null
          sent_at: string | null
          state: Database["public"]["Enums"]["invite_state"]
          student_id: string
        }
        Insert: {
          email: string
          error?: string | null
          exam_id: string
          id?: string
          locale: Database["public"]["Enums"]["locale"]
          provider_id?: string | null
          sent_at?: string | null
          state?: Database["public"]["Enums"]["invite_state"]
          student_id: string
        }
        Update: {
          email?: string
          error?: string | null
          exam_id?: string
          id?: string
          locale?: Database["public"]["Enums"]["locale"]
          provider_id?: string | null
          sent_at?: string | null
          state?: Database["public"]["Enums"]["invite_state"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "invites_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "invites_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "invites_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_requests: {
        Row: {
          created_at: string
          demo_invite: boolean
          email: string
          exam_size: string | null
          id: string
          message: string | null
          name: string
          pilot_month: string | null
          role: string | null
          university: string
        }
        Insert: {
          created_at?: string
          demo_invite?: boolean
          email: string
          exam_size?: string | null
          id?: string
          message?: string | null
          name: string
          pilot_month?: string | null
          role?: string | null
          university: string
        }
        Update: {
          created_at?: string
          demo_invite?: boolean
          email?: string
          exam_size?: string | null
          id?: string
          message?: string | null
          name?: string
          pilot_month?: string | null
          role?: string | null
          university?: string
        }
        Relationships: []
      }
      proctor_assignments: {
        Row: {
          change_request: string | null
          confirmed_at: string | null
          exam_id: string
          is_lead: boolean
          languages: Database["public"]["Enums"]["locale"][]
          seat_from: number | null
          seat_to: number | null
          staff_id: string
        }
        Insert: {
          change_request?: string | null
          confirmed_at?: string | null
          exam_id: string
          is_lead?: boolean
          languages: Database["public"]["Enums"]["locale"][]
          seat_from?: number | null
          seat_to?: number | null
          staff_id: string
        }
        Update: {
          change_request?: string | null
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
            foreignKeyName: "proctor_assignments_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "proctor_assignments_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "proctor_assignments_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
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
      report_shares: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          report_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          report_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          report_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          content_hash: string
          created_at: string
          created_by: string
          exam_id: string
          id: string
          issued_at: string
          session_id: string
          verify_code: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          created_by: string
          exam_id: string
          id?: string
          issued_at?: string
          session_id: string
          verify_code?: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          created_by?: string
          exam_id?: string
          id?: string
          issued_at?: string
          session_id?: string
          verify_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "reports_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "reports_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "reports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "review_queue"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "reports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_decisions: {
        Row: {
          decided_at: string
          decision: Database["public"]["Enums"]["review_decision"]
          exam_id: string
          note: string | null
          reviewer_id: string
          session_id: string
        }
        Insert: {
          decided_at?: string
          decision: Database["public"]["Enums"]["review_decision"]
          exam_id: string
          note?: string | null
          reviewer_id: string
          session_id: string
        }
        Update: {
          decided_at?: string
          decision?: Database["public"]["Enums"]["review_decision"]
          exam_id?: string
          note?: string | null
          reviewer_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_decisions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_decisions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_decisions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "review_decisions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "review_decisions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "review_decisions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_decisions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "review_queue"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "review_decisions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
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
            foreignKeyName: "session_commands_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "session_commands_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "session_commands_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
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
            referencedRelation: "review_queue"
            referencedColumns: ["session_id"]
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
          rules_accepted_at: string | null
          rules_locale: Database["public"]["Enums"]["locale"] | null
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
          rules_accepted_at?: string | null
          rules_locale?: Database["public"]["Enums"]["locale"] | null
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
          rules_accepted_at?: string | null
          rules_locale?: Database["public"]["Enums"]["locale"] | null
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
            foreignKeyName: "sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
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
          programme: string | null
          student_number: string
          workspace_id: string
          year: number | null
        }
        Insert: {
          email?: string | null
          full_name: string
          group_id?: string | null
          id?: string
          locale?: Database["public"]["Enums"]["locale"]
          programme?: string | null
          student_number: string
          workspace_id: string
          year?: number | null
        }
        Update: {
          email?: string | null
          full_name?: string
          group_id?: string | null
          id?: string
          locale?: Database["public"]["Enums"]["locale"]
          programme?: string | null
          student_number?: string
          workspace_id?: string
          year?: number | null
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
      verify_lookups: {
        Row: {
          at: string
          client_hash: string
          id: number
        }
        Insert: {
          at?: string
          client_hash: string
          id?: never
        }
        Update: {
          at?: string
          client_hash?: string
          id?: never
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string | null
          id: string
          name: string
          settings: Json
          slug: string
          timezone: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          settings?: Json
          slug: string
          timezone?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          settings?: Json
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
      review_queue: {
        Row: {
          decided_at: string | null
          decision: Database["public"]["Enums"]["review_decision"] | null
          exam_id: string | null
          faculty_id: string | null
          first_flag_at: string | null
          flag_types: string[] | null
          flags: number | null
          last_flag_received_at: string | null
          open_flags: number | null
          session_id: string | null
          student_id: string | null
          workspace_id: string | null
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
            foreignKeyName: "sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["last_exam_id"]
          },
          {
            foreignKeyName: "sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "term_sessions"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
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
      student_overview: {
        Row: {
          email: string | null
          exams_taken: number | null
          faculty_id: string | null
          faculty_name: string | null
          flags: number | null
          full_name: string | null
          group_code: string | null
          group_id: string | null
          id: string | null
          last_exam_at: string | null
          last_exam_id: string | null
          last_exam_title: string | null
          latest_decision: Database["public"]["Enums"]["review_decision"] | null
          latest_decision_at: string | null
          locale: Database["public"]["Enums"]["locale"] | null
          programme: string | null
          sessions_in_review: number | null
          student_number: string | null
          workspace_id: string | null
          year: number | null
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
      term_decisions: {
        Row: {
          all_faculties: boolean | null
          decision: Database["public"]["Enums"]["review_decision"] | null
          faculty_id: string | null
          sessions: number | null
          term: string | null
          term_start: string | null
          workspace_id: string | null
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
      term_exams: {
        Row: {
          day: string | null
          duration_min: number | null
          exam_id: string | null
          faculty_id: string | null
          starts_at: string | null
          term: string | null
          term_start: string | null
          week_start: string | null
          workspace_id: string | null
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
      term_flag_types: {
        Row: {
          all_faculties: boolean | null
          faculty_id: string | null
          flags: number | null
          term: string | null
          term_start: string | null
          type: string | null
          workspace_id: string | null
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
      term_kpis: {
        Row: {
          all_faculties: boolean | null
          committee: number | null
          decisions: number | null
          exams_run: number | null
          faculty_id: string | null
          first_day: string | null
          flagged_sessions: number | null
          flags: number | null
          last_day: string | null
          sessions: number | null
          term: string | null
          term_start: string | null
          workspace_id: string | null
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
      term_review_time: {
        Row: {
          all_faculties: boolean | null
          decisions: number | null
          faculty_id: string | null
          median_review_s: number | null
          term: string | null
          term_start: string | null
          week_start: string | null
          workspace_id: string | null
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
      term_sessions: {
        Row: {
          day: string | null
          decided_at: string | null
          decision: Database["public"]["Enums"]["review_decision"] | null
          duration_min: number | null
          exam_id: string | null
          faculty_id: string | null
          flags: number | null
          session_id: string | null
          starts_at: string | null
          term: string | null
          term_start: string | null
          week_start: string | null
          workspace_id: string | null
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
      term_weekly_flags: {
        Row: {
          all_faculties: boolean | null
          exams: number | null
          faculty_id: string | null
          flags: number | null
          flags_per_100: number | null
          sessions: number | null
          term: string | null
          term_start: string | null
          week_start: string | null
          workspace_id: string | null
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
      add_session_note: {
        Args: { session_id: string; text: string }
        Returns: string
      }
      assign_proctors: { Args: { exam_id: string; rows: Json }; Returns: Json }
      assignment_json: {
        Args: { p_exam_id: string; p_staff_id: string }
        Returns: Json
      }
      audit_read: {
        Args: { action: string; object_id?: string; object_type: string }
        Returns: undefined
      }
      call_edge_function: {
        Args: { p_body?: Json; p_name: string }
        Returns: number
      }
      caller_bypasses_rls: { Args: never; Returns: boolean }
      can_read_topic: { Args: { p_topic: string }; Returns: boolean }
      close_help_request: {
        Args: { id: string; reply?: string }
        Returns: Json
      }
      confirm_frames: {
        Args: { p_event_id: string; p_paths: string[] }
        Returns: string[]
      }
      confirm_seats: {
        Args: { change_request?: string; exam_id: string }
        Returns: Json
      }
      convert_verify_codes: { Args: never; Returns: number }
      create_share: { Args: { report_id: string }; Returns: Json }
      decide_session: {
        Args: {
          decision: Database["public"]["Enums"]["review_decision"]
          note?: string
          session_id: string
        }
        Returns: Json
      }
      exam_code_base: {
        Args: {
          p_course: string
          p_group: string
          p_starts_at: string
          p_tz: string
        }
        Returns: string
      }
      exam_code_latin: { Args: { p: string }; Returns: string }
      exam_draft_json: { Args: { p_exam_id: string }; Returns: Json }
      exam_has_open_flags: { Args: { p_exam_id: string }; Returns: boolean }
      exam_overview_counts: {
        Args: { p_exam_id: string }
        Returns: {
          flagged_events: number
          groups: string[]
          joined: number
          paused: number
          proctor_count: number
          roster_size: number
          sessions_final: number
          writing: number
        }[]
      }
      exam_question_count: { Args: { exam_id: string }; Returns: number }
      exam_started: { Args: { p_exam_id: string }; Returns: boolean }
      exam_workspace: { Args: { p_exam_id: string }; Returns: string }
      get_report: { Args: { session_id: string }; Returns: Json }
      has_session_in: { Args: { p_exam_id: string }; Returns: boolean }
      help_broadcast: { Args: { p_id: string }; Returns: undefined }
      help_json: { Args: { p_id: string }; Returns: Json }
      import_roster: { Args: { exam_id: string; rows: Json }; Returns: Json }
      ingest_batch: {
        Args: {
          p_events: Json
          p_owner?: string
          p_session_id: string
          p_status?: Json
        }
        Returns: Json
      }
      invoker_bypasses_rls: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
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
      json_number_between: {
        Args: { p: Json; p_int?: boolean; p_max: number; p_min: number }
        Returns: boolean
      }
      make_receipt_id: { Args: { p_student_id: string }; Returns: string }
      new_verify_code: { Args: never; Returns: string }
      normalize_verify_code: { Args: { p: string }; Returns: string }
      open_shared_report: { Args: { p_token_hash: string }; Returns: Json }
      owns_session: { Args: { p_session_id: string }; Returns: boolean }
      pending_pause_s: {
        Args: { s: Database["public"]["Tables"]["sessions"]["Row"] }
        Returns: number
      }
      pre_exam_rank: { Args: { p_state: string }; Returns: number }
      privacy_delete_check: {
        Args: { p_actor: string; p_request_id: string }
        Returns: {
          done_at: string | null
          done_by: string | null
          due_at: string
          export_path: string | null
          id: string
          kind: Database["public"]["Enums"]["data_request_kind"]
          received_at: string
          reply: string | null
          status: Database["public"]["Enums"]["data_request_status"]
          student_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "data_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      privacy_delete_plan: {
        Args: { p_actor: string; p_request_id: string }
        Returns: Json
      }
      privacy_delete_student: {
        Args: { p_actor: string; p_request_id: string; p_stills?: number }
        Returns: Json
      }
      privacy_export: {
        Args: { p_actor: string; p_request_id: string }
        Returns: Json
      }
      privacy_export_done: {
        Args: {
          p_actor: string
          p_bytes: number
          p_expires_at: string
          p_path: string
          p_request_id: string
        }
        Returns: Json
      }
      privacy_reply: {
        Args: { p_actor: string; p_reply: string; p_request_id: string }
        Returns: Json
      }
      privacy_request_for: {
        Args: {
          p_actor: string
          p_kind: Database["public"]["Enums"]["data_request_kind"]
          p_request_id: string
        }
        Returns: {
          done_at: string | null
          done_by: string | null
          due_at: string
          export_path: string | null
          id: string
          kind: Database["public"]["Enums"]["data_request_kind"]
          received_at: string
          reply: string | null
          status: Database["public"]["Enums"]["data_request_status"]
          student_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "data_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      receipt_initial: { Args: { p_word: string }; Returns: string }
      report_content: { Args: { p_session_id: string }; Returns: Json }
      report_content_hash: { Args: { p_session_id: string }; Returns: string }
      report_payload: { Args: { p_session_id: string }; Returns: Json }
      report_sync: {
        Args: { p_actor: string; p_session_id: string }
        Returns: {
          content_hash: string
          created_at: string
          created_by: string
          exam_id: string
          id: string
          issued_at: string
          session_id: string
          verify_code: string
        }
        SetofOptions: {
          from: "*"
          to: "reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_pilot: {
        Args: {
          demo_invite?: boolean
          email: string
          exam_size?: string
          message?: string
          name: string
          pilot_month?: string
          role?: string
          university: string
        }
        Returns: Json
      }
      retention_due: {
        Args: { p_limit?: number }
        Returns: {
          captured_at: string
          event_id: string
          exam_id: string
          frame_id: string
          session_id: string
          storage_path: string
          workspace_id: string
        }[]
      }
      revoke_share: { Args: { share_id: string }; Returns: Json }
      save_exam_draft: { Args: { exam: Json }; Returns: Json }
      schedule_exam: { Args: { exam_id: string }; Returns: Json }
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
      staff_may_share: { Args: never; Returns: boolean }
      start_exam: { Args: { exam_id: string }; Returns: Json }
      student_session_stats: {
        Args: never
        Returns: {
          exams_taken: number
          flags: number
          last_exam_at: string
          last_exam_id: string
          last_exam_title: string
          latest_decision: Database["public"]["Enums"]["review_decision"]
          latest_decision_at: string
          sessions_in_review: number
          student_id: string
        }[]
      }
      submit_session: { Args: { session_id: string }; Returns: Json }
      term_exam_flag_types: {
        Args: { p_exam_id: string }
        Returns: {
          flags: number
          type: string
        }[]
      }
      term_exam_sessions: {
        Args: { p_exam_id: string }
        Returns: {
          decided_at: string
          decision: Database["public"]["Enums"]["review_decision"]
          flags: number
          session_id: string
        }[]
      }
      term_key: { Args: { d: string }; Returns: string }
      term_session_rows: {
        Args: { p_exam_id: string }
        Returns: {
          decided_at: string
          decision: Database["public"]["Enums"]["review_decision"]
          flags: number
          session_id: string
        }[]
      }
      term_start: { Args: { d: string }; Returns: string }
      try_uuid: { Args: { p: string }; Returns: string }
      unused_verify_code: { Args: never; Returns: string }
      valid_browser_rules: { Args: { p: Json }; Returns: boolean }
      valid_checks: { Args: { p: Json }; Returns: boolean }
      valid_settings: { Args: { p: Json }; Returns: boolean }
      verify_report: {
        Args: { client_hash: string; code: string }
        Returns: Json
      }
      write_audit: {
        Args: {
          p_action: string
          p_actor_kind: string
          p_meta?: Json
          p_object_id: string
          p_object_type: string
          p_workspace: string
        }
        Returns: undefined
      }
    }
    Enums: {
      command_type:
        | "pause"
        | "resume"
        | "end"
        | "message"
        | "add_time"
        | "start"
      data_request_kind: "delete" | "copy"
      data_request_status: "received" | "done" | "replied"
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
      invite_state: "pending" | "sent" | "failed" | "bounced"
      locale: "kk" | "ru" | "en"
      review_decision: "no_issue" | "talk" | "committee"
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
      data_request_kind: ["delete", "copy"],
      data_request_status: ["received", "done", "replied"],
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
      invite_state: ["pending", "sent", "failed", "bounced"],
      locale: ["kk", "ru", "en"],
      review_decision: ["no_issue", "talk", "committee"],
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

