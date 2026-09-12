-- Which kinds of circle keep a سجل تسميع.
--
-- The log records a range in the mushaf — من الكهف ١١ إلى ٢٦. That is the
-- substance of a تصحيح التلاوة، تجويد or تسميع حر session (24 of the academy's
-- 25 circles) and meaningless in a حديث circle, where the unit is a hadith and
-- `student_unit_progress` already records it.
--
-- A flag on the type rather than a hardcoded list, because `circle_types` is an
-- open, admin-managed table: an academy can add دورة تفسير tomorrow, and the
-- code must not need editing for it to behave correctly.
--
-- Defaults to true: a new type is far more likely to be Quran recitation than
-- not, and the cost of a wrong default is one toggle, not a lost record.

alter table public.circle_types
  add column if not exists records_recitation boolean not null default true;

comment on column public.circle_types.records_recitation is
  'Whether this kind of circle records a mushaf range per student (سجل التسميع).';

-- The one existing type where a mushaf range is not the point. Scoped by slug
-- across every academy that has it, since the slug is the internal key.
update public.circle_types
   set records_recitation = false
 where slug = 'hadith';
