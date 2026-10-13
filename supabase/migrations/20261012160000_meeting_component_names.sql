-- The three بنود of the weekly لقاء, named as the academy marks them.
--
-- The seed (20260921140000_tracks.sql) named them after a draft of the
-- announcement. The academy's own scoring sheet is:
--   تسميع الماضي ٥ · تسميع الجديد ٥ · تلاوة الحفظ الجديد ٥  = ١٥
-- plus ٥ × ٥ أيام سرد = ٢٥, for ٤٠ a week. Points and order are unchanged.
--
-- DATA ONLY: renames existing rows. No schema change. Safe while live:
-- nothing had recorded a score against these rows yet.
--
-- Rollback:
--   update public.track_meeting_components set name_ar = 'حضور التسميع',       name_en = 'Recitation attendance'   where display_order = 1;
--   update public.track_meeting_components set name_ar = 'حضور سؤال المراجعة', name_en = 'Review question'         where display_order = 2;
--   update public.track_meeting_components set name_ar = 'حضور تصحيح الجديد',  name_en = 'New-material correction' where display_order = 3;

begin;

update public.track_meeting_components
   set name_ar = 'تسميع الماضي', name_en = 'Past recitation'
 where name_ar = 'حضور التسميع';

update public.track_meeting_components
   set name_ar = 'تسميع الجديد', name_en = 'New recitation'
 where name_ar = 'حضور سؤال المراجعة';

update public.track_meeting_components
   set name_ar = 'تلاوة الحفظ الجديد', name_en = 'Reading the new portion'
 where name_ar = 'حضور تصحيح الجديد';

commit;
