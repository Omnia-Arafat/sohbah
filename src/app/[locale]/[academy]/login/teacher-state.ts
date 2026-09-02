/**
 * Separate module for the same reason as the other forms: a `"use server"`
 * module may only export async functions.
 */

export type TeacherLoginValues = { phone: string; password: string };

export type TeacherLoginState =
  | { status: "idle" }
  | {
      status: "invalid";
      values: TeacherLoginValues;
      fieldErrors: Partial<Record<keyof TeacherLoginValues, string>>;
    }
  | { status: "failed"; values: TeacherLoginValues; reason: string };

export const initialTeacherLoginState: TeacherLoginState = { status: "idle" };
