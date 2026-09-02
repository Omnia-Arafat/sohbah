create or replace function public.normalize_phone(txt text)
returns text
language sql
immutable
as $$
  select nullif(
           regexp_replace(

             regexp_replace(btrim(coalesce(txt, '')), '^00', ''),
             '[^0-9]', '', 'g'
           ),
           ''
         )
$$;
