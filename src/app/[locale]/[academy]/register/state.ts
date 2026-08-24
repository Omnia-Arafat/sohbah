import type { StudentSearchResult } from "@/lib/database.types";

/**
 * The form state lives here rather than in `actions.ts` because every export of
 * a `"use server"` module is turned into a server *reference*. A plain object
 * exported from there would reach the client as an unresolvable proxy instead
 * of a value, so the initial state has to come from an ordinary module.
 */

export type RegisterValues = {
  name: string;
  phone: string;
  gender: string;
};

/**
 * Errors are returned as keys rather than sentences so the action stays
 * locale-agnostic; the form looks them up in the `register.errors` namespace.
 */
export type RegisterState =
  | { status: "idle" }
  | {
      status: "invalid";
      values: RegisterValues;
      fieldErrors: Partial<Record<keyof RegisterValues, string>>;
    }
  | { status: "failed"; values: RegisterValues; reason: string }
  | {
      status: "duplicate";
      values: RegisterValues;
      matches: StudentSearchResult[];
    }
  | { status: "success"; name: string; circleSlug: string | null };

export const initialRegisterState: RegisterState = { status: "idle" };
