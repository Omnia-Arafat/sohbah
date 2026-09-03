"use client";

/**
 * Submits its form only after the user confirms. For any delete that cannot
 * be undone, this keeps it from being one stray tap away from the button next
 * to it (approve, deactivate, edit).
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
