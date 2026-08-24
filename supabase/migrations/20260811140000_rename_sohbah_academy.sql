-- Rename academy display names
update public.academies
set
  name_ar = 'مقراءة إتقان الإلكترونية',
  name_en = 'Itqan Online Recitation'
where slug = 'itqan';

update public.academies
set
  name_ar = 'مقراءة صحبة الإلكترونية',
  name_en = 'Sohbah Online Recitation'
where slug = 'sohbah';

-- Fix Sohbah admin display names copied from Itqan setup
update public.teachers
set name = 'مشرف صحبة'
where academy_id = (select id from public.academies where slug = 'sohbah')
  and role = 'admin'
  and (
    name ilike '%إتقان%'
    or name ilike '%itqan%'
    or name ilike '%sohbah admin%'
  );

update public.teachers
set name = 'مشرف إتقان'
where academy_id = (select id from public.academies where slug = 'itqan')
  and role = 'admin'
  and (
    name ilike '%صحبة%'
    or name ilike '%sohbah%'
  );
