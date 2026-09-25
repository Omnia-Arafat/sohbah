import { Fragment } from "react";

/**
 * Ayah text that has been through `attachMarks`, with each waqf sign raised
 * into the gap between its two words, above the line, as the Madinah page
 * sets it. Left inline, DigitalKhatt draws it on the baseline, where it reads
 * as a stray letter.
 */
export function QuranText({ text }: { text: string }) {
  // Odd indices are the captured signs.
  const parts = text.split(/ ([ۖ-ۛ])/);
  return (
    <>
      {parts.map((part, at) =>
        at % 2 === 1 ? (
          <span key={at} className="waqf">
            {` ${part}`}
          </span>
        ) : (
          <Fragment key={at}>{part}</Fragment>
        ),
      )}
    </>
  );
}
