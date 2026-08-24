/**
 * Hand-written to match supabase/migrations/20260804150000_init.sql.
 *
 * Once the migration is applied you can regenerate this file instead of
 * maintaining it by hand:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */

export type GenderCategory = "male" | "female";
export type CircleType = "tasheeh" | "tajweed" | "free_recitation";
export type AttendanceStatus = "pending" | "present" | "absent";
export type RecitationStatus = "waiting" | "reciting" | "done";
export type TeacherRole = "teacher" | "admin";

export type Academy = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  logo_path: string | null;
  primary_color: string;
  accent_color: string;
  is_active: boolean;
  created_at: string;
};

export type Teacher = {
  id: string;
  auth_user_id: string | null;
  name: string;
  gender_category: GenderCategory;
  role: TeacherRole;
  is_active: boolean;
  academy_id: string;
  created_at: string;
};

export type Student = {
  id: string;
  name: string;
  father_name: string;
  phone: string | null;
  gender_category: GenderCategory;
  search_key: string;
  academy_id: string;
  created_at: string;
};

export type Circle = {
  id: string;
  teacher_id: string;
  name: string;
  type: CircleType;
  gender_category: GenderCategory;
  session_link: string;
  timezone: string;
  start_time: string;
  duration_minutes: number;
  /** PostgreSQL dow convention: 0 = Sunday … 6 = Saturday. */
  days_of_week: number[];
  registration_slug: string;
  is_active: boolean;
  academy_id: string;
  created_at: string;
};

export type AttendanceRecord = {
  id: string;
  student_id: string;
  circle_id: string;
  session_date: string;
  queue_order: number;
  joined_at: string;
  attendance_status: AttendanceStatus;
  recitation_status: RecitationStatus;
  created_at: string;
};

export type CirclePublicInfo = {
  id: string;
  name: string;
  type: CircleType;
  gender_category: GenderCategory;
  session_link: string;
  start_time: string;
  timezone: string;
  session_date: string;
  meets_today: boolean;
  academy_id: string;
};

export type StudentSearchResult = {
  id: string;
  name: string;
  father_name: string;
};

export type JoinCircleResult = {
  attendance_id: string;
  session_date: string;
  queue_order: number;
  already_joined: boolean;
};

export type QueueEntry = {
  attendance_id: string;
  student_id: string;
  name: string;
  father_name: string;
  queue_order: number;
  attendance_status: AttendanceStatus;
  recitation_status: RecitationStatus;
  joined_at: string;
};

export type TeacherTodayCircle = {
  id: string;
  name: string;
  type: CircleType;
  gender_category: GenderCategory;
  start_time: string;
  timezone: string;
  registration_slug: string;
  session_date: string;
  joined_count: number;
};

export type AttendanceReportRow = {
  student_id: string;
  student_name: string;
  father_name: string;
  gender_category: GenderCategory;
  sessions_present: number;
  sessions_absent: number;
  sessions_unmarked: number;
  sessions_joined: number;
};

type Insert<T, Optional extends keyof T> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>;

/** Matches Supabase's generated shape: every table needs a Relationships key. */
type Empty = { [_ in never]: never };

export type Database = {
  public: {
    Tables: {
      academies: {
        Row: Academy;
        Insert: Insert<Academy, "id" | "created_at" | "is_active" | "description_ar" | "description_en" | "logo_path">;
        Update: Partial<Academy>;
        Relationships: [];
      };
      teachers: {
        Row: Teacher;
        Insert: Insert<Teacher, "id" | "created_at" | "role" | "is_active" | "auth_user_id">;
        Update: Partial<Teacher>;
        Relationships: [];
      };
      students: {
        Row: Student;
        Insert: Insert<Student, "id" | "created_at" | "search_key" | "phone" | "academy_id">;
        Update: Partial<Student>;
        Relationships: [];
      };
      circles: {
        Row: Circle;
        Insert: Insert<
          Circle,
          "id" | "created_at" | "is_active" | "timezone" | "duration_minutes" | "days_of_week" | "academy_id"
        >;
        Update: Partial<Circle>;
        Relationships: [];
      };
      attendance_records: {
        Row: AttendanceRecord;
        // Rows are created only by join_circle(); no RLS policy allows a direct
        // insert, so this type exists to satisfy the client, not to be used.
        Insert: Insert<AttendanceRecord, "id" | "created_at" | "joined_at">;
        Update: Partial<
          Pick<AttendanceRecord, "attendance_status" | "recitation_status" | "queue_order">
        >;
        Relationships: [];
      };
    };
    Views: Empty;
    Functions: {
      get_academy: {
        Args: { p_slug: string };
        Returns: Academy[];
      };
      circle_public_info: {
        Args: { p_slug: string };
        Returns: CirclePublicInfo[];
      };
      search_students: {
        Args: { p_slug: string; p_query: string };
        Returns: StudentSearchResult[];
      };
      find_similar_students: {
        Args: { p_name: string; p_father_name: string; p_gender: GenderCategory; p_academy_id: string };
        Returns: StudentSearchResult[];
      };
      join_circle: {
        Args: { p_slug: string; p_student_id: string };
        Returns: JoinCircleResult[];
      };
      circle_queue: {
        Args: { p_slug: string };
        Returns: QueueEntry[];
      };
      teacher_today_circles: {
        Args: Record<PropertyKey, never>;
        Returns: TeacherTodayCircle[];
      };
      reorder_queue: {
        Args: {
          p_circle_id: string;
          p_session_date: string;
          p_student_ids: string[];
        };
        Returns: undefined;
      };
      attendance_report: {
        Args: {
          p_from: string;
          p_to: string;
          p_gender?: GenderCategory | null;
          p_circle_id?: string | null;
          p_teacher_id?: string | null;
          p_academy_id?: string | null;
        };
        Returns: AttendanceReportRow[];
      };
    };
    Enums: Empty;
    CompositeTypes: Empty;
  };
};
