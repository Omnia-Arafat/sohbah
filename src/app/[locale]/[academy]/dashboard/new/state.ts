/**
 * Kept out of `actions.ts` because a `"use server"` module may only export
 * async functions.
 */

/**
 * Neither the circle name nor the registration slug is a form field:
 *  - the name is always the owning teacher's name;
 *  - the slug is generated server-side, because it is effectively the
 *    credential for the circle page and should not be guessable or
 *    hand-picked.
 */
export type CircleValues = {
  name: string;
  /** Who the circle belongs to. Only an admin may set it to somebody else. */
  teacherId: string;
  type: string;
  gender: string;
  sessionLink: string;
  timezone: string;
  startTime: string;
  duration: string;
  /** PostgreSQL dow convention: 0 = Sunday … 6 = Saturday. */
  days: number[];
};

export type CircleFieldErrors = Partial<Record<keyof CircleValues, string>>;

export type NewCircleState =
  | { status: "idle" }
  | {
      status: "invalid";
      values: CircleValues;
      fieldErrors: CircleFieldErrors;
    }
  | { status: "failed"; values: CircleValues; reason: string };

export const initialNewCircleState: NewCircleState = { status: "idle" };
