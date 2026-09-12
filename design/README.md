# design/

Working sources for the redesign canvas — the artboards the published canvas
is seeded from, not a copy of the published thing.

`home/` holds one `.dc.html` per screen and a `canvas.json` that lays them out:
eleven current screens in one band on the «الريديزاين» page, and the two early
direction sketches on «مسودات متجاوزة», kept only for comparison.

Every screen here has now been built, except the two drills the self-test does
not do yet (المتشابهات and إخفاء الكلمات) and the الاختبارات screen.

**The Quranic text in `MushafMobile.dc.html` and `SelfTest.dc.html` was
generated from a published Uthmani edition, never typed.** Earlier drafts were
typed by hand and silently lost every waqf mark, then the sajdah and the hizb
quarter. If a screen here needs different ayat, regenerate them — do not edit
the text in place.

The seeded output (`sohbah-home-redesign.html`) is git-ignored: it is 2.7MB of
editor payload wrapped around these files, rebuilt by the design skill
whenever the canvas is republished.
