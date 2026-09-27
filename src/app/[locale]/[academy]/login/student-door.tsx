"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { SignIn } from "../me/me-client";
import {
  getMe,
  hasStudentCookie,
  meKey,
  setMe,
  writeStudentCookie,
} from "@/lib/me-store";

/**
 * The student's half of the front door: the same name-and-phone sign-in that
 * صفحتي uses, placed where she lands, then on to where she was going.
 *
 * `next` is the path proxy.ts turned her away from — a حلقة link from her
 * group, usually — so signing in takes her straight back to it.
 */
export function StudentDoor({
  academySlug,
  next,
}: {
  academySlug: string;
  next: string | null;
}) {
  const router = useRouter();
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const target = safeNext(next) ?? `/${academySlug}`;

  /*
    A student who signed in before this door existed has her identity in
    localStorage but no cookie, so the proxy sent her here. She is not asked
    again: the cookie is written from what her browser already holds and she
    goes on. An effect, because it is a sync with the browser, not render state.
  */
  useEffect(() => {
    const me = getMe(key);
    if (me && !hasStudentCookie()) {
      writeStudentCookie(me);
      router.replace(target);
      router.refresh();
    }
  }, [key, router, target]);

  return (
    <SignIn
      bare
      academySlug={academySlug}
      onFound={(found) => {
        setMe(key, found);
        router.replace(target);
        router.refresh();
      }}
    />
  );
}

/** Only a path on this site: never `//elsewhere` or a full URL. */
function safeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
