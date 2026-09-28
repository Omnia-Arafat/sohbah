import { BadgeSvg } from "@/components/friday-badge";
import { drawDhikrBadge, type Family } from "@/lib/dhikr";

/** A ذكر challenge's badge at a stage, 0 (not started) to 4 (done). */
export function DhikrBadge({
  family,
  stage,
  size = 48,
  label,
}: {
  family: Family;
  stage: number;
  size?: number;
  label?: string;
}) {
  return <BadgeSvg drawing={drawDhikrBadge(family, stage)} size={size} label={label} />;
}
