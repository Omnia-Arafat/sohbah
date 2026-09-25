/**
 * Fills "اختبار الدرس الثالث من باب الهمزات" with its ten questions, 2026-09-25.
 *
 * The quiz row itself was created by the admin from the UI (tajweed, circle
 * وسام لطفي); this only adds questions and options to it. The answer key is
 * the teacher's, as she confirmed it; Q3's option ب carries the key's full
 * wording, since the shorter option text matched no answer.
 *
 * Refuses to run if the quiz already has questions, so it cannot double them.
 * Dry run by default. Apply with:  node scripts/seed-hamzat-lesson3-quiz.mjs --apply
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SOHBAH = "1bbbeae7-9479-48a0-a67f-6075ffb8ad10";
const QUIZ_ID = "cd11bb0c-cc60-4ab8-87a0-56c93e890b12";
const apply = process.argv.includes("--apply");

// [prompt, options, index of the correct option]
const QUESTIONS = [
  [
    "تقدم همزة الوصل على همزة القطع الساكنة لا يكون إلا في:",
    ["الأفعال", "الأسماء", "الحروف", "لا يأتي مطلقاً"],
    1,
  ],
  [
    "ما هو حكم اجتماع همزة الوصل مع همزة القطع الساكنة (وصلاً)؟",
    [
      "تثبت همزة الوصل وتسقط همزة القطع",
      "تسقط همزة الوصل وتثبت همزة القطع",
      "تثبت الهمزتان معاً",
      "تسقط الهمزتان معاً",
    ],
    1,
  ],
  [
    "كيف يُبتدأ بالكلمات التي تبدأ بهمزة وصل وبعدها همزة قطع ساكنة (مثل: اؤْتُمِن)؟",
    [
      "تحذف همزة الوصل تماماً",
      "تثبت همزة الوصل وتتحرك بحركة ثالث الفعل، وتبدل همزة القطع لحرف مد مجانس",
      "تنطق همزتان محققتان",
      "تسهل همزة الوصل",
    ],
    1,
  ],
  [
    "تقدم همزة القطع الاستفهامية المفتوحة على همزة الوصل يكون في:",
    ["الأفعال فقط", "الأسماء فقط", "الأسماء والأفعال", "الحروف فقط"],
    2,
  ],
  [
    "لماذا لا يجوز حذف همزة الوصل بالإجماع عند دخول همزة الاستفهام عليها في الأسماء (مثل: آلله، آلذكرين)؟",
    [
      "لأنها تقع في وسط الكلمة",
      "لئلا يلتبس الاستفهام بالخبر فيتغير المعنى",
      "لأنها تبدل حرف مد دائماً",
      "لثبوت همزة القطع الساكنة",
    ],
    1,
  ],
  [
    "ما مقدار المد في وجه (الإبدال) عند دخول همزة الاستفهام على همزة الوصل في الأسماء؟",
    ["مد حركتين", "مد أربع حركات", "مد لازم (ست حركات)", "بدون مد مطلقاً"],
    2,
  ],
  [
    "ما هو الوجه المقدم في الأسماء (عند اجتماع همزة الاستفهام وهمزة الوصل) تبعاً لرسم المصحف؟",
    ["التسهيل", "الإبدال", "الحذف", "التحقيق"],
    1,
  ],
  [
    "كيف يُعرّف وجه (التسهيل) في حالة همزة الاستفهام مع همزة الوصل؟",
    [
      "إبدال همزة الوصل حرف مد خالص",
      "النطق بهمزة الوصل مسهلة بين صوت همزة وصوت ألف مع عدم المد مطلقاً",
      "النطق بهمزة محققة مع المد الطويل",
      "حذف همزة الوصل وترك همزة القطع مفتوحة",
    ],
    1,
  ],
  [
    "ما حكم همزة الوصل إذا دخلت عليها همزة الاستفهام في الأفعال (مثل: أأطلع، أأفترى)؟",
    [
      "تسقط همزة الوصل رسماً ولفظاً لأنها أصبحت في درج الكلام",
      "تثبت همزة الوصل لفظاً فقط",
      "تبدل حرف مد ست حركات",
      "تسهل بين بين",
    ],
    0,
  ],
  [
    "هل يتغير المعنى عند حذف همزة الوصل في الأفعال؟",
    [
      "نعم، يتغير المعنى جذرياً",
      "لا، لا يغير المعنى بحذفها",
      "يلتبس الاستفهام بالخبر",
      "يتحول الفعل إلى اسم",
    ],
    1,
  ],
];

const { data: quiz, error } = await db
  .from("quizzes")
  .select("id, title, circle_type, academy_id, quiz_questions(id)")
  .eq("id", QUIZ_ID)
  .eq("academy_id", SOHBAH)
  .single();

if (error || !quiz) throw new Error(`quiz not found: ${error?.message}`);
if (quiz.quiz_questions.length > 0) {
  console.log(`"${quiz.title}" already has ${quiz.quiz_questions.length} questions; nothing done.`);
  process.exit(0);
}

for (const [i, [prompt, options, correct]] of QUESTIONS.entries()) {
  console.log(`${i + 1}. ${prompt}\n   ✓ ${options[correct]}`);
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

for (const [i, [prompt, options, correct]] of QUESTIONS.entries()) {
  const { data: question, error: qError } = await db
    .from("quiz_questions")
    .insert({ quiz_id: QUIZ_ID, position: i + 1, kind: "mcq", prompt, points: 1 })
    .select("id")
    .single();
  if (qError) throw qError;

  const { error: oError } = await db.from("quiz_options").insert(
    options.map((text, j) => ({
      question_id: question.id,
      position: j + 1,
      text,
      is_correct: j === correct,
    })),
  );
  if (oError) throw oError;
}

console.log(`\nAdded ${QUESTIONS.length} questions to "${quiz.title}".`);
