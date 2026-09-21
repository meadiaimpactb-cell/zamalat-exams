/* ============================================================================
 * دليل الطالب للاختبار الشامل — نسخة مختصرة (طلب الإدارة 2026-09-21): الضروري فقط بجمل قصيرة مباشرة.
 * يُعرض في: صفحة الدليل /exam/guide (قابلة للطباعة)، القواعد الأساسية في صفحة الاستعداد، ونافذة «؟» أثناء الاختبار.
 * القيم بين أقواس {duration} {exits} {snapshot} تُملأ من إعدادات الاختبار.
 * ========================================================================== */

export type GuideText = { ar: string; en: string };
export type GuideSection = {
  id: string;
  icon: "laptop" | "login" | "clipboard" | "monitor" | "list" | "shield" | "timer" | "wifi" | "lock" | "send" | "trophy" | "help";
  title: GuideText;
  intro?: GuideText;
  items: { ar: string[]; en: string[] };
  warning?: GuideText;
};

export type GuideVars = { duration: number | string; exits: number | string; snapshot: number | string; extra?: number };

/** يستبدل المتغيرات في النص */
export function fillVars(text: string, v: GuideVars): string {
  return text
    .replace(/\{duration\}/g, String(v.duration))
    .replace(/\{exits\}/g, String(v.exits))
    .replace(/\{snapshot\}/g, String(v.snapshot));
}

export const DEFAULT_VARS: GuideVars = { duration: 360, exits: 3, snapshot: 60 };

/** القواعد الأساسية — قصيرة وحاسمة؛ تُعرض قبل البدء وفي نافذة المساعدة أثناء الاختبار */
export const quickRules: GuideText[] = [
  { ar: "ابقَ في وضع ملء الشاشة. الخروج منه أكثر من {exits} مرات يُنهي الاختبار.", en: "Stay in fullscreen. Leaving it more than {exits} times ends the exam." },
  { ar: "المدة {duration} دقيقة من لحظة البدء، وعند انتهائها يُسلَّم الاختبار تلقائيًا.", en: "You have {duration} minutes from the start; the exam submits automatically when time is up." },
  { ar: "إجاباتك تُحفظ تلقائيًا — لا يوجد زر حفظ.", en: "Answers save automatically — there is no Save button." },
  { ar: "إذا انقطع الإنترنت لا تُغلق الصفحة؛ الإجابات محفوظة وتُرسل عند عودة الاتصال، والوقت مستمر.", en: "If the internet drops, don't close the page; answers are kept and sent when it returns. The timer keeps running." },
  { ar: "ممنوع: تبديل التبويب، مغادرة النافذة، النسخ واللصق، الزر الأيمن، لقطة الشاشة. كل ذلك يُسجَّل.", en: "Not allowed: switching tabs, leaving the window, copy/paste, right-click, screenshots. All of it is logged." },
  { ar: "الكاميرا (إن كانت مفعّلة) تلتقط صورة كل {snapshot} ثانية — اجلس وحدك ووجهك ظاهر.", en: "The camera (if enabled) takes a snapshot every {snapshot} seconds — sit alone with your face visible." },
  { ar: "التسليم نهائي. تأكد من عدّاد «المُجاب» قبل التأكيد.", en: "Submission is final. Check the answered counter before confirming." },
  { ar: "إذا أُقفل اختبارك، لا تُعد المحاولة؛ تواصل مع المشرف فورًا ليُعيد فتحه بإجاباتك.", en: "If your exam gets locked, don't retry; contact the supervisor to reopen it with your answers." },
];

export const guideSections: GuideSection[] = [
  {
    id: "before", icon: "laptop",
    title: { ar: "1. قبل الاختبار", en: "1. Before the exam" },
    items: {
      ar: [
        "حاسوب أو لابتوب (لا جوال)، متصفح Chrome أو Edge محدَّث، إنترنت مستقر، شاحن موصول.",
        "كاميرا تعمل إن كان الاختبار يطلبها، ومكان هادئ تجلس فيه وحدك.",
        "أغلق كل البرامج والتبويبات الأخرى، وجهّز رمز الاختبار ورقم هويتك (10 أرقام).",
      ],
      en: [
        "A computer or laptop (not a phone), updated Chrome or Edge, stable internet, charger plugged in.",
        "A working camera if the exam requires it, and a quiet place where you sit alone.",
        "Close all other programs and tabs; have your exam code and 10-digit ID ready.",
      ],
    },
  },
  {
    id: "login", icon: "login",
    title: { ar: "2. الدخول والبدء", en: "2. Entering and starting" },
    items: {
      ar: [
        "افتح رابط المنصة → «بوابة المشاركين» → أدخل رمز الاختبار ورقم الهوية → «تحقق».",
        "تأكد أن فحص الجهاز كله ✓ (الشاشة، المتصفح، الإنترنت، الكاميرا).",
        "ضع علامة على الموافقات الثلاث ثم اضغط «بدء الاختبار» — من هنا يبدأ الوقت ويدخل ملء الشاشة.",
        "أُغلق المتصفح بالخطأ؟ ادخل بنفس الرمز والهوية وستُستأنف جلستك بإجاباتك ووقتك المتبقي.",
      ],
      en: [
        "Open the platform link → “Candidate portal” → enter the exam code and ID → “Verify”.",
        "Make sure every device check is ✓ (screen, browser, internet, camera).",
        "Tick the three consents, then press “Start exam” — time starts and fullscreen begins.",
        "Browser closed by mistake? Re-enter with the same code and ID to resume with your answers and remaining time.",
      ],
    },
  },
  {
    id: "screen", icon: "monitor",
    title: { ar: "3. أثناء الاختبار", en: "3. During the exam" },
    items: {
      ar: [
        "الأعلى: الوقت المتبقي (يحمرّ في آخر 5 دقائق) ومؤشر «حُفظ تلقائيًا».",
        "الجانب: أرقام الأسئلة — أخضر مُجاب، أبيض لم يُجب، نقطة برتقالية = عليه علامة مراجعة 🚩. اضغط أي رقم للانتقال إليه.",
        "زر «؟» في الأعلى يعرض هذه القواعد في أي وقت دون الخروج من ملء الشاشة.",
      ],
      en: [
        "Top: remaining time (turns red in the last 5 minutes) and the “auto-saved” indicator.",
        "Side: question numbers — green answered, white unanswered, orange dot = flagged 🚩. Click any number to jump to it.",
        "The “?” button at the top shows these rules anytime without leaving fullscreen.",
      ],
    },
  },
  {
    id: "types", icon: "list",
    title: { ar: "4. كيف تجيب", en: "4. How to answer" },
    items: {
      ar: [
        "اختيار من واحد / صح وخطأ: اضغط الخيار. اختيار متعدد: اختر كل الصحيح — الدرجة جزئية ويُخصم عن الخيار الخاطئ، فلا تخمّن.",
        "إجابة قصيرة: كلمة أو عبارة. رقمي: الرقم فقط (مثل 42). مقالي: اكتب إجابة كاملة ومرتبة؛ تُصحَّح يدويًا.",
        "إرفاق صورة (إن سُمح): ارفع صورة الحل من جهازك؛ فتح نافذة الملف لا يُحتسب خروجًا.",
      ],
      en: [
        "Single choice / true-false: click the option. Multiple choice: select all correct ones — partial credit, wrong picks are penalized, so don't guess.",
        "Short answer: a word or phrase. Numeric: the number only (e.g. 42). Essay: write a complete, organized answer; graded manually.",
        "Image attachment (when allowed): upload a photo of your solution; opening the file dialog does not count as leaving.",
      ],
    },
  },
  {
    id: "proctor", icon: "shield",
    title: { ar: "5. المراقبة والوقت والإقفال", en: "5. Proctoring, time and locking" },
    items: {
      ar: [
        "الاختبار مراقَب بالكامل: كل خروج أو تبديل تبويب أو نسخ يُسجَّل ويراه المشرف.",
        "خرجت من ملء الشاشة؟ اضغط «العودة إلى ملء الشاشة» فورًا — الحد {exits} مرات ثم يُقفل الاختبار.",
        "الوقت مرجعه الخادم ولا يتوقف لأي سبب. المشرف وحده يستطيع تمديده.",
        "إذا أُقفل اختبارك تظهر شاشة حمراء؛ تواصل مع المشرف — يستطيع إعادة فتحه مع الاحتفاظ بكل إجاباتك.",
      ],
      en: [
        "The exam is fully proctored: every exit, tab switch or copy attempt is logged and seen by the supervisor.",
        "Left fullscreen? Press “Return to fullscreen” immediately — the limit is {exits}, then the exam locks.",
        "Time is kept by the server and never pauses. Only a supervisor can extend it.",
        "If your exam locks, a red screen appears; contact the supervisor — they can reopen it with all your answers kept.",
      ],
    },
    warning: { ar: "الغش أو محاولته يُلغي الاختبار وتُتخذ الإجراءات النظامية.", en: "Cheating or attempting to cheat cancels the exam and leads to formal action." },
  },
  {
    id: "submit", icon: "send",
    title: { ar: "6. التسليم والنتيجة", en: "6. Submitting and results" },
    items: {
      ar: [
        "راجع الأسئلة البيضاء (غير المُجابة) والبرتقالية (المعلَّمة) ثم «تسليم الاختبار» → تأكيد. لا رجوع بعده.",
        "انتهى الوقت؟ يُسلَّم تلقائيًا بما أجبت.",
        "النتائج تُعلن عبر موقع الزمالة الرئيسي بعد الاعتماد — لا استعلام داخل المنصة.",
        "أي مشكلة أثناء الاختبار: تواصل مع مشرف القاعة أو إدارة الزمالة عبر القناة الرسمية.",
      ],
      en: [
        "Review white (unanswered) and orange (flagged) questions, then “Submit exam” → confirm. No undo.",
        "Time over? It submits automatically with what you answered.",
        "Results are announced on the main fellowship website after approval — no lookup inside the platform.",
        "Any problem during the exam: contact the room supervisor or the fellowship administration via the official channel.",
      ],
    },
  },
];
