# خطة: طبقة المحتوى والاختبارات (حلقة الحديث أولًا، والتجويد بعدها بصفر كود)

> **الحالة:** مسودة للمراجعة — لسه مفيش كود اتكتب.
> **التاريخ:** 2026-09-12
> **القرارات المعتمدة من صاحبة المنتج:**
> 1. هوية الطالب في الاختبار = **الاسم + رقم التليفون** (الرقم بقى مطلوب فعلًا في `students`).
> 2. الملفات = **رفع صور فعلي من التطبيق دلوقتي**، والروابط (Drive/Canva/YouTube) مدعومة جنبها من نفس اليوم.
> 3. البلان الكامل الأول، الكود بعد الموافقة.

---

## 0. الخلاصة في سطرين

مش بنبني "فيتشر حديث". بنبني **طبقة محتوى عامة** (منهج → وحدة → مواد → درس اليوم → تقدّم → اختبار)
مربوطة بـ `circle_types.slug`. حلقة الحديث هي أول عميل ليها، والتجويد يوم ما ييجي بيدخل
بإدخال بيانات منهج جديدة **من غير سطر كود واحد**.

---

## 1. اللي موجود بالفعل (متبنيش من أول السطر)

| الموجود | الملف | إزاي بنستفيد منه |
|---|---|---|
| `circle_types` جدول مفتوح يديره الأدمن | `supabase/migrations/20260830190000_circle_types.sql` | مفتاح الربط لكل الجداول الجديدة |
| **`hadith` مزروع فعلًا كنوع حلقة** | نفس الملف، سطر 85 | مش محتاجين ننشئ النوع |
| `is_admin_of(academy_id)` | نفس الملف | نفس باترن الـ RLS للجداول الجديدة |
| نظام الأدوار (معلمة / مشرفة / أدمن) | `src/lib/auth/roles.ts` + `20260904140000_multi_role.sql` | نفس دوال `canSupervise` / `isAdminRole` |
| باترن "لوحة مربوطة بنوع حلقة" | `20260903120000_schedule_boards.sql` | `quizzes.circle_type` نسخة منه بالحرف |
| طابور التسميع + الريل تايم | `attendance_records`, `circle_queue()` | مش هنلمسه — هنضيف جنبه |
| `normalize_phone()` + `students.phone_key` | `20260830140000_require_unique_phone.sql` | **أساس التحقق من هوية الطالب في الاختبار** |
| `searchable-select` / `multi-select` / `month-year-picker` | `src/components/` | كمبوننتس الدروب داون جاهزة |
| `attendance_report()` بفلتر `p_circle_type` | `20260830130000_report_recitation.sql` | نفس شكل التقارير الجديدة |

---

## 2. الريسرش: سايكل حلقة الحديث فعليًا

مناهج الحديث المعتمدة (الأربعون النووية، رياض الصالحين، عمدة الأحكام، بلوغ المرام) كلها
بتمشي بنفس الدورة الأسبوعية، والتجويد (تحفة الأطفال → المقدمة الجزرية) بيمشي بنفس
الدورة بالظبط مع اختلاف "الوحدة" و"التسميع":

| # | المرحلة | حلقة الحديث | حلقة التجويد | اللي لازم يتخزن |
|---|---|---|---|---|
| 1 | تحديد درس اليوم | الحديث رقم 12 | باب المد الفرعي | ربط الجلسة بوحدة |
| 2 | العرض والشرح | سلايدات/صور/PDF | نفسه | مرفقات |
| 3 | القراءة | النص + الراوي + التخريج + الدرجة | الأبيات + الشرح | نص + حقول مصدر |
| 4 | التسميع | الحديث غيبًا | تطبيق عملي على آيات | `recitation_status` (موجود) + **أي وحدة** |
| 5 | التراكم | "18 من 40 حديث" | "خلّصت باب النون الساكنة" | جدول تقدّم |
| 6 | الاختبار | كويز على الأحاديث اللي عدّت | كويز على الأبواب | محرك اختبارات |

**الخلاصة التصميمية:** الفرق بين النوعين بيانات، مش كود. الأعمدة الخاصة بالحديث
(`narrator`, `source_book`, `grade`) بتبقى `nullable` والتجويد بيسيبها فاضية.

المراجع اللي اتراجعت:
[أكاديمية الفرقان – مادة الحديث](https://forqanacademy.com/courses/مادة-الحديث/) ·
[الرواق – دورة حفظ الأربعين النووية](https://alrwak.com/memorizing-the-forty-hadith-of-nawawi-course/) ·
[دورة شرح وحفظ الأربعين النووية](https://www.alif-lam-meem.net/courses/hadeeth_40) ·
[أكاديمية شفيع – متون التجويد](https://shafe3academy.com/متون-التجويد/) ·
[نماذج أسئلة اختبارات التجويد](https://mtafsir.net/threads/نماذج-أسئلة-اختبارات-للتجويد.76319/)

---

## 3. المخطط (Schema)

كل الجداول: `academy_id` مطلوب، RLS شغال، والقراءة العامة تمر من دوال
`SECURITY DEFINER` زي `circle_public_info` — **الطالب مبيلمسش جدول مباشرة أبدًا**.

### 3.1 المنهج

```sql
-- منهج = "الأربعون النووية" تحت نوع hadith، أو "تحفة الأطفال" تحت نوع tajweed
create table public.curricula (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete cascade,
  circle_type   text not null,
  name_ar       text not null check (btrim(name_ar) <> ''),
  name_en       text not null check (btrim(name_en) <> ''),
  description   text,
  display_order int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint fk_curricula_type
    foreign key (academy_id, circle_type)
    references public.circle_types (academy_id, slug)
);
```

```sql
-- وحدة = حديث واحد، أو باب واحد من المتن
create table public.curriculum_units (
  id            uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  position      int  not null check (position > 0),
  title_ar      text not null,       -- "الحديث الأول: إنما الأعمال بالنيات"
  title_en      text not null,
  body          text,                -- نص الحديث كامل / أبيات المتن
  explanation   text,                -- الشرح (Markdown بسيط)
  -- حقول الحديث: كلها اختيارية عشان التجويد يسيبها فاضية
  narrator      text,                -- "عن عمر بن الخطاب رضي الله عنه"
  source_book   text,                -- "رواه البخاري ومسلم"
  source_ref    text,                -- "البخاري 1، مسلم 1907"
  grade         text,                -- "صحيح"
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint uq_unit_position unique (curriculum_id, position) deferrable initially deferred
);
```

> `deferrable` عشان إعادة الترتيب تتم في ترانزاكشن واحدة — نفس الحيلة المستخدمة في
> `uq_attendance_queue_position`.

### 3.2 المواد والسلايدات

```sql
create table public.materials (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete cascade,
  -- تتعلّق بوحدة (تظهر لكل حلقات المنهج) أو بحلقة بعينها
  unit_id      uuid references public.curriculum_units(id) on delete cascade,
  circle_id    uuid references public.circles(id) on delete cascade,
  kind         text not null check (kind in ('image','pdf','slides','audio','video','link')),
  title        text not null,
  url          text,            -- رابط خارجي (Drive / Canva / YouTube)
  storage_path text,            -- مسار داخل bucket اسمه 'materials'
  position     int  not null default 0,
  uploaded_by  uuid references public.teachers(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- واحد بالظبط من الاتنين، وواحد بالظبط من المالكين
  constraint ck_materials_source check (num_nonnulls(url, storage_path) = 1),
  constraint ck_materials_owner  check (num_nonnulls(unit_id, circle_id) = 1)
);
```

**التخزين:** bucket خاص اسمه `materials`، المسار `{academy_id}/{unit_or_circle_id}/{uuid}.{ext}`.
الرفع من Server Action بمفتاح الخدمة (`src/lib/supabase/admin.ts` موجود بالفعل) بعد التحقق
من الدور — أبسط وأأمن من سياسات Storage RLS. القراءة عن طريق **signed URL** قصير الأجل،
عشان محتوى أكاديمية بنات ميبقاش على لينك عام دائم.

حدود المرحلة الأولى (صور فقط، زي ما اتفقنا):
- الأنواع المسموحة للرفع: `image/jpeg`, `image/png`, `image/webp`
- الحجم الأقصى: **5 ميجا للصورة**، و**10 صور للوحدة**
- `pdf` / `slides` / `video` تتسجّل كـ **رابط** بس في المرحلة دي

### 3.3 درس اليوم

```sql
create table public.circle_sessions (
  circle_id    uuid not null references public.circles(id) on delete cascade,
  session_date date not null,
  unit_id      uuid references public.curriculum_units(id) on delete set null,
  note         text,
  updated_by   uuid references public.teachers(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (circle_id, session_date)
);
```

صف صغير واحد، **`attendance_records` متتلمسش خالص**. المعلمة تفتح الحلقة وتختار
"درس النهاردة"، والطالب يشوف النص + الصور فوق الطابور على طول.

### 3.4 التقدّم التراكمي

```sql
create table public.student_unit_progress (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  unit_id    uuid not null references public.curriculum_units(id) on delete cascade,
  circle_id  uuid references public.circles(id) on delete set null,
  status     text not null check (status in ('taught','recited','memorized')),
  score      numeric(5,2),
  notes      text,
  marked_by  uuid references public.teachers(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint uq_progress unique (student_id, unit_id)
);
```

### 3.5 محرك الاختبارات

```sql
create table public.quizzes (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete cascade,
  -- نطاق الاختبار: النوع مطلوب، والمنهج والحلقة اختياريين (null = كل حلقات النوع)
  circle_type       text not null,
  curriculum_id     uuid references public.curricula(id) on delete set null,
  circle_id         uuid references public.circles(id) on delete cascade,
  title             text not null,
  instructions      text,
  opens_at          timestamptz,
  closes_at         timestamptz,
  duration_minutes  int check (duration_minutes between 1 and 480),
  pass_score        numeric(5,2) not null default 50,
  max_attempts      int not null default 1 check (max_attempts between 1 and 10),
  shuffle_questions boolean not null default true,
  show_results      text not null default 'after_submit'
                      check (show_results in ('never','after_submit','after_close')),
  is_published      boolean not null default false,
  created_by        uuid references public.teachers(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint fk_quizzes_type
    foreign key (academy_id, circle_type)
    references public.circle_types (academy_id, slug)
);

create table public.quiz_questions (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes(id) on delete cascade,
  unit_id    uuid references public.curriculum_units(id) on delete set null,
  position   int  not null,
  kind       text not null check (kind in ('mcq','multi','true_false','short_text','fill_blank')),
  prompt     text not null,
  media_url  text,
  points     numeric(5,2) not null default 1,
  constraint uq_question_position unique (quiz_id, position) deferrable initially deferred
);

create table public.quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  position    int  not null,
  text        text not null,
  is_correct  boolean not null default false
);

create table public.quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  circle_id    uuid references public.circles(id) on delete set null,
  attempt_no   int  not null default 1,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  auto_score   numeric(6,2),
  manual_score numeric(6,2),
  max_score    numeric(6,2),
  status       text not null default 'in_progress'
                 check (status in ('in_progress','submitted','graded')),
  constraint uq_attempt unique (quiz_id, student_id, attempt_no)
);

create table public.quiz_answers (
  attempt_id     uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id    uuid not null references public.quiz_questions(id) on delete cascade,
  option_ids     uuid[],
  text_answer    text,
  is_correct     boolean,
  awarded_points numeric(5,2),
  primary key (attempt_id, question_id)
);
```

**`quiz_options` مقفولة تمامًا على الطالب.** لو الطالب قدر يقرأ الجدول دا، الـ `is_correct`
بتفضح الإجابات. فمفيش سياسة `select` لـ `anon` عليه إطلاقًا — الأسئلة بتوصل الطالب
من خلال دالة `quiz_for_student()` اللي بتشيل العمود دا قبل ما ترجّع.

---

## 4. الأمان: هوية الطالب في الاختبار

الطلاب **ملهمش حسابات**. الـ slug بتاع الحلقة هو كلمة السر الوحيدة. الحل المعتمد:
**الاسم + رقم التليفون**.

```sql
create or replace function public.start_quiz_attempt(
  p_slug text, p_quiz_id uuid, p_student_id uuid, p_phone text
) returns ... language plpgsql security definer ...
```

القواعد اللي بتتنفذ جوه الدالة:

1. الطالب لازم يكون في نفس الأكاديمية ونفس القسم (male/female) بتاع الحلقة.
2. `normalize_phone(p_phone) = students.phone_key` للطالب المختار — وإلا `raise 'phone_mismatch'`.
3. الاختبار لازم يكون `is_published` وداخل نافذة `opens_at`/`closes_at`.
4. الحلقة لازم تكون في نطاق الاختبار (نفس `circle_id` أو نفس `circle_type`).
5. عدد المحاولات لسه فيه متسع (`max_attempts`).

> **حدود معروفة مكتوبة بصراحة:**
> (أ) الإخوات بيشاركوا نفس رقم واتساب الأم — فأخ يقدر يحل مكان أخته. مقبول: بيحصل في
> الورق برضو، والاسم بيفضل مسجّل.
> (ب) `normalize_phone` مبتحلّش كود الدولة (موثّقة في `20260830140000`) — فالطالب اللي
> سجّل بـ `0501234567` لازم يدخل نفس الصيغة. **العلاج:** الفورم بيقارن بآخر 9 أرقام
> كمان (`right(phone_key, 9)`) عشان `+966` مقابل `0` ميوقعوش الطالب.
> (ج) رقم التليفون مطلوب بقيد `NOT VALID` — يعني صفوف قديمة ممكن تكون بلا رقم. الطالب
> دا هيتقال له "كلّمي المشرفة" بدل رسالة خطأ غامضة.

**المحاولة المنتهية:** السيرفر بيحسب `started_at + duration_minutes` ويرفض أي إجابة بعده —
العدّاد في المتصفح للعرض بس، مش هو الحكم.

---

## 5. الصلاحيات (RLS)

| الجدول | معلمة | مشرفة | أدمن | طالب (anon) |
|---|---|---|---|---|
| `curricula` / `curriculum_units` | قراءة | قراءة + كتابة | الكل | من خلال دالة بس |
| `materials` (على حلقتها) | الكل | الكل | الكل | من خلال دالة بس |
| `materials` (على وحدة منهج) | قراءة | الكل | الكل | من خلال دالة بس |
| `circle_sessions` | حلقتها هي | أي حلقة | الكل | من خلال دالة بس |
| `student_unit_progress` | طلاب حلقتها | الكل | الكل | لأ |
| `quizzes` / `questions` | بتاعة حلقتها | الكل | الكل | من خلال دالة بس |
| `quiz_options` | كتابة | كتابة | كتابة | **ممنوع نهائيًا** |
| `quiz_attempts` / `answers` | تصحيح بتوع حلقتها | الكل | الكل | صفّها هي بس، عبر الدوال |

نفس الباترن الموجود بالحرف: `is_admin_of(academy_id)` للأدمن، و`current_teacher_id()`
لملكية الحلقة، و`canSupervise()` في الواجهة بيخفي الأزرار (والسياسة هي اللي بترفض الكتابة فعلًا).

---

## 6. الدوال العامة (RPCs)

| الدالة | لمين | بترجّع إيه |
|---|---|---|
| `circle_lesson(p_slug)` | anon | درس اليوم: عنوان الوحدة، النص، الراوي، المصدر، الدرجة، الملاحظة |
| `circle_materials(p_slug)` | anon | مواد اليوم (وحدة + حلقة) مع signed URLs |
| `circle_quizzes(p_slug)` | anon | الاختبارات المنشورة المتاحة للحلقة دي دلوقتي |
| `start_quiz_attempt(p_slug, p_quiz_id, p_student_id, p_phone)` | anon | `attempt_id` بعد التحقق من الاسم + الرقم |
| `quiz_for_student(p_attempt_id)` | anon | الأسئلة والخيارات **بدون `is_correct`**، مرتّبة عشوائيًا لو مطلوب |
| `save_quiz_answer(p_attempt_id, p_question_id, ...)` | anon | حفظ تلقائي إجابة بإجابة |
| `submit_quiz_attempt(p_attempt_id)` | anon | تصحيح آلي + الدرجة حسب `show_results` |
| `curriculum_progress_report(...)` | authenticated | كام وحدة اتحفظت لكل طالب |
| `quiz_report(p_from, p_to, p_circle_type, p_circle_id, p_quiz_id)` | authenticated | الدرجات والنِسَب، بنفس شكل `attendance_report` |

التصحيح الآلي: `mcq` / `multi` / `true_false` / `fill_blank` (مقارنة بعد `normalize_ar`).
`short_text` بيتسجّل `is_correct = null` ويستنى المعلمة → المحاولة تفضل `submitted`
لحد ما تتصحح وتبقى `graded`.

---

## 7. الشاشات

### إدارة (مشرفة / أدمن)
| المسار | المحتوى |
|---|---|
| `/[academy]/admin/curricula` | قائمة المناهج، مفلترة بنوع الحلقة |
| `/[academy]/admin/curricula/new` | إنشاء منهج (النوع من dropdown `circle_types`) |
| `/[academy]/admin/curricula/[id]` | وحدات المنهج، إعادة ترتيب، مواد لكل وحدة |
| `/[academy]/admin/curricula/[id]/units/[unitId]/edit` | نص الحديث، الراوي، المصدر، الدرجة، الشرح، رفع الصور |
| `/[academy]/admin/quizzes` | قائمة الاختبارات + فلتر بالنوع |
| `/[academy]/admin/quizzes/new` | **الدروب داون المتسلسل** (تحت) |
| `/[academy]/admin/quizzes/[id]/questions` | بناء الأسئلة |
| `/[academy]/admin/quizzes/[id]/results` | النتائج + تصحيح المقالي يدويًا |

**الدروب داون المتسلسل، بالظبط زي ما طلبتي:**

```
نوع الحلقة  [حديث ▾]
     ↓ (يحمّل اللي تحته)
المنهج      [الأربعون النووية ▾]        ← اختياري
     ↓
الحلقة      [كل حلقات الحديث / حلقة الثلاثاء 5 م ▾]   ← "الكل" يعني circle_id = null
     ↓
الوحدات     [حديث 1 … حديث 12 ▾ متعدد]   ← لتوليد الأسئلة أو ربطها
```

نفس الكمبوننت يشتغل للتجويد لما تختاري `تجويد` في أول dropdown. **صفر تعديل كود.**

### المعلمة داخل الحلقة (`/dashboard/circle/[id]`)
تبويبات فوق الطابور الموجود: **الطابور** | **درس اليوم** | **المواد** | **الاختبارات**
- "درس اليوم": اختيار الوحدة + ملاحظة + زر "التالي في المنهج"
- عند تعليم طالب `recitation_status = 'done'` → يتكتب تلقائيًا صف في `student_unit_progress`

### الطالب (`/circle/[slug]`)
كارت **"درس اليوم"** فوق الطابور: نص الحديث + الراوي + التخريج + الصور.
وكارت **"اختبار متاح"** لو فيه اختبار مفتوح → `/circle/[slug]/quiz/[quizId]`
→ شاشة تحقق (الاسم من البحث الموجود + رقم التليفون) → الأسئلة → النتيجة.

### الترجمة
مفاتيح جديدة في `messages/ar.json` و`en.json`: `curriculum`, `materials`, `lesson`, `quiz`.
وعناصر تنقّل جديدة في `side-nav.tsx` و`bottom-nav.tsx`: **المناهج** (أيقونة `BookOpen`) و**الاختبارات** (أيقونة `ClipboardList`).

---

## 8. المراحل

| المرحلة | المحتوى | Migrations | صفحات | الناتج |
|---|---|---|---|---|
| **P0** | المنهج والوحدات + شاشات الإدارة | `20260912100000_curricula.sql` | 4 | المشرفة تدخل الأربعين النووية |
| **P1** | المواد + رفع الصور + درس اليوم + عرضه للطالب | `20260912110000_materials.sql`, `..120000_circle_sessions.sql` | 3 | الطالب يشوف الحديث والصور |
| **P2** | محرك الاختبارات: بناء + حل + تصحيح آلي | `..130000_quizzes.sql`, `..140000_quiz_rpcs.sql` | 5 | الكويز شغال آخره لآخره |
| **P3** | التقدّم + التقارير + تصحيح المقالي | `..150000_progress_reports.sql` | 3 | "حفظت 18/40" في التقارير |
| **P4** | إدخال منهج التجويد | لا شيء | لا شيء | **صفر كود** |

كل مرحلة قابلة للشحن لوحدها. P0+P1 لوحدهم بيدّوا قيمة حقيقية للمعلمة من غير أي اختبارات.

---

## 9. المخاطر والقرارات المفتوحة

| # | المخاطرة | الحل المتبنّى |
|---|---|---|
| 1 | تسريب إجابات `quiz_options` | مفيش `select` لـ `anon` خالص؛ الأسئلة تمر من دالة بتشيل `is_correct` |
| 2 | الإخوات بنفس الرقم | مقبول ومُوثّق — الاسم بيفضل مسجّل على المحاولة |
| 3 | صيغ الأرقام (`+966` مقابل `0`) | مقارنة بآخر 9 أرقام كمان |
| 4 | طالب قديم من غير رقم | رسالة "كلّمي المشرفة" بدل خطأ غامض |
| 5 | حجم التخزين (الباقة المجانية 1 جيجا) | صور فقط، 5 ميجا للصورة، 10 للوحدة + عدّاد استهلاك في لوحة الأدمن |
| 6 | الطالب يقفل المتصفح وسط الاختبار | حفظ تلقائي إجابة بإجابة؛ المحاولة تُستأنف لو الوقت لسه فاضل |
| 7 | التوقيت والوقت المنتهي | السيرفر هو الحكم؛ عدّاد المتصفح للعرض بس |
| 8 | حذف وحدة مربوطة بأسئلة | `on delete set null` على `quiz_questions.unit_id` — السؤال يعيش والربط بس بيروح |

**لسه محتاج قرارك (مش مانع للبدء):**
- **ترتيب البدء:** P0+P1 الأول (المُوصى به) ولا نقفز على الاختبارات؟
- هل المعلمة العادية تقدر تنشئ اختبار لحلقتها، ولا الاختبارات للمشرفة بس؟
  (الخطة الحالية: **المعلمة تقدر لحلقتها هي فقط**)
- عدد الأحاديث في أول منهج (40؟) — بيحدد لو محتاجين استيراد جماعي ولا إدخال يدوي يكفي.
