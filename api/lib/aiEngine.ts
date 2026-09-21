/*
 * AI Engine — محرك الذكاء الاصطناعي للمنصة
 * - توليد أسئلة جديدة من موضوع/كفاءة
 * - توليد أسئلة مشابهة من سؤال موجود (بنك الأسئلة)
 * - اقتراح تصحيح للأسئلة المفتوحة (يعتمد عليه الخبير)
 * - كشف احتمالية استخدام الذكاء الاصطناعي في الإجابات
 */

export type GeneratedQuestion = {
  type: "single" | "multiple" | "truefalse" | "short" | "essay" | "numeric";
  textAr: string;
  textEn: string;
  options?: { id: string; textAr: string; textEn: string }[];
  correctAnswer?: string[] | string | number;
  modelAnswer?: string;
  explanation?: string;
  points: number;
  difficulty: "easy" | "medium" | "hard";
  competency?: string;
};

// Knowledge fragments per common fellowship domains to build plausible questions
const DOMAIN_FACTS: Record<string, { qAr: string; qEn: string; correct: [string, string]; wrong: [string, string][]; expAr: string }[]> = {
  governance: [
    { qAr: "أي مما يلي يُعد من مبادئ الحوكمة الرشيدة في المنظمات غير الربحية؟", qEn: "Which of the following is a principle of good governance in non-profit organizations?", correct: ["الشفافية والإفصاح", "Transparency and disclosure"], wrong: [["تمركز الصلاحيات لدى شخص واحد", "Centralizing authority in one person"], ["إخفاء التقارير المالية عن أصحاب المصلحة", "Hiding financial reports from stakeholders"], ["غياب الفصل بين الإدارة والإشراف", "No separation between management and oversight"]], expAr: "الشفافية والإفصاح من أهم مبادئ الحوكمة لأنهما يعززان الثقة والمساءلة." },
    { qAr: "ما الدور الرئيس لمجلس الإدارة في المنظمة غير الربحية؟", qEn: "What is the main role of the board of directors in a non-profit organization?", correct: ["الإشراف الاستراتيجي والمساءلة", "Strategic oversight and accountability"], wrong: [["تنفيذ العمليات اليومية", "Executing daily operations"], ["إدارة الموظفين مباشرة", "Directly managing staff"], ["تحصيل التبرعات فقط", "Only collecting donations"]], expAr: "المجلس يشرف على الاتجاه الاستراتيجي ويحاسب الإدارة التنفيذية." },
    { qAr: "أي وثيقة تحدد الصلاحيات والمسؤوليات بين المجلس والإدارة التنفيذية؟", qEn: "Which document defines authorities and responsibilities between the board and executive management?", correct: ["مصفوفة الصلاحيات", "Authority matrix"], wrong: [["خطة التسويق", "Marketing plan"], ["دليل إجراءات الموارد البشرية", "HR procedures manual"], ["خطة الاتصال المؤسسي", "Corporate communication plan"]], expAr: "مصفوفة الصلاحيات توضح من يملك اتخاذ كل قرار." },
  ],
  finance: [
    { qAr: "ما المؤشر الأفضل لقياس استدامة المنظمة ماليًا؟", qEn: "What is the best indicator of an organization's financial sustainability?", correct: ["تنوع مصادر الإيرادات", "Diversification of revenue sources"], wrong: [["الاعتماد على مانح واحد", "Reliance on a single donor"], ["زيادة المصروفات الإدارية", "Increasing administrative expenses"], ["غياب الاحتياطي النقدي", "Absence of cash reserves"]], expAr: "تنوع مصادر الدخل يقلل المخاطر المالية ويعزز الاستدامة." },
    { qAr: "ماذا يقيس تحليل «التعادل» Break-even في المشاريع التنموية؟", qEn: "What does break-even analysis measure in development projects?", correct: ["النقطة التي تتساوى عندها الإيرادات مع التكاليف", "The point where revenues equal costs"], wrong: [["أعلى ربح ممكن", "Maximum possible profit"], ["عدد الموظفين المطلوب", "Required headcount"], ["مستوى رضا المستفيدين", "Beneficiary satisfaction level"]], expAr: "نقطة التعادل تحدد الحد الأدنى اللازم لتغطية التكاليف." },
  ],
  projects: [
    { qAr: "ما التسلسل الصحيح لدورة حياة المشروع التنموي؟", qEn: "What is the correct sequence of a development project life cycle?", correct: ["التخطيط ثم التنفيذ ثم المتابعة والتقييم", "Planning, implementation, then monitoring and evaluation"], wrong: [["التنفيذ ثم التخطيط ثم التقييم", "Implementation, planning, then evaluation"], ["التقييم ثم التخطيط ثم التنفيذ", "Evaluation, planning, then implementation"], ["المتابعة ثم التخطيط ثم الإغلاق", "Monitoring, planning, then closure"]], expAr: "يبدأ المشروع بالتخطيط ثم التنفيذ وتليهما المتابعة والتقييم." },
    { qAr: "أي أداة تُستخدم لقياس أثر المشروع على المستفيدين؟", qEn: "Which tool is used to measure a project's impact on beneficiaries?", correct: ["إطار النتائج ومؤشرات الأداء", "Results framework and KPIs"], wrong: [["جدول الرواتب", "Payroll sheet"], ["محضر اجتماع المجلس", "Board meeting minutes"], ["سجل الحضور والانصراف", "Attendance log"]], expAr: "إطار النتائج يربط الأنشطة بالمخرجات والأثر بمؤشرات قابلة للقياس." },
  ],
  hr: [
    { qAr: "ما الخطوة الأولى في تخطيط الموارد البشرية؟", qEn: "What is the first step in HR planning?", correct: ["تحليل الاحتياج من القوى العاملة", "Analyzing workforce needs"], wrong: [["إعلان الوظائف", "Posting job ads"], ["توقيع العقود", "Signing contracts"], ["تقييم الأداء السنوي", "Annual performance review"]], expAr: "يبدأ التخطيط بتحليل الاحتياج قبل الاستقطاب والتعيين." },
    { qAr: "أي مما يلي يُعد من أساليب تحفيز المتطوعين؟", qEn: "Which of the following is a volunteer motivation method?", correct: ["الاعتراف بالجهود وبرامج التقدير", "Recognition programs and appreciation"], wrong: [["تقليل قنوات التواصل", "Reducing communication channels"], ["إلغاء التدريب", "Cancelling training"], ["غياب التغذية الراجعة", "Lack of feedback"]], expAr: "التقدير والاعتراف من أقوى محفزات العمل التطوعي." },
  ],
  media: [
    { qAr: "ما الهدف الأساسي من إدارة السمعة المؤسسية؟", qEn: "What is the primary goal of corporate reputation management?", correct: ["بناء ثقة الجمهور بالمنظمة", "Building public trust in the organization"], wrong: [["زيادة عدد الموظفين", "Increasing headcount"], ["خفض الرواتب", "Reducing salaries"], ["إيقاف النشر الإعلامي", "Stopping media publishing"]], expAr: "السمعة تُبنى بالثقة والشفافية والتواصل الفعّال." },
    { qAr: "أي قناة تُعد الأنسب لإدارة الأزمات الإعلامية بسرعة؟", qEn: "Which channel is most suitable for rapid crisis communication?", correct: ["البيانات الرسمية عبر قنوات المنظمة المعتمدة", "Official statements via the organization's approved channels"], wrong: [["الشائعات غير الموثقة", "Unverified rumors"], ["الحسابات الشخصية المجهولة", "Anonymous personal accounts"], ["تجاهل وسائل الإعلام", "Ignoring media outlets"]], expAr: "القنوات الرسمية تضمن مصداقية الرسالة وسرعة انتشارها." },
  ],
  leadership: [
    { qAr: "أي أسلوب قيادي يُناسب فرق العمل عالية الكفاءة والخبرة؟", qEn: "Which leadership style suits highly skilled and experienced teams?", correct: ["القيادة التفويضية", "Delegative leadership"], wrong: [["القيادة الأمرية المباشرة", "Directive commanding leadership"], ["الإدارة التفصيلية الدقيقة", "Micromanagement"], ["غياب التوجيه الكامل", "Complete absence of direction"]], expAr: "الفريق عالي الكفاءة يحتاج تفويضًا وثقة أكثر من التوجيه المباشر." },
    { qAr: "ما أول خطوة في التخطيط الاستراتيجي؟", qEn: "What is the first step in strategic planning?", correct: ["تحليل الوضع الراهن (SWOT)", "Analyzing the current situation (SWOT)"], wrong: [["صياغة الميزانية التفصيلية", "Drafting the detailed budget"], ["تعيين موظفين جدد", "Hiring new staff"], ["إطلاق الحملات الإعلامية", "Launching media campaigns"]], expAr: "فهم الوضع الراهن أساس أي خطة استراتيجية سليمة." },
  ],
  knowledge: [
    { qAr: "ما المقصود بإدارة المعرفة في المنظمات؟", qEn: "What is knowledge management in organizations?", correct: ["توثيق الخبرات وتبادلها لتحسين الأداء", "Documenting and sharing expertise to improve performance"], wrong: [["حذف الملفات القديمة", "Deleting old files"], ["تقييد الوصول لجميع المعلومات", "Restricting access to all information"], ["الاعتماد على الذاكرة الفردية فقط", "Relying solely on individual memory"]], expAr: "إدارة المعرفة تحول الخبرة الفردية إلى أصل مؤسسي مشترك." },
  ],
  tech: [
    { qAr: "ما أولوية أمن المعلومات في إدارة التقنية؟", qEn: "What is the priority of information security in IT management?", correct: ["حماية سرية البيانات وسلامتها وتوافرها", "Protecting data confidentiality, integrity and availability"], wrong: [["منع استخدام التقنية نهائيًا", "Banning technology use entirely"], ["مشاركة كلمات المرور بين الموظفين", "Sharing passwords among staff"], ["إيقاف النسخ الاحتياطي", "Stopping backups"]], expAr: "أمن المعلومات يقوم على مثلث السرية والسلامة والتوافر." },
  ],
};

const GENERIC_FACTS = DOMAIN_FACTS.governance.concat(DOMAIN_FACTS.projects, DOMAIN_FACTS.leadership);

function pickDomain(topic: string): keyof typeof DOMAIN_FACTS | null {
  const t = topic.toLowerCase();
  if (/حوكم|govern/.test(t)) return "governance";
  if (/مال|محاسب|استدام|financ|sustain/.test(t)) return "finance";
  if (/مشاري|مشاريع|تنموي|project|develop/.test(t)) return "projects";
  if (/موارد بشرية|تطوع|hr|human|volunte/.test(t)) return "hr";
  if (/إعلام|علاقات|سمعة|media|public relation/.test(t)) return "media";
  if (/قياد|استراتيج|leader|strateg/.test(t)) return "leadership";
  if (/معرف|knowledge/.test(t)) return "knowledge";
  if (/تقني|أمن معلومات|tech|information/.test(t)) return "tech";
  return null;
}

const LETTERS = ["A", "B", "C", "D"];

export function generateQuestions(opts: {
  topic: string;
  competency?: string;
  count: number;
  types: Array<GeneratedQuestion["type"]>;
  difficulty: "easy" | "medium" | "hard";
}): GeneratedQuestion[] {
  const domain = pickDomain(opts.topic + " " + (opts.competency ?? ""));
  const facts = domain ? DOMAIN_FACTS[domain] : GENERIC_FACTS;
  const out: GeneratedQuestion[] = [];
  let fi = 0;
  for (let i = 0; i < opts.count; i++) {
    const type = opts.types[i % opts.types.length];
    const fact = facts[fi % facts.length];
    fi++;
    const topicLabel = opts.topic || "المجال المهني";
    if (type === "single") {
      const options = [
        { id: "A", textAr: fact.correct[0], textEn: fact.correct[1] },
        ...fact.wrong.slice(0, 3).map((w, k) => ({ id: LETTERS[k + 1], textAr: w[0], textEn: w[1] })),
      ];
      out.push({
        type: "single",
        textAr: fact.qAr,
        textEn: fact.qEn,
        options,
        correctAnswer: "A",
        explanation: fact.expAr,
        points: 1,
        difficulty: opts.difficulty,
        competency: opts.competency,
      });
    } else if (type === "truefalse") {
      const truth = i % 2 === 0;
      out.push({
        type: "truefalse",
        textAr: truth
          ? `${fact.expAr}`
          : `يُعد «${fact.wrong[0][0]}» الممارسة الصحيحة في ${topicLabel}.`,
        textEn: truth
          ? fact.expAr
          : `"${fact.wrong[0][1]}" is the correct practice in ${opts.topic || "the professional field"}.`,
        options: [
          { id: "T", textAr: "صح", textEn: "True" },
          { id: "F", textAr: "خطأ", textEn: "False" },
        ],
        correctAnswer: truth ? "T" : "F",
        explanation: fact.expAr,
        points: 1,
        difficulty: opts.difficulty,
        competency: opts.competency,
      });
    } else if (type === "essay") {
      out.push({
        type: "essay",
        textAr: `ناقش بالتفصيل: ${fact.qAr.replace("؟", "")} موضحًا الأسباب والأمثلة التطبيقية في ${topicLabel}.`,
        textEn: `Discuss in detail: ${fact.qEn.replace(/\?$/, "")} with reasons and practical examples in ${opts.topic || "the professional field"}.`,
        modelAnswer: `${fact.correct[0]}. ${fact.expAr} ويُستحسن دعم الإجابة بأمثلة تطبيقية وربطها بأهداف المنظمة وأصحاب المصلحة.`,
        points: 5,
        difficulty: opts.difficulty,
        competency: opts.competency,
      });
    } else if (type === "multiple") {
      out.push({
        type: "multiple",
        textAr: `اختر جميع العبارات الصحيحة المتعلقة بـ«${topicLabel}»:`,
        textEn: `Select all correct statements related to "${opts.topic || "the professional field"}":`,
        options: [
          { id: "A", textAr: fact.correct[0], textEn: fact.correct[1] },
          { id: "B", textAr: fact.expAr, textEn: fact.expAr },
          { id: "C", textAr: fact.wrong[0][0], textEn: fact.wrong[0][1] },
          { id: "D", textAr: fact.wrong[1]?.[0] ?? "لا شيء مما سبق", textEn: fact.wrong[1]?.[1] ?? "None of the above" },
        ],
        correctAnswer: ["A", "B"],
        explanation: fact.expAr,
        points: 2,
        difficulty: opts.difficulty,
        competency: opts.competency,
      });
    } else if (type === "short") {
      out.push({
        type: "short",
        textAr: `اذكر باختصار: ${fact.qAr}`,
        textEn: `Briefly state: ${fact.qEn}`,
        correctAnswer: fact.correct[0],
        modelAnswer: fact.correct[0],
        points: 2,
        difficulty: opts.difficulty,
        competency: opts.competency,
      });
    } else {
      // numeric
      const n = 3 + (i % 5) * 2;
      out.push({
        type: "numeric",
        textAr: `إذا خصصت منظمة ${n * 10}% من ميزانيتها لبرنامج تنموي وكانت الميزانية ${n * 10000} ريال، فما المبلغ المخصص للبرنامج (بالريال)؟`,
        textEn: `If an organization allocates ${n * 10}% of its ${n * 10000} SAR budget to a development program, what amount (SAR) is allocated?`,
        correctAnswer: (n * 10 * n * 10000) / 100,
        explanation: `${n * 10}% × ${n * 10000} = ${(n * 10 * n * 10000) / 100}`,
        points: 1,
        difficulty: opts.difficulty,
        competency: opts.competency,
      });
    }
  }
  return out;
}

/* ------------------------- توليد أسئلة مشابهة ------------------------- */
export function generateSimilarQuestions(q: {
  type: GeneratedQuestion["type"];
  textAr: string;
  textEn?: string | null;
  options?: { id: string; textAr: string; textEn: string }[] | null;
  correctAnswer?: unknown;
  modelAnswer?: string | null;
  points: number;
  difficulty: "easy" | "medium" | "hard";
  competency?: string | null;
}, count: number): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  const variants = [
    { pre: "في ضوء ما سبق، ", suffix: " (من منظور تطبيقي)" },
    { pre: "", suffix: " — وضّح إجابتك بمثال" },
    { pre: "بناءً على أفضل الممارسات، ", suffix: "" },
    { pre: "", suffix: " (حالة عملية)" },
  ];
  for (let i = 0; i < count; i++) {
    const v = variants[i % variants.length];
    const base: GeneratedQuestion = {
      type: q.type,
      textAr: v.pre + q.textAr + v.suffix,
      textEn: q.textEn ? q.textEn + (q.type === "essay" ? " Support with an example." : "") : "",
      options: q.options ? shuffleCopy(q.options).map((o, k) => ({ ...o, id: LETTERS[k] })) : undefined,
      correctAnswer: q.correctAnswer as GeneratedQuestion["correctAnswer"],
      modelAnswer: q.modelAnswer ?? undefined,
      explanation: "سؤال مشابه مولّد آليًا من بنك الأسئلة ويحتاج مراجعة الخبير قبل الاعتماد.",
      points: q.points,
      difficulty: q.difficulty,
      competency: q.competency ?? undefined,
    };
    // keep correct answer aligned when we re-letter single/multiple options
    if ((q.type === "single" || q.type === "multiple") && q.options && Array.isArray(q.correctAnswer ?? null) === false) {
      const orig = q.options;
      const correctIds = new Set(Array.isArray(q.correctAnswer) ? (q.correctAnswer as string[]) : [q.correctAnswer as string]);
      const newCorrect = base.options!.filter((o) => correctIds.has(orig.find((x) => x.textAr === o.textAr)?.id ?? "")).map((o) => o.id);
      base.correctAnswer = q.type === "single" ? newCorrect[0] : newCorrect;
    } else if (q.type === "multiple" && q.options) {
      const orig = q.options;
      const correctIds = new Set((q.correctAnswer as string[]) ?? []);
      base.correctAnswer = base.options!.filter((o) => correctIds.has(orig.find((x) => x.textAr === o.textAr)?.id ?? "")).map((o) => o.id);
    }
    out.push(base);
  }
  return out;
}

function shuffleCopy<T>(arr: T[]): T[] {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

/* ------------------------- اقتراح تصحيح ذكي للأسئلة المفتوحة ------------------------- */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestEssayScore(answerText: string, modelAnswer: string | null, maxPoints: number): {
  score: number;
  feedback: string;
  coveragePct: number;
} {
  const ans = normalize(answerText);
  const words = ans.split(" ").filter((w) => w.length > 2);
  const unique = new Set(words);
  let coverage = 0;
  let keywordHits = 0;
  let keywordTotal = 0;
  if (modelAnswer) {
    const modelWords = normalize(modelAnswer)
      .split(" ")
      .filter((w) => w.length > 3);
    keywordTotal = Math.min(modelWords.length, 20);
    const top = modelWords.slice(0, 20);
    keywordHits = top.filter((w) => ans.includes(w)).length;
    coverage = keywordTotal ? keywordHits / keywordTotal : 0;
  }
  const lenScore = Math.min(1, words.length / 60); // يفضل إجابة لا تقل عن 60 كلمة تقريبًا
  const diversity = words.length ? unique.size / words.length : 0;
  const structureBonus = /(أولا|ثانيا|ثالثا|أخيرا|أولاً|ثانياً|خاتمة|مقدمة|firstly|secondly|finally|in conclusion)/i.test(answerText) ? 0.1 : 0;
  let ratio = coverage * 0.55 + lenScore * 0.25 + diversity * 0.1 + structureBonus;
  ratio = Math.max(0, Math.min(1, ratio));
  const score = Math.round(ratio * maxPoints);
  const parts: string[] = [];
  parts.push(`تغطية عناصر الإجابة النموذجية: ${Math.round(coverage * 100)}% (${keywordHits}/${keywordTotal} مفهومًا).`);
  parts.push(words.length < 30 ? "الإجابة قصيرة وتحتاج تفصيلًا أكبر." : `طول الإجابة مناسب (${words.length} كلمة تقريبًا).`);
  parts.push(structureBonus > 0 ? "تنظيم الإجابة جيد مع تسلسل واضح للأفكار." : "يُفضل تنظيم الإجابة بمقدمة وعناصر وخاتمة.");
  parts.push("هذا اقتراح آلي — يُرجى مراجعته واعتماده أو تعديله قبل اعتماد الدرجة النهائية.");
  return { score, feedback: parts.join("\n"), coveragePct: Math.round(coverage * 100) };
}

/* ------------------------- كاشف استخدام الذكاء الاصطناعي ------------------------- */
export function detectAIText(text: string): { score: number; label: string; reasons: string[] } {
  const clean = text.trim();
  const sentences = clean.split(/(?<=[.!؟?؛\n])/u).map((s) => s.trim()).filter((s) => s.length > 0);
  const words = clean.split(/\s+/).filter(Boolean);
  const reasons: string[] = [];
  let score = 15; // baseline

  // 1) انخفاض تباين أطوال الجمل (انتظام آلي)
  const lens = sentences.map((s) => s.split(/\s+/).length);
  const mean = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
  const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, lens.length);
  const std = Math.sqrt(variance);
  if (sentences.length >= 4 && std < 4) {
    score += 22;
    reasons.push("أطوال الجمل شبه منتظمة بشكل غير معتاد (انخفاض التباين الطبيعي).");
  } else if (sentences.length >= 4 && std < 7) {
    score += 8;
  }

  // 2) روابط رسمية متكررة
  const connectors = clean.match(/(بالإضافة إلى ذلك|علاوة على ذلك|ومن الجدير بالذكر|في الختام|بناءً على ما سبق|furthermore|moreover|in conclusion|it is worth noting|additionally)/gi);
  if ((connectors?.length ?? 0) >= 3) {
    score += 20;
    reasons.push(`تكرار عبارات ربط رسمية نمطية (${connectors!.length} مرات).`);
  } else if ((connectors?.length ?? 0) >= 1) {
    score += 6;
  }

  // 3) قوائم مرقمة/نقطية مثالية
  const bullets = clean.match(/(^|\n)\s*([0-9]+[.)]|[-•●])\s/g);
  if ((bullets?.length ?? 0) >= 4) {
    score += 12;
    reasons.push("بنية قوائم مثالية ومتكررة.");
  }

  // 4) تنوع معجمي متوسط المدى (نمط آلي شائع)
  const uniq = new Set(words.map((w) => normalize(w)));
  const diversity = words.length ? uniq.size / words.length : 0;
  if (words.length > 80 && diversity > 0.55 && diversity < 0.8) score += 8;

  // 5) غياب الأخطاء الإملائية/العامية تمامًا مع طول النص
  const colloquial = clean.match(/(يعني|بصراحة|زي|كدا|عشان|هيك|مره|وايد|شوي|really|basically|stuff|gonna)/gi);
  if (words.length > 100 && !colloquial) {
    score += 10;
    reasons.push("نص طويل خالٍ تمامًا من أي تعبيرات شخصية أو عامية.");
  }

  // 6) صيغ ختامية نمطية
  if (/(في الختام|وبالتالي يمكن القول|in summary|to summarize)/i.test(clean)) {
    score += 10;
    reasons.push("خاتمة نمطية شائعة في النصوص المولدة.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 70 ? "high_ai_likelihood" : score >= 40 ? "medium_ai_likelihood" : "likely_human";
  if (reasons.length === 0) reasons.push("النمط اللغوي قريب من الكتابة البشرية الطبيعية.");
  return { score, label, reasons };
}
