import type { StaffRole, Teacher } from "@/lib/database.types";

/**
 * What each role may do, in one place.
 *
 * Every one of these is mirrored by a policy in the database
 * (`20260904140000_multi_role.sql`), and the database is what actually
 * enforces them — these functions decide what to *show*. A screen that hides
 * a button is a courtesy; a policy that refuses the write is the rule.
 *
 * A person holds several roles at once: معلمة who is also مشرفة, or مشرفة who
 * is also an admin. So these ask "does she hold this role", never "which role
 * is she".
 */

export function hasRole(teacher: Teacher, role: StaffRole): boolean {
  // A row written before the roles column existed would arrive without it.
  // Falling back to the legacy column keeps such a row from silently losing
  // its admin rights in the UI.
  const roles = teacher.roles ?? [teacher.role];
  return roles.includes(role);
}

export function isAdminRole(teacher: Teacher): boolean {
  return hasRole(teacher, "admin");
}

/** Supervisors and admins alike: edits any circle, manages the students. */
export function canSupervise(teacher: Teacher): boolean {
  return hasRole(teacher, "supervisor") || hasRole(teacher, "admin");
}

/** Editing a circle that belongs to someone else. Her own is always hers. */
export function canEditAnyCircle(teacher: Teacher): boolean {
  return canSupervise(teacher);
}

/** The students roster: editing and deleting student records. */
export function canManageStudents(teacher: Teacher): boolean {
  return canSupervise(teacher);
}

/** Approving staff, resetting passwords, granting roles, deleting circles. */
export function canManageStaff(teacher: Teacher): boolean {
  return isAdminRole(teacher);
}

/** Labels for the roles a person can be given, in the order they escalate. */
export const ASSIGNABLE_ROLES: StaffRole[] = ["supervisor", "admin"];
