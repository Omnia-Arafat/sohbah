import { Link } from "@/i18n/navigation";

type BackLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
};

/** Back navigation with an arrow that flips correctly in RTL. */
export function BackLink({ href, children, className = "" }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-300 ${className}`}
    >
      <span aria-hidden className="inline-block rtl:rotate-180">
        ←
      </span>
      {children}
    </Link>
  );
}

/** Forward chevron for card/list navigation; points the right way in RTL. */
export function ChevronForward({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={`${className} text-muted-foreground rtl:rotate-180`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}
