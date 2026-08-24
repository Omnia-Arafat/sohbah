/**
 * Kept out of `actions.ts` because a `"use server"` module may only export
 * async functions; anything else reaches the client as a server reference.
 */

export type LoginFieldErrors = Partial<Record<"email" | "password", string>>;

/** Reasons are keys, looked up by the form in the `auth.errors` namespace. */
export type LoginState =
  | { status: "idle" }
  | { status: "invalid"; email: string; fieldErrors: LoginFieldErrors }
  | { status: "failed"; email: string; reason: string };

export const initialLoginState: LoginState = { status: "idle" };
