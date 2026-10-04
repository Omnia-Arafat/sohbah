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
  children,
  title,
}: {
  /** The button's text, or its accessible name when `children` draws an icon. */
  label: string;
  confirmMessage: string;
  className: string;
  children?: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      title={title}
      aria-label={children ? label : undefined}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {children ?? label}
    </button>
  );
}
