import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Lang = "ar" | "en";

const dict = {
  // ---------- general ----------
  platformName: { ar: "منصة اختبارات الزمالات المهنية", en: "Professional Fellowships Exam Platform" },
  platformShort: { ar: "الزمالات المهنية", en: "Professional Fellowships" },
  tagline: { ar: "منظومة الاختبارات الشاملة الآمنة", en: "Secure Comprehensive Exams System" },
  login: { ar: "تسجيل الدخول", en: "Sign In" },
  logout: { ar: "تسجيل الخروج", en: "Sign Out" },
  save: { ar: "حفظ", en: "Save" },
  cancel: { ar: "إلغاء", en: "Cancel" },
  delete: { ar: "حذف", en: "Delete" },
  edit: { ar: "تعديل", en: "Edit" },
  add: { ar: "إضافة", en: "Add" },
  search: { ar: "بحث", en: "Search" },
  actions: { ar: "إجراءات", en: "Actions" },
  status: { ar: "الحالة", en: "Status" },
  name: { ar: "الاسم", en: "Name" },
  back: { ar: "رجوع", en: "Back" },
  next: { ar: "التالي", en: "Next" },
  previous: { ar: "السابق", en: "Previous" },
  submit: { ar: "إرسال", en: "Submit" },
  confirm: { ar: "تأكيد", en: "Confirm" },
  loading: { ar: "جارٍ التحميل...", en: "Loading..." },
  yes: { ar: "نعم", en: "Yes" },
  no: { ar: "لا", en: "No" },
  all: { ar: "الكل", en: "All" },
  view: { ar: "عرض", en: "View" },
  close: { ar: "إغلاق", en: "Close" },
  minutes: { ar: "دقيقة", en: "min" },

  // ---------- landing ----------
  heroTitle: { ar: "منصة الاختبارات الشاملة للزمالات المهنية", en: "Comprehensive Exam Platform for Professional Fellowships" },
  heroSub: {
    ar: "إنشاء وإدارة وتنفيذ الاختبارات المهنية بأمان تام — بنك أسئلة ذكي، توليد أسئلة بالذكاء الاصطناعي، مراقبة إلكترونية ذكية، ووضع قفل آمن للأجهزة.",
    en: "Create, manage and run professional exams securely — smart question bank, AI question generation, intelligent proctoring, and a secure device lockdown mode.",
  },
  staffPortal: { ar: "بوابة الموظفين", en: "Staff Portal" },
  candidatePortal: { ar: "دخول الزملاء للاختبار", en: "Candidate Exam Entry" },
  featuresTitle: { ar: "قدرات المنصة", en: "Platform Capabilities" },
  f1t: { ar: "بنك أسئلة مركزي", en: "Central Question Bank" },
  f1d: { ar: "إدارة الأسئلة بأنواعها مع دورة مراجعة واعتماد كاملة ورفع جماعي.", en: "Manage all question types with full review workflow and bulk upload." },
  f2t: { ar: "توليد أسئلة بالذكاء الاصطناعي", en: "AI Question Generation" },
  f2d: { ar: "توليد أسئلة جديدة وأسئلة مشابهة من بنك الأسئلة بضغطة واحدة.", en: "Generate new and similar questions from your bank in one click." },
  f3t: { ar: "وضع القفل الآمن", en: "Secure Lockdown Mode" },
  f3d: { ar: "بيئة اختبار مقيدة تمنع الخروج والتطبيقات الأخرى، مع نسخة سطح مكتب للأجهزة.", en: "Restricted exam environment blocking exit and other apps, with a desktop version." },
  f4t: { ar: "مراقبة ذكية", en: "Smart Proctoring" },
  f4d: { ar: "رصد كل التحركات: تغيير التبويب، النسخ، الخروج من ملء الشاشة، وتصنيف المخالفات.", en: "Tracks every move: tab switches, copy/paste, fullscreen exits, and violation scoring." },
  f5t: { ar: "كاشف الذكاء الاصطناعي", en: "AI Usage Detector" },
  f5d: { ar: "تحليل إجابات الأسئلة المفتوحة لكشف احتمالية توليدها بالذكاء الاصطناعي.", en: "Analyzes open answers to detect likely AI-generated text." },
  f6t: { ar: "تصحيح ذكي معتمد", en: "AI-Assisted Grading" },
  f6d: { ar: "اقتراح تصحيح آلي للأسئلة المفتوحة يراجعه الخبير ويعتمده أو يعدله.", en: "AI grading suggestions for open questions, reviewed and approved by experts." },
  f7t: { ar: "خلط الأسئلة", en: "Question Shuffling" },
  f7d: { ar: "ترتيب مختلف للأسئلة والخيارات لكل زميل لمنع تطابق النماذج.", en: "Different question and option order for every candidate." },
  f8t: { ar: "عداد وتمديد", en: "Timer & Extensions" },
  f8d: { ar: "عداد تنازلي دقيق مع صلاحية التمديد للمدير والخبير المشرف.", en: "Accurate countdown with extension rights for admins and supervising experts." },

  // ---------- auth ----------
  username: { ar: "اسم المستخدم", en: "Username" },
  password: { ar: "كلمة المرور", en: "Password" },
  loginTitle: { ar: "دخول الموظفين", en: "Staff Sign In" },
  loginSub: { ar: "للمديرين والخبراء فقط — الزملاء يدخلون من بوابة الاختبار", en: "For admins and experts — candidates use the exam portal" },
  invalidLogin: { ar: "بيانات الدخول غير صحيحة", en: "Invalid credentials" },

  // ---------- dashboard ----------
  dashboard: { ar: "لوحة التحكم", en: "Dashboard" },
  overview: { ar: "نظرة عامة", en: "Overview" },
  exams: { ar: "الاختبارات", en: "Exams" },
  questionBank: { ar: "بنك الأسئلة", en: "Question Bank" },
  aiStudio: { ar: "استوديو الذكاء الاصطناعي", en: "AI Studio" },
  monitoring: { ar: "المراقبة المباشرة", en: "Live Monitoring" },
  grading: { ar: "التصحيح والاعتماد", en: "Grading & Approval" },
  results: { ar: "النتائج", en: "Results" },
  users: { ar: "المستخدمون", en: "Users" },
  candidates: { ar: "الزملاء", en: "Candidates" },
  auditLog: { ar: "سجل التدقيق", en: "Audit Log" },
  totalExams: { ar: "إجمالي الاختبارات", en: "Total Exams" },
  totalQuestions: { ar: "إجمالي الأسئلة", en: "Total Questions" },
  totalCandidates: { ar: "إجمالي الزملاء", en: "Total Candidates" },
  totalSessions: { ar: "جلسات الاختبار", en: "Exam Sessions" },
  welcome: { ar: "مرحبًا", en: "Welcome" },
  role_super_admin: { ar: "مدير النظام الأعلى", en: "Super Admin" },
  role_admin: { ar: "مدير الاختبارات", en: "Exam Admin" },
  role_expert: { ar: "خبير", en: "Expert" },

  // ---------- exams ----------
  createExam: { ar: "إنشاء اختبار", en: "Create Exam" },
  examTitle: { ar: "عنوان الاختبار", en: "Exam Title" },
  examTitleEn: { ar: "العنوان بالإنجليزية", en: "English Title" },
  examCode: { ar: "رمز الاختبار", en: "Exam Code" },
  duration: { ar: "المدة (دقيقة)", en: "Duration (min)" },
  passScore: { ar: "درجة الاجتياز %", en: "Pass Score %" },
  shuffleQuestions: { ar: "خلط الأسئلة", en: "Shuffle Questions" },
  shuffleOptions: { ar: "خلط الخيارات", en: "Shuffle Options" },
  lockdownMode: { ar: "وضع القفل الآمن", en: "Secure Lockdown" },
  proctoringMode: { ar: "المراقبة الذكية", en: "Smart Proctoring" },
  cameraRequired: { ar: "الكاميرا مطلوبة", en: "Camera Required" },
  instructions: { ar: "التعليمات", en: "Instructions" },
  openAt: { ar: "وقت الفتح", en: "Opens At" },
  closeAt: { ar: "وقت الإغلاق", en: "Closes At" },
  status_draft: { ar: "مسودة", en: "Draft" },
  status_open: { ar: "مفتوح", en: "Open" },
  status_closed: { ar: "مغلق", en: "Closed" },
  status_archived: { ar: "مؤرشف", en: "Archived" },
  manageExam: { ar: "إدارة الاختبار", en: "Manage Exam" },
  addQuestions: { ar: "إضافة أسئلة", en: "Add Questions" },
  supervisors: { ar: "الخبراء المشرفون", en: "Supervising Experts" },
  assignSupervisor: { ar: "تعيين خبير مشرف", en: "Assign Supervisor" },
  registeredCandidates: { ar: "الزملاء المسجلون", en: "Registered Candidates" },
  registerCandidate: { ar: "تسجيل زميل برقم الهوية", en: "Register by National ID" },
  nationalId: { ar: "رقم الهوية", en: "National ID" },
  publishResults: { ar: "نشر النتائج", en: "Publish Results" },
  hideResults: { ar: "إخفاء النتائج", en: "Hide Results" },
  extendTime: { ar: "تمديد الوقت", en: "Extend Time" },
  openExam: { ar: "فتح الاختبار", en: "Open Exam" },
  closeExam: { ar: "إغلاق الاختبار", en: "Close Exam" },
  noAccessExam: { ar: "لا تملك صلاحية إدارة هذا الاختبار", en: "You don't have access to manage this exam" },
  createdByYou: { ar: "أنشأته", en: "Created by you" },
  supervising: { ar: "مشرف عليه", en: "Supervising" },

  // ---------- questions ----------
  createQuestion: { ar: "إنشاء سؤال", en: "Create Question" },
  questionText: { ar: "نص السؤال", en: "Question Text" },
  questionTextEn: { ar: "نص السؤال بالإنجليزية", en: "English Question Text" },
  questionType: { ar: "نوع السؤال", en: "Question Type" },
  type_single: { ar: "اختيار واحد", en: "Single Choice" },
  type_multiple: { ar: "اختيار متعدد", en: "Multiple Response" },
  type_truefalse: { ar: "صح / خطأ", en: "True / False" },
  type_short: { ar: "إجابة قصيرة", en: "Short Answer" },
  type_essay: { ar: "مقالي / مفتوح", en: "Essay / Open" },
  type_numeric: { ar: "رقمي", en: "Numeric" },
  options: { ar: "الخيارات", en: "Options" },
  correctAnswer: { ar: "الإجابة الصحيحة", en: "Correct Answer" },
  modelAnswer: { ar: "الإجابة النموذجية", en: "Model Answer" },
  points: { ar: "الدرجة", en: "Points" },
  difficulty: { ar: "الصعوبة", en: "Difficulty" },
  diff_easy: { ar: "سهل", en: "Easy" },
  diff_medium: { ar: "متوسط", en: "Medium" },
  diff_hard: { ar: "صعب", en: "Hard" },
  competency: { ar: "الكفاءة / المحور", en: "Competency" },
  qstatus_draft: { ar: "مسودة", en: "Draft" },
  qstatus_pending_review: { ar: "قيد المراجعة", en: "Pending Review" },
  qstatus_approved: { ar: "معتمد", en: "Approved" },
  qstatus_rejected: { ar: "مرفوض", en: "Rejected" },
  submitReview: { ar: "إرسال للمراجعة", en: "Submit for Review" },
  approve: { ar: "اعتماد", en: "Approve" },
  reject: { ar: "رفض", en: "Reject" },
  uploadQuestions: { ar: "رفع أسئلة", en: "Upload Questions" },
  aiGenerated: { ar: "مولّد بالذكاء", en: "AI Generated" },
  generateSimilar: { ar: "توليد مشابهة", en: "Generate Similar" },
  bank: { ar: "البنك", en: "Bank" },
  createBank: { ar: "إنشاء بنك أسئلة", en: "Create Bank" },

  // ---------- AI studio ----------
  aiGenerateTitle: { ar: "توليد أسئلة بالذكاء الاصطناعي", en: "AI Question Generation" },
  topic: { ar: "الموضوع", en: "Topic" },
  count: { ar: "العدد", en: "Count" },
  generate: { ar: "توليد", en: "Generate" },
  aiNote: { ar: "الأسئلة المولدة تُحفظ كمسودات وتحتاج مراجعة واعتماد قبل استخدامها في الاختبارات.", en: "Generated questions are saved as drafts and require review before exam use." },

  // ---------- grading ----------
  gradingQueue: { ar: "قائمة التصحيح", en: "Grading Queue" },
  candidateAnswer: { ar: "إجابة الزميل", en: "Candidate Answer" },
  aiSuggestion: { ar: "الاقتراح الذكي", en: "AI Suggestion" },
  aiDetector: { ar: "كاشف الذكاء الاصطناعي", en: "AI Detector" },
  approveAiScore: { ar: "اعتماد الاقتراح", en: "Approve Suggestion" },
  modifyScore: { ar: "تعديل الدرجة", en: "Modify Score" },
  finalScore: { ar: "الدرجة النهائية", en: "Final Score" },
  graderComments: { ar: "ملاحظات المصحح", en: "Grader Comments" },
  approveResult: { ar: "اعتماد النتيجة", en: "Approve Result" },
  noAnswer: { ar: "بدون إجابة", en: "No Answer" },
  aiScore: { ar: "درجة الذكاء", en: "AI Score" },
  passed: { ar: "ناجح", en: "Passed" },
  failed: { ar: "غير ناجح", en: "Failed" },
  percentage: { ar: "النسبة", en: "Percentage" },
  adjustResult: { ar: "تعديل النتيجة", en: "Adjust Result" },
  adjustReason: { ar: "سبب التعديل", en: "Adjustment Reason" },
  regenerate: { ar: "إعادة التوليد", en: "Regenerate" },

  // ---------- monitoring ----------
  liveSessions: { ar: "الجلسات النشطة", en: "Live Sessions" },
  riskScore: { ar: "درجة الخطورة", en: "Risk Score" },
  events: { ar: "الأحداث", en: "Events" },
  terminate: { ar: "إيقاف الجلسة", en: "Terminate" },
  terminateReason: { ar: "سبب الإيقاف", en: "Termination Reason" },
  reviewEvent: { ar: "مراجعة الحدث", en: "Review Event" },
  decision_clean: { ar: "سليم", en: "Clean" },
  decision_suspicious: { ar: "مشتبه", en: "Suspicious" },
  decision_violation: { ar: "مخالفة", en: "Violation" },
  severity_info: { ar: "معلوماتي", en: "Info" },
  severity_low: { ar: "منخفض", en: "Low" },
  severity_medium: { ar: "متوسط", en: "Medium" },
  severity_high: { ar: "مرتفع", en: "High" },
  severity_critical: { ar: "حرج", en: "Critical" },
  registered: { ar: "المسجلون", en: "Registered" },
  started: { ar: "بدأوا", en: "Started" },
  submitted: { ar: "سلّموا", en: "Submitted" },
  terminated: { ar: "موقوفون", en: "Terminated" },
  notStarted: { ar: "لم يبدأوا", en: "Not Started" },
  activeNow: { ar: "نشطون الآن", en: "Active Now" },

  // ---------- candidate flow ----------
  enterExam: { ar: "الدخول للاختبار", en: "Enter Exam" },
  examEntrySub: { ar: "أدخل رمز الاختبار ورقم الهوية الوطنية", en: "Enter exam code and national ID" },
  verify: { ar: "تحقق ودخول", en: "Verify & Enter" },
  instructionsTitle: { ar: "تعليمات الاختبار", en: "Exam Instructions" },
  consentPolicy: { ar: "أوافق على سياسة الاختبار وأتعهد بعدم الغش", en: "I agree to the exam policy and pledge not to cheat" },
  consentProctoring: { ar: "أوافق على المراقبة الإلكترونية وتسجيل نشاطي أثناء الاختبار", en: "I consent to electronic proctoring and activity recording during the exam" },
  deviceCheck: { ar: "فحص الجهاز", en: "Device Check" },
  checkScreen: { ar: "دقة الشاشة", en: "Screen Resolution" },
  checkBrowser: { ar: "المتصفح", en: "Browser" },
  checkInternet: { ar: "الاتصال بالإنترنت", en: "Internet Connection" },
  checkCamera: { ar: "الكاميرا", en: "Camera" },
  startExam: { ar: "بدء الاختبار", en: "Start Exam" },
  timeRemaining: { ar: "الوقت المتبقي", en: "Time Remaining" },
  question: { ar: "سؤال", en: "Question" },
  of: { ar: "من", en: "of" },
  flagQuestion: { ar: "وضع علامة للمراجعة", en: "Flag for Review" },
  submitExam: { ar: "تسليم الاختبار", en: "Submit Exam" },
  submitConfirm: { ar: "هل أنت متأكد من تسليم الاختبار؟ لا يمكن التراجع بعد التسليم.", en: "Are you sure you want to submit? This cannot be undone." },
  unansweredCount: { ar: "أسئلة غير مجابة", en: "Unanswered questions" },
  examSubmitted: { ar: "تم تسليم الاختبار بنجاح", en: "Exam Submitted Successfully" },
  resultLater: { ar: "ستظهر النتيجة بعد اعتمادها ونشرها من الإدارة.", en: "Your result will appear after approval and publishing by the administration." },
  checkResult: { ar: "الاستعلام عن النتيجة", en: "Check Result" },
  autoSaved: { ar: "حفظ تلقائي", en: "Auto-saved" },
  secureModeActive: { ar: "وضع القفل الآمن مفعّل", en: "Secure Lockdown Active" },
  fullscreenRequired: { ar: "ملء الشاشة مطلوب للمتابعة", en: "Fullscreen is required to continue" },
  returnFullscreen: { ar: "العودة لملء الشاشة", en: "Return to Fullscreen" },
  warningTitle: { ar: "تنبيه مراقبة", en: "Proctoring Warning" },
  tabSwitchWarning: { ar: "تم رصد مغادرة صفحة الاختبار! هذا الحدث مسجل وقد يؤدي لإيقاف اختبارك.", en: "Leaving the exam page detected! This event is logged and may terminate your exam." },
  answered: { ar: "مجاب", en: "Answered" },
  unanswered: { ar: "غير مجاب", en: "Unanswered" },
  flagged: { ar: "معلَّم", en: "Flagged" },
  typeYourAnswer: { ar: "اكتب إجابتك هنا...", en: "Type your answer here..." },
  trueLabel: { ar: "صح", en: "True" },
  falseLabel: { ar: "خطأ", en: "False" },
  examTerminated: { ar: "تم إيقاف جلستك من قبل المراقب", en: "Your session was terminated by the proctor" },

  // ---------- users ----------
  createUser: { ar: "إنشاء مستخدم", en: "Create User" },
  role: { ar: "الدور", en: "Role" },
  email: { ar: "البريد الإلكتروني", en: "Email" },
  active: { ar: "نشط", en: "Active" },
  importCandidates: { ar: "استيراد زملاء (لصق)", en: "Import Candidates (Paste)" },
  importHint: { ar: "سطر لكل زميل: رقم الهوية, الاسم, الاسم بالإنجليزية, البريد, الجوال, الزمالة, المسار, الدفعة", en: "One per line: National ID, Name, English name, Email, Phone, Fellowship, Track, Cohort" },
  createCandidate: { ar: "إضافة زميل", en: "Add Candidate" },
  phone: { ar: "الجوال", en: "Phone" },
  fellowship: { ar: "الزمالة", en: "Fellowship" },
  track: { ar: "المسار", en: "Track" },
  cohort: { ar: "الدفعة", en: "Cohort" },

  // ---------- desktop ----------
  desktopApp: { ar: "نسخة سطح المكتب الآمنة", en: "Secure Desktop Version" },
  desktopDesc: {
    ar: "نسخة قابلة للتنزيل على الأجهزة تقفل الجهاز بالكامل أثناء الاختبار وتتصل بالمنصة فقط لجلب الأسئلة وتسليم الإجابات.",
    en: "A downloadable desktop app that fully locks the device during exams and connects only to this platform to fetch questions and submit answers.",
  },
  downloadDesktop: { ar: "تنزيل نسخة سطح المكتب", en: "Download Desktop App" },
} as const;

export type DictKey = keyof typeof dict;

type I18nCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: DictKey) => string;
  dir: "rtl" | "ltr";
};

const Ctx = createContext<I18nCtx>({
  lang: "ar",
  setLang: () => {},
  t: (k) => k,
  dir: "rtl",
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem("lang") as Lang) || "ar");
  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  };
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  const t = (k: DictKey) => dict[k]?.[lang] ?? k;
  const dir = lang === "ar" ? "rtl" : "ltr";
  return <Ctx.Provider value={{ lang, setLang, t, dir }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
