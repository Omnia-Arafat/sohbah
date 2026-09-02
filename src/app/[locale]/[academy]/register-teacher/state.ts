/**
 * Separate from `actions.ts` for the same reason as the student form: every
 * export of a `"use server"` module becomes a server *reference*, so a plain
 * object exported from there would reach the client as an unresolvable proxy.
 */

export type TeacherApplicationValues = {
  name: string;
  phone: string;
  role: string;
  password: string;
};

export type TeacherApplicationState =
  | { status: "idle" }
  | {
      status: "invalid";
      values: TeacherApplicationValues;
      fieldErrors: Partial<Record<keyof TeacherApplicationValues, string>>;
    }
  | { status: "failed"; values: TeacherApplicationValues; reason: string }
  | { status: "success"; name: string };

export const initialTeacherApplicationState: TeacherApplicationState = {
  status: "idle",
};
