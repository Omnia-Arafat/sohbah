"use client";

/** The only interactive bit of the print page: everything else is static
 * server-rendered markup meant to be printed, not clicked. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary print:hidden"
    >
      {label}
    </button>
  );
}
