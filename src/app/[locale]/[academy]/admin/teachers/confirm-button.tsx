"use client";

/**
 * Submits its form only after the admin confirms. Deleting a teacher cannot be
 * undone from anywhere in the app, so it should not be one stray tap away from
 * the approve button next to it.
 */
export function ConfirmButton({
  label,
  confirmMessage,
  className,
}: {
  label: string;
  confirmMessage: string;
  className: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
