import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: sohbah } = await admin.from('academies').select('id').eq('slug', 'sohbah').maybeSingle();
const { data: teachers } = await admin.from('teachers')
  .select('id, name, role, is_active, created_at')
  .eq('academy_id', sohbah.id)
  .or('name.ilike.%نوره%,name.ilike.%نورا%,name.ilike.%نورة%')
  .order('created_at');
console.log('candidates:', JSON.stringify(teachers, null, 1));

const { data: circle } = await admin.from('circles')
  .select('id, name, teacher_id, type, is_active')
  .eq('academy_id', sohbah.id)
  .eq('name', 'نوره')
  .maybeSingle();
console.log('circle "نوره":', JSON.stringify(circle, null, 1));
