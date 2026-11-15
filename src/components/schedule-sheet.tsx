import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import {
  DAY_LEAF,
  DAY_NAMES,
  arNum,
  hasRange,
  meetingLine,
  rangeText,
  surahName,
  weekSurah,
  weekWord,
  type ScheduleWeek,
} from "@/lib/schedule-format";

/**
 * The printed weekly schedule: layout «هـ — غصن في إطار» from the design
 * canvas (the frame of layout D with the leaf vine of layout B).
 *
 * Drawn on an A4 page of 794 × 1123 CSS px. Every length is a multiple of
 * `--u`, one 794th of the sheet's width, so the same markup is a full A4 page
 * on paper and shrinks to fit a phone screen without an inner scrollbar.
 */

const u = (n: number) => `calc(${n} * var(--u))`;

const LEAF = "M7 1C12 5 12 13 7 17C2 13 2 5 7 1Z";

function Leaf({ size, fill, children }: { size: number; fill: string; children?: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        right: u(-54),
        top: "50%",
        width: u(size),
        height: u(size * 1.17),
        marginTop: u(-(size * 1.17) / 2),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg viewBox="0 0 14 18" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path d={LEAF} fill={fill} />
      </svg>
      {children}
    </span>
  );
}

export type ScheduleSheetProps = {
  trackName: string;
  cohortName: string | null;
  cohortStartDate: string | null;
  weekNumber: number;
  week: ScheduleWeek | null;
};

export function ScheduleSheet({
  trackName,
  cohortName,
  cohortStartDate,
  weekNumber,
  week,
}: ScheduleSheetProps) {
  const days = week?.days ?? [];
  const surah = week ? weekSurah(week.days) : null;
  const meeting = week?.days[0];
  const friday = week?.days[6];
  const when = week ? meetingLine(week, cohortStartDate) : "";

  const sheet: CSSProperties = {
    ["--u" as string]: "calc(100cqw / 794)",
    position: "relative",
    width: "100%",
    aspectRatio: "794 / 1123",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#1f2a1c",
    padding: u(24),
    fontFamily: "var(--font-cairo), sans-serif",
  };

  const rowBox = (border: string, bg: string): CSSProperties => ({
    position: "relative",
    flex: 1,
    display: "flex",
    border: `${u(1.5)} solid ${border}`,
    borderRadius: u(14),
    background: bg,
  });

  const dayCell = (border: string): CSSProperties => ({
    flex: "none",
    width: u(168),
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderInlineStart: "none",
    borderLeft: `${u(1.5)} solid ${border}`,
    padding: u(6),
    textAlign: "center",
  });

  return (
    <div style={{ containerType: "inline-size", width: "100%" }}>
      <div dir="rtl" style={sheet}>
        <div
          style={{
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            border: `${u(3)} solid #2f7d32`,
            borderRadius: u(22),
            padding: u(6),
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              border: `${u(1.5)} solid #9bc93b`,
              borderRadius: u(16),
              padding: `${u(24)} ${u(30)} ${u(18)}`,
              display: "flex",
              flexDirection: "column",
              gap: u(16),
            }}
          >
            <header style={{ display: "flex", alignItems: "center", gap: u(16) }}>
              <Image
                src="/assets/logos/sohbah-logo.webp"
                alt="صحبة"
                width={224}
                height={224}
                style={{ width: u(112), height: u(112), objectFit: "contain", flex: "none" }}
                priority
              />
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: u(4),
                  textAlign: "center",
                }}
              >
                <h1
                  style={{
                    margin: 0,
                    fontSize: u(30),
                    fontWeight: 900,
                    color: "#2f7d32",
                    lineHeight: 1.3,
                    textDecoration: "underline",
                    textDecorationColor: "#c9e27a",
                    textDecorationThickness: u(4),
                    textUnderlineOffset: u(8),
                  }}
                >
                  جدول حفظ القرآن الكريم
                </h1>
                <div style={{ display: "flex", alignItems: "center", gap: u(8), fontSize: u(17), fontWeight: 900, marginTop: u(6) }}>
                  <span style={{ color: "#7a1e3a" }}>{trackName}</span>
                  <svg aria-hidden="true" viewBox="0 0 14 18" style={{ width: u(10), height: u(13) }}>
                    <path d={LEAF} fill="#9bc93b" />
                  </svg>
                  <span style={{ color: "#2f5e1e" }}>{cohortName ?? "لكل الدفعات"}</span>
                </div>
                <span style={{ fontSize: u(21), fontWeight: 900 }}>
                  (الأسبوع {weekWord(weekNumber)}){" "}
                  {surah !== null && (
                    <span style={{ fontFamily: "var(--font-amiri), serif", color: "#2f7d32", fontSize: u(27) }}>
                      سورة {surahName(surah)}
                    </span>
                  )}
                </span>
                {week?.title && (
                  <span style={{ fontSize: u(14), fontWeight: 700, color: "#55624f" }}>{week.title}</span>
                )}
              </div>
              <svg aria-hidden="true" viewBox="0 0 96 96" style={{ flex: "none", width: u(96), height: u(96) }}>
                <path d="M48 90 C48 60 48 40 48 14" stroke="#4ca03a" strokeWidth="3" fill="none" strokeLinecap="round" />
                <g transform="translate(48 18)"><path d="M0 -14C7 -9 7 3 0 9C-7 3 -7 -9 0 -14Z" fill="#2f7d32" /></g>
                <g transform="translate(36 38) rotate(-50)"><path d="M0 -16C8 -10 8 3 0 10C-8 3 -8 -10 0 -16Z" fill="#4ca03a" /></g>
                <g transform="translate(60 46) rotate(50)"><path d="M0 -16C8 -10 8 3 0 10C-8 3 -8 -10 0 -16Z" fill="#9bc93b" /></g>
                <g transform="translate(35 64) rotate(-55)"><path d="M0 -14C7 -9 7 3 0 9C-7 3 -7 -9 0 -14Z" fill="#c9e27a" /></g>
                <g transform="translate(61 72) rotate(55)"><path d="M0 -14C7 -9 7 3 0 9C-7 3 -7 -9 0 -14Z" fill="#4ca03a" /></g>
              </svg>
            </header>

            <div
              style={{
                display: "flex",
                borderRadius: u(14),
                overflow: "hidden",
                border: `${u(2)} solid #2f7d32`,
                marginRight: u(58),
              }}
            >
              <span style={{ flex: "none", width: u(168), background: "#2f7d32", color: "#fff", fontSize: u(20), fontWeight: 900, padding: u(10), textAlign: "center" }}>
                اليوم
              </span>
              <span style={{ flex: 1, background: "#4ca03a", color: "#fff", fontSize: u(18), fontWeight: 900, padding: u(10), textAlign: "center" }}>
                الحفظ والتثبيت والمراجعة
              </span>
            </div>

            {!week ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `${u(2)} dashed #c9e3a3`,
                  borderRadius: u(16),
                  fontSize: u(20),
                  fontWeight: 800,
                  color: "#55624f",
                }}
              >
                لم يُكتب جدول هذا الأسبوع بعد
              </div>
            ) : (
              <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", gap: u(10), paddingRight: u(58) }}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 36 700"
                  preserveAspectRatio="none"
                  style={{ position: "absolute", right: u(6), top: u(-14), width: u(36), height: `calc(100% + ${u(14)})` }}
                >
                  <path d="M18 0 C30 80 6 160 18 240 C30 320 6 400 18 480 C30 560 6 630 18 700" fill="none" stroke="#9bc93b" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>

                <div style={rowBox("#e7c3cf", "#fdf6f8")}>
                  <Leaf size={38} fill="#7a1e3a" />
                  <div style={{ ...dayCell("#e7c3cf"), lineHeight: 1.4 }}>
                    <span style={{ fontSize: u(20), fontWeight: 900, color: "#7a1e3a" }}>{DAY_NAMES[0]}</span>
                    {when && <span style={{ fontSize: u(13), fontWeight: 800, color: "#4a1526" }}>{when}</span>}
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: `${u(8)} ${u(14)}`, fontSize: u(18), fontWeight: 800 }}>
                    <span>
                      {meeting?.notes || (meeting && hasRange(meeting) ? `تصحيح ${rangeText(meeting)}` : "")}
                      {meeting && hasRange(meeting) && meeting.notes && (
                        <span style={{ fontFamily: "var(--font-amiri), serif", color: "#7a1e3a", fontSize: u(21), marginRight: u(6) }}>
                          {rangeText(meeting)}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {days.slice(1, 6).map((d, i) => {
                  const toAyah = d.toAyah ?? 0;
                  const span = d.fromSurah !== null && d.fromSurah === d.toSurah ? toAyah : 0;
                  return (
                    <div key={d.dayIndex} style={rowBox("#cfe3a0", i % 2 ? "#ffffff" : "#f7fbee")}>
                      <Leaf size={42} fill={DAY_LEAF[i]}>
                        <span style={{ position: "relative", fontSize: u(15), fontWeight: 900, color: i >= 3 ? "#fff" : "#1f2a1c" }}>
                          {arNum(i + 1)}
                        </span>
                      </Leaf>
                      <div style={{ ...dayCell("#cfe3a0"), fontSize: u(22), fontWeight: 900, color: "#7a1e3a" }}>
                        {DAY_NAMES[d.dayIndex]}
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: u(4), padding: `${u(6)} ${u(14)}`, textAlign: "center" }}>
                        {hasRange(d) && (
                          <span style={{ fontSize: u(20), fontWeight: 800 }}>
                            حفظ سورة {surahName(d.fromSurah)}{" "}
                            <span style={{ fontFamily: "var(--font-amiri), serif", color: "#2f7d32", fontSize: u(24) }}>
                              {rangeText(d)}
                            </span>
                          </span>
                        )}
                        {d.review && <span style={{ fontSize: u(16), fontWeight: 700, color: "#3d4a38" }}>{d.review}</span>}
                        {d.notes && <span style={{ fontSize: u(14), fontWeight: 600, color: "#55624f" }}>{d.notes}</span>}
                        {span > 0 && span <= 40 && (
                          <span aria-hidden="true" style={{ display: "flex", gap: u(3) }}>
                            {Array.from({ length: Math.min(maxTo(days), 40) }, (_, k) => (
                              <svg key={k} viewBox="0 0 14 18" style={{ width: u(10), height: u(13) }}>
                                <path d={LEAF} fill={k < span ? "#9bc93b" : "#ffffff"} stroke="#4ca03a" strokeWidth="1.4" />
                              </svg>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div style={rowBox("#e8d3b0", "#fbf3e6")}>
                  <span
                    aria-hidden="true"
                    style={{ position: "absolute", right: u(-50), top: "50%", marginTop: u(-15), width: u(30), height: u(30), borderRadius: "50%", background: "#fff", border: `${u(3)} solid #c9a26b`, boxSizing: "border-box" }}
                  />
                  <div style={{ ...dayCell("#e8d3b0"), fontSize: u(22), fontWeight: 900, color: "#7a1e3a" }}>{DAY_NAMES[6]}</div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: u(20), fontWeight: 800, color: "#4a3218", padding: u(8) }}>
                    {friday?.notes || friday?.review || "راحة واستدراك"}
                  </div>
                </div>
              </div>
            )}

            <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: u(13), fontWeight: 800, color: "#3d4a38" }}>
              <span>المقرأة الإلكترونية للقرآن الكريم للنساء</span>
              <span style={{ color: "#7a1e3a", fontWeight: 900 }}>صُحبة · So7bah</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

/** How many leaves a day's progress row has: the furthest ayah the week reaches. */
function maxTo(days: ScheduleWeek["days"]): number {
  return days
    .filter((d) => d.dayIndex >= 1 && d.dayIndex <= 5 && d.fromSurah !== null && d.fromSurah === d.toSurah)
    .reduce((m, d) => Math.max(m, d.toAyah ?? 0), 0);
}
