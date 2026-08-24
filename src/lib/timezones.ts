/**
 * A short, relevant list beats the full IANA database in a dropdown on a phone.
 * `trg_circles_validate_timezone` checks the submitted value against
 * `pg_timezone_names` regardless, so this list is a convenience, not the
 * validation boundary.
 */
export const TIMEZONE_OPTIONS = [
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Asia/Baghdad",
  "Asia/Amman",
  "Asia/Beirut",
  "Asia/Damascus",
  "Africa/Cairo",
  "Africa/Khartoum",
  "Africa/Tripoli",
  "Africa/Tunis",
  "Africa/Algiers",
  "Africa/Casablanca",
  "Asia/Karachi",
  "Asia/Jakarta",
  "Europe/Istanbul",
  "Europe/London",
  "America/New_York",
  "UTC",
] as const;

export const DEFAULT_TIMEZONE = "Asia/Riyadh";
