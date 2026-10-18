"use client";

import { useEffect, useState } from "react";

const NOT_TYPED = new Set(["button", "checkbox", "radio", "submit", "reset", "file", "range", "color", "hidden", "image"]);

function isTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NOT_TYPED.has(target.type);
}

/**
 * True while a text field has focus — on a phone, while the keyboard is up.
 *
 * A bar fixed to the bottom of the screen rides up above an Android keyboard,
 * and Chrome scrolls the focused field to sit just above the keyboard: exactly
 * where the bar now is. The field ends up behind it, so a معلمة typing a name
 * sees the keyboard and none of her letters. The bottom bars hide while this
 * is true.
 */
export function useTyping() {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      if (isTextField(event.target)) setTyping(true);
    }
    function onFocusOut(event: FocusEvent) {
      // Moving straight from one field to the next keeps the bar hidden.
      if (!isTextField(event.relatedTarget)) setTyping(false);
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return typing;
}
