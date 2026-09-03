import type { SupabaseClient } from "@supabase/supabase-js";
import type { Circle, Database, ScheduleBoard } from "@/lib/database.types";

/** 0 = Sunday … 6 = Saturday, matching PostgreSQL's `dow`. */
export const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export type ScheduleEntry = {
  circleId: string;
  circleName: string;
  teacherName: string;
  /** HH:MM, as stored — `circles.start_time` is a wall-clock time. */
  startTime: string;
  timezone: string;
  genderCategory: Circle["gender_category"];
  /** Lets a visitor go straight from the timetable to the circle's page. */
  registrationSlug: string;
};

export type ScheduleDay = {
  day: number;
  entries: ScheduleEntry[];
};

export type LoadedBoard = {
  board: ScheduleBoard;
  days: ScheduleDay[];
  /** 0-6 in the board's own timezone, or null when it holds no circles. */
  todayIndex: number | null;
};

export async function loadScheduleBoards(
  supabase: SupabaseClient<Database>,
  academyId: string,
  { publishedOnly = true }: { publishedOnly?: boolean } = {},
): Promise<ScheduleBoard[]> {
  let query = supabase
    .from("schedule_boards")
    .select("*")
    .eq("academy_id", academyId)
    .order("display_order")
    .order("created_at");

  if (publishedOnly) query = query.eq("is_published", true);

  const { data, error } = await query;
  if (error) {
    console.error("schedule_boards load failed", error);
    return [];
  }
  return data ?? [];
}

/**
 * Fills every board with the circles it covers, grouped by weekday.
 *
 * One call serves every board on the page rather than one per board: a busy
 * academy can publish a board per circle type, and the per-board version of
 * this was the page's whole cost.
 *
 * Read through `academy_schedule` rather than the `circles` table directly.
 * The timetable is public, and `circles` is staff-only for a reason — the row
 * holds the session link — so the function hands back the public columns plus
 * the teacher's name and nothing else.
 */
export async function loadBoardsWithCircles(
  supabase: SupabaseClient<Database>,
  academyId: string,
  boards: ScheduleBoard[],
): Promise<LoadedBoard[]> {
  if (boards.length === 0) return [];

  const { data: circles, error } = await supabase.rpc("academy_schedule", {
    p_academy_id: academyId,
  });

  if (error) {
    console.error("schedule circles load failed", error);
    return boards.map((board) => ({ board, days: [], todayIndex: null }));
  }

  return boards.map((board) => {
    const matching = (circles ?? []).filter(
      (circle) =>
        circle.type === board.circle_type &&
        (board.gender_category === null ||
          circle.gender_category === board.gender_category) &&
        withinWindow(circle.start_time, board.start_from, board.start_to),
    );

    const days = WEEK_DAYS.map((day) => ({
      day,
      entries: matching
        .filter((circle) => circle.days_of_week.includes(day))
        .map((circle) => ({
          circleId: circle.id,
          circleName: circle.name,
          teacherName: circle.teacher_name,
          startTime: String(circle.start_time).slice(0, 5),
          timezone: circle.timezone,
          genderCategory: circle.gender_category,
          registrationSlug: circle.registration_slug,
        })),
    })).filter((entry) => entry.entries.length > 0);

    return {
      board,
      days,
      todayIndex: days.length > 0 ? weekdayIn(matching[0]?.timezone) : null,
    };
  });
}

/**
 * Inclusive on both ends, and each end optional: a board with neither bound
 * takes every hour of its type, which is what an unfiltered board means.
 *
 * Compared as plain HH:MM strings — `circles.start_time` is a wall-clock time
 * in the circle's own timezone, never an instant, so lexical order is the same
 * as clock order and no date arithmetic can drift it.
 */
function withinWindow(
  startTime: string,
  from: string | null,
  to: string | null,
): boolean {
  const time = String(startTime).slice(0, 5);
  if (from && time < String(from).slice(0, 5)) return false;
  if (to && time > String(to).slice(0, 5)) return false;
  return true;
}

/**
 * Which weekday it is where the circles actually run, not where the server or
 * the visitor happens to be — an academy on Riyadh time has already started
 * Sunday while much of the world is still on Saturday.
 */
function weekdayIn(timezone: string | undefined): number {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  try {
    const short = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Asia/Riyadh",
      weekday: "short",
    }).format(new Date());
    const index = names.indexOf(short);
    return index === -1 ? new Date().getDay() : index;
  } catch {
    // An unknown IANA name in the data should dim the "today" highlight, not
    // take the whole page down with it.
    return new Date().getDay();
  }
}
