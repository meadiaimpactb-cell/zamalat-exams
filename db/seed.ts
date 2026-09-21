import { getDb } from "../api/queries/connection";
import * as schema from "./schema";
import { eq } from "drizzle-orm";
import { hashPassword, maskNationalId } from "../api/lib/security";

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  // ---------- Staff users ----------
  const staffSeed = [
    { username: "superadmin", password: "Super@12345", nameAr: "م. عبدالله المدير الأعلى", nameEn: "Abdullah Al-Saud", role: "super_admin" as const, email: "superadmin@pfellowships.sa" },
    { username: "admin", password: "Admin@12345", nameAr: "أ. سارة مديرة الاختبارات", nameEn: "Sarah Al-Harbi", role: "admin" as const, email: "admin@pfellowships.sa" },
    { username: "expert1", password: "Expert@12345", nameAr: "د. محمد الخبير الأول", nameEn: "Dr. Mohammed Al-Otaibi", role: "expert" as const, email: "expert1@pfellowships.sa" },
    { username: "expert2", password: "Expert@12345", nameAr: "د. نورة الخبيرة الثانية", nameEn: "Dr. Noura Al-Qahtani", role: "expert" as const, email: "expert2@pfellowships.sa" },
  ];
  const userIds: Record<string, number> = {};
  for (const u of staffSeed) {
    const existing = await db.query.users.findFirst({ where: eq(schema.users.username, u.username) });
    if (existing) { userIds[u.username] = existing.id; continue; }
    const [{ id }] = await db.insert(schema.users).values({
      username: u.username,
      passwordHash: hashPassword(u.password),
      nameAr: u.nameAr,
      nameEn: u.nameEn,
      email: u.email,
      role: u.role,
    }).$returningId();
    userIds[u.username] = id;
  }
  console.log("users:", userIds);

  // ---------- Fellowship ----------
  let fellowship = await db.query.fellowships.findFirst({ where: eq(schema.fellowships.nameAr, "زمالة القيادة الصحية") });
  if (!fellowship) {
    const [{ id }] = await db.insert(schema.fellowships).values({
      nameAr: "زمالة القيادة الصحية",
      nameEn: "Health Leadership Fellowship",
      description: "برنامج الزمالة المهنية في القيادة وإدارة المنشآت الصحية",
    }).$returningId();
    fellowship = (await db.query.fellowships.findFirst({ where: eq(schema.fellowships.id, id) }))!;
  }

  // ---------- Question bank ----------
  let bank = await db.query.questionBanks.findFirst({ where: eq(schema.questionBanks.nameAr, "بنك أسئلة القيادة والحوكمة") });
  if (!bank) {
    const [{ id }] = await db.insert(schema.questionBanks).values({
      nameAr: "بنك أسئلة القيادة والحوكمة",
      nameEn: "Leadership & Governance Bank",
      fellowshipId: fellowship.id,
    }).$returningId();
    bank = (await db.query.questionBanks.findFirst({ where: eq(schema.questionBanks.id, id) }))!;
  }

  // ---------- Questions ----------
  const existingQs = await db.select().from(schema.questions).where(eq(schema.questions.bankId, bank.id));
  let questionIds: number[] = existingQs.map((q) => q.id);
  if (existingQs.length === 0) {
    const qs: Array<Record<string, unknown>> = [
      {
        type: "single", textAr: "أي مما يلي يُعد من مبادئ الحوكمة الرشيدة في المنظمات غير الربحية؟",
        textEn: "Which of the following is a principle of good governance in non-profit organizations?",
        options: [
          { id: "A", textAr: "الشفافية والإفصاح", textEn: "Transparency and disclosure" },
          { id: "B", textAr: "تمركز الصلاحيات لدى شخص واحد", textEn: "Centralizing authority" },
          { id: "C", textAr: "إخفاء التقارير المالية", textEn: "Hiding financial reports" },
          { id: "D", textAr: "غياب الفصل بين الإدارة والإشراف", textEn: "No separation of powers" },
        ],
        correctAnswer: "A", points: 1, difficulty: "easy", competency: "الحوكمة",
        explanation: "الشفافية والإفصاح يعززان الثقة والمساءلة.",
      },
      {
        type: "single", textAr: "ما الدور الرئيس لمجلس الإدارة في المنظمة غير الربحية؟",
        textEn: "What is the main role of the board of directors?",
        options: [
          { id: "A", textAr: "تنفيذ العمليات اليومية", textEn: "Daily operations" },
          { id: "B", textAr: "الإشراف الاستراتيجي والمساءلة", textEn: "Strategic oversight and accountability" },
          { id: "C", textAr: "إدارة الموظفين مباشرة", textEn: "Direct staff management" },
          { id: "D", textAr: "تحصيل التبرعات فقط", textEn: "Only fundraising" },
        ],
        correctAnswer: "B", points: 1, difficulty: "medium", competency: "الحوكمة",
      },
      {
        type: "multiple", textAr: "اختر جميع عناصر التخطيط الاستراتيجي الفعّال:",
        textEn: "Select all elements of effective strategic planning:",
        options: [
          { id: "A", textAr: "تحليل الوضع الراهن (SWOT)", textEn: "SWOT analysis" },
          { id: "B", textAr: "رؤية ورسالة واضحة", textEn: "Clear vision and mission" },
          { id: "C", textAr: "مؤشرات أداء قابلة للقياس", textEn: "Measurable KPIs" },
          { id: "D", textAr: "تجاهل أصحاب المصلحة", textEn: "Ignoring stakeholders" },
        ],
        correctAnswer: ["A", "B", "C"], points: 2, difficulty: "medium", competency: "التخطيط الاستراتيجي",
      },
      {
        type: "truefalse", textAr: "تنوع مصادر الإيرادات يقلل المخاطر المالية ويعزز الاستدامة المالية للمنظمة.",
        textEn: "Diversifying revenue sources reduces financial risk and improves sustainability.",
        options: [
          { id: "T", textAr: "صح", textEn: "True" },
          { id: "F", textAr: "خطأ", textEn: "False" },
        ],
        correctAnswer: "T", points: 1, difficulty: "easy", competency: "الاستدامة المالية",
      },
      {
        type: "truefalse", textAr: "القيادة الأمرية المباشرة هي الأسلوب الأنسب لفرق العمل عالية الكفاءة والخبرة.",
        textEn: "Directive commanding leadership is the best style for highly skilled teams.",
        options: [
          { id: "T", textAr: "صح", textEn: "True" },
          { id: "F", textAr: "خطأ", textEn: "False" },
        ],
        correctAnswer: "F", points: 1, difficulty: "medium", competency: "القيادة",
      },
      {
        type: "single", textAr: "ما التسلسل الصحيح لدورة حياة المشروع التنموي؟",
        textEn: "What is the correct sequence of the development project life cycle?",
        options: [
          { id: "A", textAr: "التنفيذ ثم التخطيط ثم التقييم", textEn: "Implementation, planning, evaluation" },
          { id: "B", textAr: "التقييم ثم التخطيط ثم التنفيذ", textEn: "Evaluation, planning, implementation" },
          { id: "C", textAr: "التخطيط ثم التنفيذ ثم المتابعة والتقييم", textEn: "Planning, implementation, then M&E" },
          { id: "D", textAr: "المتابعة ثم التخطيط ثم الإغلاق", textEn: "Monitoring, planning, closure" },
        ],
        correctAnswer: "C", points: 1, difficulty: "medium", competency: "إدارة المشاريع",
      },
      {
        type: "short", textAr: "ما اسم الوثيقة التي تحدد الصلاحيات والمسؤوليات بين المجلس والإدارة التنفيذية؟",
        textEn: "What is the document that defines authorities between the board and executive management?",
        correctAnswer: "مصفوفة الصلاحيات", points: 2, difficulty: "hard", competency: "الحوكمة",
      },
      {
        type: "numeric", textAr: "إذا خصصت منظمة 15% من ميزانيتها البالغة 400,000 ريال لبرنامج تنموي، فما المبلغ المخصص (بالريال)؟",
        textEn: "If an organization allocates 15% of its 400,000 SAR budget to a program, what is the amount (SAR)?",
        correctAnswer: 60000, points: 1, difficulty: "easy", competency: "التخطيط المالي",
        explanation: "15% × 400,000 = 60,000",
      },
      {
        type: "multiple", textAr: "أي من التالي يُعد من أساليب تحفيز المتطوعين؟",
        textEn: "Which of the following are volunteer motivation methods?",
        options: [
          { id: "A", textAr: "الاعتراف بالجهود وبرامج التقدير", textEn: "Recognition programs" },
          { id: "B", textAr: "فرص التدريب والتطوير", textEn: "Training opportunities" },
          { id: "C", textAr: "تقليل قنوات التواصل", textEn: "Reducing communication" },
          { id: "D", textAr: "إشراكهم في اتخاذ القرار", textEn: "Involving them in decisions" },
        ],
        correctAnswer: ["A", "B", "D"], points: 2, difficulty: "medium", competency: "الموارد البشرية",
      },
      {
        type: "essay", textAr: "ناقش أهمية الحوكمة الرشيدة في المنظمات غير الربحية، موضحًا ثلاثة مبادئ أساسية مع أمثلة تطبيقية.",
        textEn: "Discuss the importance of good governance in non-profits, explaining three key principles with practical examples.",
        modelAnswer: "الحوكمة الرشيدة أساس نجاح المنظمات غير الربحية. من مبادئها: الشفافية والإفصاح عن التقارير المالية والأداء لأصحاب المصلحة، والمساءلة عبر الفصل بين أدوار المجلس والإدارة التنفيذية، والمشاركة الفعالة لأصحاب المصلحة في اتخاذ القرار. أمثلة تطبيقية: نشر التقرير السنوي، تشكيل لجان مراجعة مستقلة، ومصفوفة صلاحيات واضحة.",
        points: 5, difficulty: "hard", competency: "الحوكمة",
      },
      {
        type: "essay", textAr: "اشرح خطوات بناء خطة استراتيجية لمنظمة غير ربحية، مع ذكر الأدوات المستخدمة في كل خطوة.",
        textEn: "Explain the steps to build a strategic plan for a non-profit, mentioning tools used in each step.",
        modelAnswer: "تبدأ الخطة بتحليل الوضع الراهن باستخدام أداة SWOT لتحديد نقاط القوة والضعف والفرص والتهديدات، ثم صياغة الرؤية والرسالة والقيم، وتحديد الأهداف الاستراتيجية القابلة للقياس بمؤشرات أداء KPIs، ثم بناء الخطط التشغيلية والميزانيات، وأخيرًا المتابعة والتقييم الدوري عبر لوحات المؤشرات ومراجعات الأداء.",
        points: 5, difficulty: "hard", competency: "التخطيط الاستراتيجي",
      },
    ];
    for (const q of qs) {
      const [{ id }] = await db.insert(schema.questions).values({
        bankId: bank.id,
        type: q.type as never,
        textAr: q.textAr as string,
        textEn: (q.textEn as string) ?? null,
        options: (q.options as never) ?? null,
        correctAnswer: (q.correctAnswer as never) ?? null,
        modelAnswer: (q.modelAnswer as string) ?? null,
        explanation: (q.explanation as string) ?? null,
        points: q.points as number,
        difficulty: q.difficulty as never,
        competency: q.competency as string,
        status: "approved",
        reviewedBy: userIds["admin"],
        createdBy: userIds["expert1"],
      }).$returningId();
      questionIds.push(id);
    }
  }
  console.log("questions:", questionIds.length);

  // ---------- Candidates ----------
  const candSeed = [
    { nationalId: "1000000001", nameAr: "خالد بن سعد العتيبي", nameEn: "Khalid Al-Otaibi", email: "khalid@example.com", phone: "0500000001", fellowship: "زمالة القيادة الصحية", track: "إدارة المنشآت الصحية", cohort: "دفعة 2026" },
    { nationalId: "1000000002", nameAr: "ريم بنت فهد الشمري", nameEn: "Reem Al-Shammari", email: "reem@example.com", phone: "0500000002", fellowship: "زمالة القيادة الصحية", track: "إدارة المنشآت الصحية", cohort: "دفعة 2026" },
    { nationalId: "1000000003", nameAr: "عبدالعزيز بن ناصر القحطاني", nameEn: "Abdulaziz Al-Qahtani", email: "aziz@example.com", phone: "0500000003", fellowship: "زمالة القيادة الصحية", track: "إدارة المنشآت الصحية", cohort: "دفعة 2026" },
    { nationalId: "1000000004", nameAr: "لمى بنت سلطان الدوسري", nameEn: "Lama Al-Dossary", email: "lama@example.com", phone: "0500000004", fellowship: "زمالة القيادة الصحية", track: "إدارة المنشآت الصحية", cohort: "دفعة 2026" },
    { nationalId: "1000000005", nameAr: "فهد بن تركي الغامدي", nameEn: "Fahad Al-Ghamdi", email: "fahad@example.com", phone: "0500000005", fellowship: "زمالة القيادة الصحية", track: "إدارة المنشآت الصحية", cohort: "دفعة 2026" },
    { nationalId: "1000000006", nameAr: "هند بنت محمد الزهراني", nameEn: "Hind Al-Zahrani", email: "hind@example.com", phone: "0500000006", fellowship: "زمالة القيادة الصحية", track: "إدارة المنشآت الصحية", cohort: "دفعة 2026" },
  ];
  const candIds: number[] = [];
  for (const c of candSeed) {
    const existing = await db.query.candidates.findFirst({ where: eq(schema.candidates.nationalId, c.nationalId) });
    if (existing) { candIds.push(existing.id); continue; }
    const [{ id }] = await db.insert(schema.candidates).values({
      ...c,
      nationalIdMasked: maskNationalId(c.nationalId),
    }).$returningId();
    candIds.push(id);
  }
  console.log("candidates:", candIds.length);

  // ---------- Exam ----------
  let exam = await db.query.exams.findFirst({ where: eq(schema.exams.code, "EX-DEMO26") });
  if (!exam) {
    const [{ id }] = await db.insert(schema.exams).values({
      code: "EX-DEMO26",
      titleAr: "الاختبار الشامل النهائي — زمالة القيادة الصحية 2026",
      titleEn: "Final Comprehensive Exam — Health Leadership Fellowship 2026",
      fellowshipId: fellowship.id,
      description: "الاختبار الشامل لقياس الكفاءات المهنية للزمالة",
      instructionsAr: "أهلًا بك في الاختبار الشامل للزمالات المهنية.\n\n• مدة الاختبار 60 دقيقة.\n• الاختبار يعمل في وضع القفل الآمن: ممنوع الخروج من ملء الشاشة أو فتح تبويبات أخرى.\n• جميع تحركاتك مراقبة ومسجلة (تغيير التبويب، النسخ واللصق، الخروج من ملء الشاشة...).\n• إجاباتك تُحفظ تلقائيًا أولاً بأول.\n• عند انتهاء الوقت يُسلَّم الاختبار تلقائيًا.\n• يمنع استخدام أدوات الذكاء الاصطناعي — يوجد كاشف آلي للنصوص المولدة.\n\nبالضغط على «بدء الاختبار» أنت توافق على سياسة الاختبار والمراقبة.",
      instructionsEn: "Welcome to the Professional Fellowships Comprehensive Exam.\n\n• Duration: 60 minutes.\n• The exam runs in secure lockdown mode: leaving fullscreen or switching tabs is prohibited.\n• All your activity is monitored and logged (tab switches, copy/paste, fullscreen exits...).\n• Your answers are auto-saved continuously.\n• The exam auto-submits when time ends.\n• Using AI tools is prohibited — an automated AI-text detector is active.\n\nBy clicking \"Start Exam\" you agree to the exam and proctoring policy.",
      durationMin: 60,
      passScore: 60,
      shuffleQuestions: true,
      shuffleOptions: true,
      lockdown: true,
      proctoring: true,
      cameraRequired: false,
      status: "open",
      createdBy: userIds["admin"],
    }).$returningId();
    exam = (await db.query.exams.findFirst({ where: eq(schema.exams.id, id) }))!;

    // attach all approved questions
    let order = 1;
    for (const qid of questionIds) {
      const q = await db.query.questions.findFirst({ where: eq(schema.questions.id, qid) });
      await db.insert(schema.examQuestions).values({
        examId: exam.id,
        questionId: qid,
        points: q?.points ?? 1,
        sortOrder: order++,
        section: (q?.competency as string) ?? null,
      });
    }

    // register candidates
    for (const cid of candIds) {
      await db.insert(schema.examRegistrations).values({ examId: exam.id, candidateId: cid });
    }

    // expert2 assigned as supervising expert
    await db.insert(schema.examSupervisors).values({
      examId: exam.id, expertId: userIds["expert2"], assignedBy: userIds["admin"],
    });
  }
  console.log("exam:", exam.code);

  console.log("Seed completed.");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
