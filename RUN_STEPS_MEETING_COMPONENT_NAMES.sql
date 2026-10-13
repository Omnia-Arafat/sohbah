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
