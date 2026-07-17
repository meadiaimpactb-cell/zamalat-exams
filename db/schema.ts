import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  int,
  bigint,
  boolean,
  timestamp,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/* ---------------------------------- Staff users ---------------------------------- */
export const users = mysqlTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 100 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    nameAr: varchar("nameAr", { length: 255 }).notNull(),
    nameEn: varchar("nameEn", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    role: mysqlEnum("role", ["super_admin", "admin", "expert"]).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_username_uq").on(t.username)],
);

export const staffSessions = mysqlTable(
  "staff_sessions",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    token: varchar("token", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  (t) => [uniqueIndex("staff_sessions_token_uq").on(t.token), index("staff_sessions_user_idx").on(t.userId)],
);

/* ---------------------------------- Candidates ---------------------------------- */
export const candidates = mysqlTable(
  "candidates",
  {
    id: serial("id").primaryKey(),
    nationalId: varchar("nationalId", { length: 20 }).notNull(),
    nationalIdMasked: varchar("nationalIdMasked", { length: 20 }).notNull(),
    nameAr: varchar("nameAr", { length: 255 }).notNull(),
    nameEn: varchar("nameEn", { length: 255 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 30 }),
    fellowship: varchar("fellowship", { length: 255 }),
    track: varchar("track", { length: 255 }),
    cohort: varchar("cohort", { length: 100 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("candidates_nid_uq").on(t.nationalId)],
);

/* ---------------------------------- Fellowships ---------------------------------- */
export const fellowships = mysqlTable("fellowships", {
  id: serial("id").primaryKey(),
  nameAr: varchar("nameAr", { length: 255 }).notNull(),
  nameEn: varchar("nameEn", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

/* ---------------------------------- Question bank ---------------------------------- */
export const questionBanks = mysqlTable("question_banks", {
  id: serial("id").primaryKey(),
  fellowshipId: bigint("fellowshipId", { mode: "number", unsigned: true }),
  nameAr: varchar("nameAr", { length: 255 }).notNull(),
  nameEn: varchar("nameEn", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type QuestionOption = { id: string; textAr: string; textEn: string };

export const questions = mysqlTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    bankId: bigint("bankId", { mode: "number", unsigned: true }).notNull(),
    type: mysqlEnum("type", ["single", "multiple", "truefalse", "short", "essay", "numeric"]).notNull(),
    textAr: text("textAr").notNull(),
    textEn: text("textEn"),
    options: json("options").$type<QuestionOption[]>(),
    correctAnswer: json("correctAnswer").$type<string[] | string | number>(),
    modelAnswer: text("modelAnswer"),
    explanation: text("explanation"),
    points: int("points").notNull().default(1),
    difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).notNull().default("medium"),
    competency: varchar("competency", { length: 255 }),
    status: mysqlEnum("status", ["draft", "pending_review", "approved", "rejected"]).notNull().default("draft"),
    aiGenerated: boolean("aiGenerated").notNull().default(false),
    sourceQuestionId: bigint("sourceQuestionId", { mode: "number", unsigned: true }),
    createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
    reviewedBy: bigint("reviewedBy", { mode: "number", unsigned: true }),
    reviewNotes: text("reviewNotes"),
    version: int("version").notNull().default(1),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("questions_bank_idx").on(t.bankId), index("questions_status_idx").on(t.status)],
);

/* ---------------------------------- Exams ---------------------------------- */
export const exams = mysqlTable(
  "exams",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 40 }).notNull(),
    titleAr: varchar("titleAr", { length: 255 }).notNull(),
    titleEn: varchar("titleEn", { length: 255 }),
    fellowshipId: bigint("fellowshipId", { mode: "number", unsigned: true }),
    description: text("description"),
    instructionsAr: text("instructionsAr"),
    instructionsEn: text("instructionsEn"),
    durationMin: int("durationMin").notNull().default(60),
    passScore: int("passScore").notNull().default(60), // percentage
    shuffleQuestions: boolean("shuffleQuestions").notNull().default(true),
    shuffleOptions: boolean("shuffleOptions").notNull().default(true),
    lockdown: boolean("lockdown").notNull().default(true),
    proctoring: boolean("proctoring").notNull().default(true),
    cameraRequired: boolean("cameraRequired").notNull().default(false),
    status: mysqlEnum("status", ["draft", "open", "closed", "archived"]).notNull().default("draft"),
    openAt: timestamp("openAt"),
    closeAt: timestamp("closeAt"),
    resultsPublished: boolean("resultsPublished").notNull().default(false),
    createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("exams_code_uq").on(t.code)],
);

export const examQuestions = mysqlTable(
  "exam_questions",
  {
    id: serial("id").primaryKey(),
    examId: bigint("examId", { mode: "number", unsigned: true }).notNull(),
    questionId: bigint("questionId", { mode: "number", unsigned: true }).notNull(),
    points: int("points").notNull().default(1),
    sortOrder: int("sortOrder").notNull().default(0),
    section: varchar("section", { length: 255 }),
  },
  (t) => [index("exam_questions_exam_idx").on(t.examId)],
);

// Experts assigned by admin to supervise/review an exam
export const examSupervisors = mysqlTable(
  "exam_supervisors",
  {
    id: serial("id").primaryKey(),
    examId: bigint("examId", { mode: "number", unsigned: true }).notNull(),
    expertId: bigint("expertId", { mode: "number", unsigned: true }).notNull(),
    assignedBy: bigint("assignedBy", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("exam_supervisors_uq").on(t.examId, t.expertId)],
);

export const examRegistrations = mysqlTable(
  "exam_registrations",
  {
    id: serial("id").primaryKey(),
    examId: bigint("examId", { mode: "number", unsigned: true }).notNull(),
    candidateId: bigint("candidateId", { mode: "number", unsigned: true }).notNull(),
    extraTimeMin: int("extraTimeMin").notNull().default(0),
    maxAttempts: int("maxAttempts").notNull().default(1),
    status: mysqlEnum("status", ["invited", "in_progress", "completed", "terminated"]).notNull().default("invited"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("exam_reg_uq").on(t.examId, t.candidateId)],
);

/* ---------------------------------- Exam sessions ---------------------------------- */
export const examSessions = mysqlTable(
  "exam_sessions",
  {
    id: serial("id").primaryKey(),
    registrationId: bigint("registrationId", { mode: "number", unsigned: true }).notNull(),
    token: varchar("token", { length: 128 }).notNull(),
    questionOrder: json("questionOrder").$type<number[]>(),
    optionOrders: json("optionOrders").$type<Record<string, string[]>>(),
    status: mysqlEnum("status", ["active", "submitted", "auto_submitted", "terminated"]).notNull().default("active"),
    startedAt: timestamp("startedAt").notNull().defaultNow(),
    deadline: timestamp("deadline").notNull(),
    timeAdjustmentSec: int("timeAdjustmentSec").notNull().default(0),
    submittedAt: timestamp("submittedAt"),
    lastActivityAt: timestamp("lastActivityAt").notNull().defaultNow(),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: text("userAgent"),
    riskScore: int("riskScore").notNull().default(0),
  },
  (t) => [uniqueIndex("exam_sessions_token_uq").on(t.token), index("exam_sessions_reg_idx").on(t.registrationId)],
);

export const answers = mysqlTable(
  "answers",
  {
    id: serial("id").primaryKey(),
    sessionId: bigint("sessionId", { mode: "number", unsigned: true }).notNull(),
    examQuestionId: bigint("examQuestionId", { mode: "number", unsigned: true }).notNull(),
    answer: json("answer").$type<string[] | string | number | null>(),
    answerText: text("answerText"),
    flagged: boolean("flagged").notNull().default(false),
    aiDetectionScore: int("aiDetectionScore"), // 0-100 likelihood the text is AI-generated
    aiDetectionLabel: varchar("aiDetectionLabel", { length: 40 }),
    updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("answers_uq").on(t.sessionId, t.examQuestionId)],
);

export const answerScores = mysqlTable(
  "answer_scores",
  {
    id: serial("id").primaryKey(),
    answerId: bigint("answerId", { mode: "number", unsigned: true }).notNull(),
    autoScore: int("autoScore"),
    aiSuggestedScore: int("aiSuggestedScore"),
    aiFeedback: text("aiFeedback"),
    finalScore: int("finalScore"),
    status: mysqlEnum("status", ["auto", "pending_review", "ai_suggested", "approved", "modified"]).notNull().default("pending_review"),
    graderId: bigint("graderId", { mode: "number", unsigned: true }),
    comments: text("comments"),
    gradedAt: timestamp("gradedAt"),
  },
  (t) => [uniqueIndex("answer_scores_answer_uq").on(t.answerId)],
);

/* ---------------------------------- Proctoring ---------------------------------- */
export const sessionEvents = mysqlTable(
  "session_events",
  {
    id: serial("id").primaryKey(),
    sessionId: bigint("sessionId", { mode: "number", unsigned: true }).notNull(),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    severity: mysqlEnum("severity", ["info", "low", "medium", "high", "critical"]).notNull().default("info"),
    details: text("details"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    reviewedBy: bigint("reviewedBy", { mode: "number", unsigned: true }),
    reviewDecision: varchar("reviewDecision", { length: 40 }),
  },
  (t) => [index("session_events_session_idx").on(t.sessionId)],
);

/* ---------------------------------- Results ---------------------------------- */
export const results = mysqlTable(
  "results",
  {
    id: serial("id").primaryKey(),
    sessionId: bigint("sessionId", { mode: "number", unsigned: true }).notNull(),
    totalScore: int("totalScore").notNull().default(0),
    maxScore: int("maxScore").notNull().default(0),
    percentage: int("percentage").notNull().default(0),
    passed: boolean("passed").notNull().default(false),
    gradingStatus: mysqlEnum("gradingStatus", ["pending", "in_review", "completed"]).notNull().default("pending"),
    approvedBy: bigint("approvedBy", { mode: "number", unsigned: true }),
    approvedAt: timestamp("approvedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("results_session_uq").on(t.sessionId)],
);

export const gradeAdjustments = mysqlTable("grade_adjustments", {
  id: serial("id").primaryKey(),
  resultId: bigint("resultId", { mode: "number", unsigned: true }).notNull(),
  oldScore: int("oldScore").notNull(),
  newScore: int("newScore").notNull(),
  reason: text("reason").notNull(),
  createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

/* ---------------------------------- Audit ---------------------------------- */
export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }),
    actorName: varchar("actorName", { length: 255 }),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entityType", { length: 80 }),
    entityId: bigint("entityId", { mode: "number", unsigned: true }),
    details: text("details"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Candidate = typeof candidates.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Exam = typeof exams.$inferSelect;
export type ExamSession = typeof examSessions.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type Result = typeof results.$inferSelect;
