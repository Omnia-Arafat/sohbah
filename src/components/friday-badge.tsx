import { drawBadge } from "@/lib/friday-badges";

/**
 * One تحدي الجمعة badge, drawn from its number.
 *
 * The shape comes from `BADGE_SHAPE` in `friday-badges.ts` — change it there,
 * not here. The share image draws from the same data, so a badge in the app
 * and in the WhatsApp group are the same badge.
 *
 * `size` is the HEIGHT; the leaf is wider than it is tall when its side
 * leaves fan out, and the width follows the drawing.
 */
export function FridayBadge({
  milestone,
  size = 48,
  locked = false,
  label,
}: {
  milestone: number;
  size?: number;
  locked?: boolean;
  /** Spoken name; the badge is decorative when omitted. */
  label?: string;
}) {
  const { viewBox, aspect, parts } = drawBadge(milestone, { locked });

  return (
    <svg
      width={Math.round(size * aspect)}
      height={size}
      viewBox={viewBox}
      className="shrink-0"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {parts.map((p, i) => {
        switch (p.kind) {
          case "path":
            return (
              <path
                key={i}
                d={p.d}
                fill={p.fill}
                fillOpacity={p.fill === "none" ? undefined : p.opacity}
                stroke={p.stroke}
                strokeOpacity={p.fill === "none" ? p.opacity : undefined}
                strokeWidth={p.strokeWidth}
                strokeDasharray={p.dash}
                strokeLinecap="round"
                transform={p.transform}
              />
            );
          case "circle":
            return (
              <circle
                key={i}
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
                strokeOpacity={p.strokeOpacity}
                strokeDasharray={p.dash}
              />
            );
          case "rect":
            return (
              <rect
                key={i}
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                rx={p.rx}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
                strokeDasharray={p.dash}
              />
            );
          case "text":
            return (
              <text
                key={i}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                fontSize={p.size}
                fontWeight={700}
                fill={p.fill}
                style={{ fontFamily: "var(--font-cairo), sans-serif" }}
              >
                {p.text}
              </text>
            );
        }
      })}
    </svg>
  );
}
