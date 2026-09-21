/* ============================================================================
 * الاستيراد الذكي للأسئلة (ملاحظة 8) — محلّل نقي بلا React
 *
 * يقبل نصًا حرًا (منسوخًا من Word/PDF/Excel) أو JSON أو جدولًا مفصولًا بعلامات جدولة، ويستنتج
 * نوع كل سؤال تلقائيًا:
 *   - خيارات بحروف (أ ب ج د / A B C D / • -) → اختيار من واحد، ويصبح "متعدد" إن حُدِّدت أكثر من إجابة.
 *   - خيارا "صح/خطأ" أو عبارة "صح أم خطأ" → صح/خطأ.
 *   - بلا خيارات: إجابة رقمية → رقمي، إجابة قصيرة → قصير، وإلا → مقالي (مع الإجابة النموذجية إن وُجدت).
 * علامات الإجابة الصحيحة: * أو ✓ أو (صح) بجانب الخيار، أو سطر "الإجابة: ب" / "Answer: B" / "الإجابة: أ، ج".
 * الدرجات: "(3 درجات)" أو "[3]" في نهاية نص السؤال. نوع صريح: [مقالي] [صح/خطأ] [متعدد] [قصير] [رقمي].
 * ========================================================================== */

export type ImportType = "single" | "multiple" | "truefalse" | "short" | "essay" | "numeric";
export type ImportedOption = { id: string; textAr: string; textEn: string };
export type ImportedQuestion = {
  type: ImportType;
  textAr: string;
  options?: ImportedOption[];
  correctAnswer?: string | string[] | number;
  modelAnswer?: string;
  points: number;
  difficulty: "easy" | "medium" | "hard";
  competency?: string;
  explanation?: string; // الشرح/التعليل — يظهر للمصحّح فقط
  warnings: string[];
};

const LETTERS = "ABCDEFGHIJ";
const AR_LETTER_MAP: Record<string, number> = { "أ": 0, "ا": 0, "إ": 0, "آ": 0, "ب": 1, "ج": 2, "د": 3, "ه": 4, "هـ": 4, "و": 5, "ز": 6, "ح": 7, "ط": 8, "ي": 9 };
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

const RE_QNUM = /^\s*(?:س|سؤال|Q|Question)?\s*[\(\[]?(\d{1,3})[\)\]\.\-:،/]\s*(.*)$/i;
const RE_OPTION = /^\s*[\(\[]?(هـ|[أاإآبجدهوزحطي]|[A-Ja-j])\s*[\)\]\.\-:،]\s+(.+)$/;
const RE_BULLET = /^\s*[•\-*○□▪◦]\s+(.+)$/;
const RE_ANSWER = /^\s*(?:الإجابة الصحيحة|الاجابة الصحيحة|الإجابة|الاجابة|الجواب الصحيح|الجواب|الحل|المفتاح|Answer|Ans|Correct(?: answer)?|Key)\s*[:：\-]?\s*(.+)$/i;
const RE_COMPETENCY = /^\s*(?:الكفاءة|المجال|المحور|الموضوع|Competency|Topic|Domain)\s*[:：\-]\s*(.+)$/i;
const RE_EXPLANATION = /^\s*(?:الشرح|التعليل|التفسير|Explanation|Rationale)\s*[:：\-]\s*(.+)$/i;
const RE_DIFFICULTY = /^\s*(?:الصعوبة|المستوى|Difficulty|Level)\s*[:：\-]\s*(.+)$/i;
const RE_MODEL = /^\s*(?:الإجابة النموذجية|الاجابة النموذجية|نموذج الإجابة|الإجابة المتوقعة|Model answer|Rubric)\s*[:：\-]?\s*(.+)$/i;
const RE_POINTS = /[\(\[]\s*(\d+(?:\.\d+)?)\s*(?:درجة|درجات|درجتان|درجتين|نقطة|نقاط|نقطتان|نقطتين|علامة|علامات|pts?|points?|marks?)?\s*[\)\]]\s*$/i;
const RE_TYPE = /\[\s*(مقالي|مقالية|صح\s*\/?\s*(?:أو|او|أم|ام)?\s*خطأ|صح\/خطأ|اختيار متعدد|متعدد|اختيار|اختيار من متعدد|قصير|قصيرة|رقمي|رقمية|essay|tf|true\/?false|mcq|single|multiple|short|numeric)\s*\]/i;
const RE_CORRECT_MARK = /(^\s*[*✓✔√]+\s*|\s*[*✓✔√]+\s*$|\s*[\(\[]\s*(?:صح|صحيح|صحيحة|correct|✓)\s*[\)\]]\s*$)/i;
const TRUE_WORDS = /^(صح|صحيح|صحيحة|نعم|true|t|yes)$/i;
const FALSE_WORDS = /^(خطأ|خاطئ|خاطئة|لا|false|f|no)$/i;

function letterIndex(mark: string): number | null {
  if (/^[A-Ja-j]$/.test(mark)) return LETTERS.indexOf(mark.toUpperCase());
  if (mark in AR_LETTER_MAP) return AR_LETTER_MAP[mark];
  return null;
}

function typeFromMarker(m: string): ImportType | null {
  const s = m.toLowerCase().replace(/\s+/g, "");
  if (/مقالي/.test(s) || s === "essay") return "essay";
  if (/صح/.test(s) || /^(tf|true\/?false)$/.test(s)) return "truefalse";
  if (/متعدد/.test(s) || s === "multiple" || s === "mcq") return s === "mcq" ? "single" : "multiple";
  if (/اختيار/.test(s) || s === "single") return "single";
  if (/قصير/.test(s) || s === "short") return "short";
  if (/رقمي/.test(s) || s === "numeric") return "numeric";
  return null;
}

type Block = { text: string[]; options: { mark: string | null; text: string; correct: boolean }[]; answer?: string; model?: string; competency?: string; difficulty?: string; explanation?: string; type?: ImportType | null; points?: number };

function difficultyOf(v: string | undefined): "easy" | "medium" | "hard" | undefined {
  if (!v) return undefined;
  const t = v.trim().toLowerCase();
  if (/سهل|easy|منخفض/.test(t)) return "easy";
  if (/صعب|hard|مرتفع|عالي/.test(t)) return "hard";
  if (/متوسط|medium|normal/.test(t)) return "medium";
  return undefined;
}

function finalizeBlock(b: Block): ImportedQuestion | null {
  const warnings: string[] = [];
  let text = b.text.join("\n").trim();
  if (!text) return null;
  let forced: ImportType | null = b.type ?? null;
  const tm = RE_TYPE.exec(text);
  if (tm) { forced = typeFromMarker(tm[1]) ?? forced; text = text.replace(RE_TYPE, "").trim(); }
  let points = b.points ?? 1;
  const pm = RE_POINTS.exec(text);
  if (pm) { points = Math.max(1, Math.round(parseFloat(pm[1]))); text = text.replace(RE_POINTS, "").trim(); }
  // إزالة الترقيم من بداية السؤال
  text = text.replace(/^\s*(?:س|سؤال|Q|Question)?\s*[\(\[]?\d{1,3}[\)\]\.\-:،/]\s*/i, "").trim();
  if (text.length < 3) return null;

  // الخيارات
  const opts = b.options.map((o, i) => ({ id: LETTERS[i] ?? String(i + 1), textAr: o.text.trim(), textEn: o.text.trim(), correct: o.correct }));
  // صح/خطأ من الخيارات
  const isTF = opts.length === 2 && ((TRUE_WORDS.test(opts[0].textAr) && FALSE_WORDS.test(opts[1].textAr)) || (FALSE_WORDS.test(opts[0].textAr) && TRUE_WORDS.test(opts[1].textAr)));
  const textSaysTF = /(صح\s*(?:أم|ام|أو|او|\/)\s*خطأ|\(\s*صح\s*\/\s*خطأ\s*\)|true\s*(?:or|\/)\s*false)/i.test(text);

  // سطر الإجابة → مؤشرات
  let answerIdx: number[] = [];
  let answerRaw = b.answer?.trim() ?? "";
  if (answerRaw) {
    const parts = toLatinDigits(answerRaw).split(/[,،\/&+]|\s+و\s+|\s+and\s+|\s+/i).map((p) => p.trim().replace(/[\)\.\-:]$/, "")).filter(Boolean);
    for (const p of parts) {
      const li = letterIndex(p);
      if (li !== null && li < opts.length) answerIdx.push(li);
      else if (/^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= opts.length) answerIdx.push(Number(p) - 1);
    }
    answerIdx = [...new Set(answerIdx)];
  }
  const markedIdx = opts.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
  const correctIdx = markedIdx.length ? markedIdx : answerIdx;

  let type: ImportType;
  let correctAnswer: string | string[] | number | undefined;
  let modelAnswer: string | undefined = b.model?.trim();
  let options: ImportedOption[] | undefined;

  if (forced === "truefalse" || isTF || (textSaysTF && opts.length === 0)) {
    type = "truefalse";
    options = [{ id: "T", textAr: "صح", textEn: "True" }, { id: "F", textAr: "خطأ", textEn: "False" }];
    let tf: "T" | "F" | undefined;
    if (isTF && correctIdx.length) tf = TRUE_WORDS.test(opts[correctIdx[0]].textAr) ? "T" : "F";
    else if (answerRaw) tf = TRUE_WORDS.test(answerRaw) ? "T" : FALSE_WORDS.test(answerRaw) ? "F" : undefined;
    if (!tf) warnings.push("لم تُحدَّد إجابة صح/خطأ — راجع السؤال بعد الاستيراد");
    correctAnswer = tf;
  } else if (opts.length >= 2 || forced === "single" || forced === "multiple") {
    if (opts.length < 2) { warnings.push("خيارات أقل من اثنين — سيُستورد كسؤال مقالي"); type = "essay"; }
    else {
      type = forced === "multiple" || correctIdx.length > 1 || /اختر\s+(كل|جميع)|أكثر من إجابة|multiple/i.test(text) ? "multiple" : (forced ?? "single");
      options = opts.map(({ id, textAr, textEn }) => ({ id, textAr, textEn }));
      if (correctIdx.length === 0) warnings.push("لم تُحدَّد الإجابة الصحيحة — ضع * بجانب الخيار أو سطر «الإجابة: ب»");
      else correctAnswer = type === "multiple" ? correctIdx.map((i) => opts[i].id) : opts[correctIdx[0]].id;
    }
  } else if (forced === "numeric" || (answerRaw && /^[-+]?\d+(\.\d+)?$/.test(toLatinDigits(answerRaw).replace(/,/g, "")))) {
    type = "numeric";
    const n = Number(toLatinDigits(answerRaw).replace(/,/g, ""));
    if (Number.isNaN(n)) warnings.push("الإجابة الرقمية غير صالحة"); else correctAnswer = n;
  } else if (forced === "short" || (answerRaw && answerRaw.split(/\s+/).length <= 8 && !modelAnswer)) {
    type = "short";
    if (answerRaw) correctAnswer = answerRaw; else warnings.push("لم تُحدَّد الإجابة الصحيحة للسؤال القصير");
  } else {
    type = forced ?? "essay";
    if (!modelAnswer && answerRaw) modelAnswer = answerRaw;
    if (!modelAnswer) warnings.push("لا توجد إجابة نموذجية — التصحيح يدوي بالكامل");
  }
  // السؤال المقالي القصير عادةً بدرجات أعلى: نبقي القيمة كما وردت
  return { type, textAr: text, options, correctAnswer, modelAnswer: modelAnswer || undefined, points, difficulty: difficultyOf(b.difficulty) ?? "medium", competency: b.competency?.trim() || undefined, explanation: b.explanation?.trim() || undefined, warnings };
}

/** التحليل من نص حر (كتل أسئلة) */
export function parseBlocks(text: string): ImportedQuestion[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let lastBlank = true;
  const mk = (first: string): Block => { const b: Block = { text: [first], options: [] }; blocks.push(b); return b; };
  for (const raw of lines) {
    const line = raw.replace(/‏|‎|﻿/g, "").trimEnd();
    if (!line.trim()) { lastBlank = true; continue; }
    if (/^\s*(#|\/\/)/.test(line)) continue; // سطر تعليق/عنوان ملف — يُتجاهل
    const ln = toLatinDigits(line);
    const q = RE_QNUM.exec(ln);
    const opt = RE_OPTION.exec(line) ?? (cur ? RE_BULLET.exec(line) : null);
    const ans = RE_ANSWER.exec(line);
    const model = RE_MODEL.exec(line);
    const comp = RE_COMPETENCY.exec(line);
    const diff = RE_DIFFICULTY.exec(line);
    const expl = RE_EXPLANATION.exec(line);
    if (expl && cur) { cur.explanation = expl[1]; lastBlank = false; continue; }
    if (comp && cur) { cur.competency = comp[1]; lastBlank = false; continue; }
    if (diff && cur) { cur.difficulty = diff[1]; lastBlank = false; continue; }
    if (model && cur) { cur.model = model[1]; lastBlank = false; continue; }
    if (ans && cur) { cur.answer = ans[1]; lastBlank = false; continue; }
    if (opt && cur) {
      const body = opt.length === 3 ? opt[2] : opt[1];
      const correct = RE_CORRECT_MARK.test(body) || RE_CORRECT_MARK.test(line.slice(0, 3));
      cur.options.push({ mark: opt.length === 3 ? opt[1] : null, text: body.replace(RE_CORRECT_MARK, "").trim(), correct });
      lastBlank = false; continue;
    }
    if (q && q[2].trim()) { cur = mk(line); lastBlank = false; continue; }
    if (q && !q[2].trim()) { cur = mk(""); lastBlank = false; continue; } // رقم في سطر مستقل والسؤال في السطر التالي
    // سطر نصي: سؤال جديد إن كان بعد فراغ أو بعد اكتمال الكتلة الحالية، وإلا تكملة للسؤال
    if (!cur || (lastBlank && (cur.options.length > 0 || cur.answer || cur.model)) || (cur.options.length > 0 || cur.answer)) cur = mk(line);
    else if (cur.text.length === 1 && cur.text[0] === "") cur.text[0] = line;
    else cur.text.push(line);
    lastBlank = false;
  }
  return blocks.map(finalizeBlock).filter((x): x is ImportedQuestion => !!x);
}

/** التحليل من صفوف جدول (Excel/CSV/لصق مفصول بعلامات جدولة): سؤال، خيارات...، الإجابة، الدرجة */
export function parseRows(rows: string[][]): ImportedQuestion[] {
  const out: ImportedQuestion[] = [];
  // وضع الرؤوس: إن كان الصف الأول عناوين معروفة نقرأ الأعمدة بالاسم (النوع/الخيارات/الإجابة/الدرجة/الكفاءة/النموذجية/الصعوبة)
  const header = rows[0]?.map((c) => (c ?? "").trim().toLowerCase()) ?? [];
  const findCol = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cText = findCol(/^(نص )?(السؤال|سؤال|question|text)$/);
  if (cText >= 0) {
    const cType = findCol(/^(النوع|نوع السؤال|type)$/);
    const cAns = findCol(/^(الإجابة|الاجابة|الإجابة الصحيحة|answer|correct)$/);
    const cModel = findCol(/^(الإجابة النموذجية|الاجابة النموذجية|نموذج الإجابة|model answer|model)$/);
    const cPts = findCol(/^(الدرجة|الدرجات|points|marks)$/);
    const cComp = findCol(/^(الكفاءة|المجال|المحور|competency|topic|domain)$/);
    const cDiff = findCol(/^(الصعوبة|المستوى|difficulty|level)$/);
    const cExpl = findCol(/^(الشرح|التعليل|التفسير|explanation|rationale)$/);
    const cOpts = header.map((h, i) => (/^(خيار\s*)?([أابجدهوزحطي]|هـ|[a-j]|option\s*[a-j0-9]|[1-9])$/.test(h) ? i : -1)).filter((i) => i >= 0);
    for (const r0 of rows.slice(1)) {
      const r = r0.map((c) => (c ?? "").trim());
      const text = r[cText];
      if (!text || text.length < 3) continue;
      const block: Block = {
        text: [text],
        options: cOpts.map((i) => r[i]).filter(Boolean).map((t) => ({ mark: null, text: t, correct: false })),
        answer: cAns >= 0 ? r[cAns] || undefined : undefined,
        model: cModel >= 0 ? r[cModel] || undefined : undefined,
        competency: cComp >= 0 ? r[cComp] || undefined : undefined,
        difficulty: cDiff >= 0 ? r[cDiff] || undefined : undefined,
        explanation: cExpl >= 0 ? r[cExpl] || undefined : undefined,
        type: cType >= 0 && r[cType] ? typeFromMarker(r[cType]) : null,
        points: cPts >= 0 && r[cPts] ? Math.max(1, Math.round(Number(toLatinDigits(r[cPts])) || 1)) : undefined,
      };
      // خيار واحد فقط بلا إجابة = إجابة سؤال قصير/رقمي وليست خيارًا
      if (!block.answer && block.options.length === 1) { block.answer = block.options[0].text; block.options = []; }
      // مقالي بلا خيارات: عمود الإجابة يُعدّ إجابة نموذجية
      if (block.type === "essay" && !block.model && block.answer) { block.model = block.answer; block.answer = undefined; }
      const q = finalizeBlock(block);
      if (q) out.push(q);
    }
    return out;
  }
  for (const [ri, r0] of rows.entries()) {
    const r = r0.map((c) => (c ?? "").trim());
    if (r.every((c) => !c)) continue;
    if (ri === 0 && /سؤال|question|النص|type|النوع/i.test(r[0] + " " + r[1])) continue; // صف عناوين
    // صيغة CSV القديمة: type,textAr,textEn,optA..optD,correct,points,difficulty,competency
    const legacy = ["single", "multiple", "truefalse", "short", "essay", "numeric"].includes(r[0].toLowerCase());
    const cells = legacy ? [r[1], ...r.slice(3, 7), r[7] ?? "", r[8] ?? ""] : r;
    const text = cells[0];
    if (!text || text.length < 3) continue;
    const rest = cells.slice(1);
    // آخر خلية رقمية صغيرة = الدرجة؛ الخلية التي تسبقها (حرف/رقم قصير) = الإجابة
    let points = 1;
    let tail = [...rest];
    if (tail.length >= 2 && /^\d+(\.\d+)?$/.test(tail[tail.length - 1]) && Number(tail[tail.length - 1]) <= 100 && !/^\d+$/.test(tail[tail.length - 2] || "x")) {
      points = Math.max(1, Math.round(Number(tail.pop()!)));
    }
    let answer = "";
    const last = tail[tail.length - 1] ?? "";
    const optCandidates = tail.slice(0, -1).filter(Boolean);
    const isKey = last && (letterIndex(last) !== null || /^[A-J](\s*[,،/]\s*[A-J])+$/i.test(last) || /^[أ-ي](\s*[,،/]\s*[أ-ي])+$/.test(last) || TRUE_WORDS.test(last) || FALSE_WORDS.test(last) || /^[-+]?\d+(\.\d+)?$/.test(toLatinDigits(last)) || (optCandidates.length >= 2 && !optCandidates.includes(last) && last.length <= 40));
    let options: string[];
    if (isKey) { answer = last; options = optCandidates; } else { options = tail.filter(Boolean); }
    // خلية واحدة فقط بعد السؤال = إجابة سؤال قصير/رقمي وليست خيارًا
    if (!answer && options.length === 1) { answer = options[0]; options = []; }
    const block: Block = { text: [text], options: options.map((t) => ({ mark: null, text: t, correct: false })), answer: answer || undefined };
    if (options.length === 0 && answer && answer.split(/\s+/).length > 8) { block.answer = undefined; block.model = answer; }
    if (legacy && r[0].toLowerCase() === "essay") { block.options = []; block.model = block.model ?? block.answer; block.answer = undefined; }
    const q = finalizeBlock(block);
    if (q) { q.points = points; out.push(q); }
  }
  return out;
}

/** التحليل من JSON (مرن في أسماء الحقول) */
export function parseJson(text: string): ImportedQuestion[] | null {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return null; }
  const list = Array.isArray(data) ? data : (data && typeof data === "object" && Array.isArray((data as { questions?: unknown }).questions)) ? (data as { questions: unknown[] }).questions : [data];
  const out: ImportedQuestion[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const text = String(o.textAr ?? o.text ?? o.question ?? o.q ?? "").trim();
    if (!text) continue;
    const rawOpts = (o.options ?? o.choices ?? o.answers) as unknown;
    const options = Array.isArray(rawOpts)
      ? rawOpts.map((x) => typeof x === "string" ? { mark: null, text: x, correct: false } : { mark: null, text: String((x as Record<string, unknown>).textAr ?? (x as Record<string, unknown>).text ?? ""), correct: !!(x as Record<string, unknown>).correct })
      : [];
    const correct = o.correctAnswer ?? o.correct ?? o.answer ?? o.key;
    const block: Block = { text: [text], options };
    if (Array.isArray(correct)) block.answer = correct.map(String).join("،");
    else if (correct !== undefined && correct !== null) block.answer = String(correct);
    if (o.modelAnswer) block.model = String(o.modelAnswer);
    const forced = typeof o.type === "string" ? typeFromMarker(String(o.type)) : null;
    const q = finalizeBlock(forced ? { ...block, text: [`${text} [${o.type}]`] } : block);
    if (!q) continue;
    if (typeof o.points === "number") q.points = Math.max(1, Math.round(o.points));
    if (["easy", "medium", "hard"].includes(String(o.difficulty))) q.difficulty = o.difficulty as "easy";
    if (typeof o.competency === "string" && o.competency.trim()) q.competency = o.competency.trim();
    if (typeof o.explanation === "string" && o.explanation.trim()) q.explanation = o.explanation.trim();
    out.push(q);
  }
  return out;
}

/** نقطة الدخول الموحّدة: يكتشف الصيغة (JSON / جدول / نص حر) تلقائيًا */
export function parseQuestionsSmart(text: string): { questions: ImportedQuestion[]; format: "json" | "table" | "text" } {
  const t = text.trim();
  if (t.startsWith("[") || t.startsWith("{")) {
    const j = parseJson(t);
    if (j) return { questions: j, format: "json" };
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  const tabbed = lines.filter((l) => l.split("\t").length >= 3).length;
  if (lines.length > 0 && tabbed / lines.length >= 0.6) {
    return { questions: parseRows(lines.map((l) => l.split("\t"))), format: "table" };
  }
  return { questions: parseBlocks(t), format: "text" };
}
