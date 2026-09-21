/* ============================================================================
 * محلّل نصوص المعادلات البسيطة (ملاحظة 1) — نقي بلا React ليُختبر مستقلًا
 *
 * الهدف: أن تظهر المعادلة نفسها في الإنشاء والمعاينة وشاشة الاختبار والتصحيح والتقارير.
 * المشكلتان اللتان يعالجهما:
 *   1) انعكاس ترتيب المعادلة داخل الفقرة العربية (خوارزمية bidi تقلب "10 − 3 = 7") → تُعزل
 *      المقاطع الرياضية باتجاه LTR.
 *   2) خط الواجهة لا يغطي بعض الرموز → تُعرض المقاطع الرياضية بخط يغطيها (CSS .math-run).
 *
 * الصيغة المدعومة (بسيطة، دون مبرهنات معقدة):
 *   - رموز يونيكود مباشرة: + − × ÷ ± = ≠ ≤ ≥ √ π ° % ² ³ …
 *   - أس: x^2 أو x^{n+1}      - رمز سفلي: x_1 أو x_{ij}
 *   - جذر: sqrt(x+1) أو √(x+1)  - كسر: frac(a,b) أو (a)/(b)
 *   - مقطع رياضي صريح: $...$ (يُعزل LTR حتى لو لم يحتوِ عوامل)
 *   - كشف تلقائي: أي مقطع من أرقام/حروف لاتينية/عوامل يحتوي عاملًا رياضيًا واحدًا على الأقل.
 * ========================================================================== */

export type MathNode =
  | { kind: "text"; value: string }
  | { kind: "sup"; children: MathNode[] }
  | { kind: "sub"; children: MathNode[] }
  | { kind: "sqrt"; children: MathNode[] }
  | { kind: "frac"; num: MathNode[]; den: MathNode[] };

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "math"; nodes: MathNode[]; raw: string };

/** الأحرف المسموحة داخل مقطع رياضي مكتشَف تلقائيًا */
const MATH_CHARS = "0-9A-Za-z\\u03B1-\\u03C9\\u0391-\\u03A9\\u00B0\\u00B1\\u00B2\\u00B3\\u00B9\\u00BC-\\u00BE\\u00D7\\u00F7\\u2070-\\u209F\\u2190-\\u21FF\\u2200-\\u22FF\\u2150-\\u215E\\u221A-\\u221C\\u221E+\\-*/=<>^_(){}\\[\\]|.,:%!'\\s";
const MATH_OPERATORS = /[+−×÷=<>≤≥≠±√∛^_/*⁰-₟²³¹]|sqrt\(|frac\(/;
const AUTO_RUN = new RegExp(`[${MATH_CHARS}]+`, "g");

/** هل هذا المقطع رياضي فعلًا؟ يجب أن يحوي عاملًا ورقمًا/حرفًا لاتينيًا (لا مجرد فراغات أو كلمة إنجليزية) */
function looksMath(run: string): boolean {
  const t = run.trim();
  if (t.length < 2) return false;
  // الشرطة العادية "-" تُعدّ ناقصًا فقط بين رقمين (5 - 3)؛ وإلا فهي شرطة كلمات
  if (!MATH_OPERATORS.test(t) && !/[\d)]\s*-\s*[\d(]/.test(t)) return false;
  // كلمات إنجليزية عادية مثل "e-mail" أو "well-known": شرطة واحدة بين حروف فقط → ليست معادلة
  if (/^[A-Za-z]+-[A-Za-z]+$/.test(t)) return false;
  return /[0-9A-Za-zα-ω√²³]/.test(t);
}

/** يقسم النص إلى مقاطع نصية عادية ومقاطع رياضية */
export function splitSegments(text: string): Segment[] {
  const out: Segment[] = [];
  if (!text) return out;
  // 1) المقاطع الصريحة $...$
  const explicit = /\$([^$\n]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushAuto = (chunk: string) => {
    // 2) الكشف التلقائي داخل المقاطع العادية
    let idx = 0;
    let r: RegExpExecArray | null;
    AUTO_RUN.lastIndex = 0;
    while ((r = AUTO_RUN.exec(chunk)) !== null) {
      const raw = r[0];
      // لا نبتلع الفراغات الطرفية حتى تبقى فواصل الكلمات العربية
      const lead = raw.length - raw.trimStart().length;
      const trail = raw.length - raw.trimEnd().length;
      const core = raw.trim();
      if (!looksMath(core)) continue;
      const start = r.index + lead;
      if (start > idx) out.push({ kind: "text", value: chunk.slice(idx, start) });
      out.push({ kind: "math", nodes: parseMath(core), raw: core });
      idx = r.index + raw.length - trail;
    }
    if (idx < chunk.length) out.push({ kind: "text", value: chunk.slice(idx) });
  };
  while ((m = explicit.exec(text)) !== null) {
    if (m.index > last) pushAuto(text.slice(last, m.index));
    out.push({ kind: "math", nodes: parseMath(m[1].trim()), raw: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) pushAuto(text.slice(last));
  // دمج المقاطع النصية المتجاورة
  const merged: Segment[] = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (s.kind === "text" && prev?.kind === "text") prev.value += s.value;
    else merged.push(s);
  }
  return merged;
}

/** يجد فهرس القوس المغلق المطابق ابتداءً من فهرس القوس المفتوح */
function matchParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(" || s[i] === "{") depth++;
    else if (s[i] === ")" || s[i] === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** يقسم محتوى frac عند الفاصلة العليا المستوى */
function splitTopComma(s: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(" || s[i] === "{") depth++;
    else if (s[i] === ")" || s[i] === "}") depth--;
    else if ((s[i] === "," || s[i] === "،") && depth === 0) return [s.slice(0, i), s.slice(i + 1)];
  }
  return null;
}

/** يقرأ "الذرّة" التالية بعد ^ أو _ : {…} أو (…) أو رقم/كلمة واحدة */
function readAtom(s: string, i: number): { body: string; end: number; braced: boolean } {
  if (s[i] === "{" || s[i] === "(") {
    const close = matchParen(s, i);
    if (close > i) return { body: s.slice(i + 1, close), end: close + 1, braced: true };
  }
  const m = /^[0-9]+(\.[0-9]+)?|^[A-Za-zα-ωΑ-Ω]|^[+\-−][0-9]+/.exec(s.slice(i));
  if (m) return { body: m[0], end: i + m[0].length, braced: false };
  return { body: "", end: i, braced: false };
}

/** يحلّل مقطعًا رياضيًا إلى شجرة عقد */
export function parseMath(src: string): MathNode[] {
  const nodes: MathNode[] = [];
  let buf = "";
  // تجميل العرض: "-" بين رقمين → "−" (علامة الطرح الحقيقية)، و "*" → "×"
  const beautify = (v: string) => v.replace(/([\d)\s])-(?=[\s\d(])/g, "$1−").replace(/\*/g, "×");
  const flush = () => { if (buf) { nodes.push({ kind: "text", value: beautify(buf) }); buf = ""; } };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    // جذر: sqrt(...) أو √(...)
    const sq = /^(sqrt|√)\s*\(/.exec(rest);
    if (sq) {
      const open = i + sq[0].length - 1;
      const close = matchParen(src, open);
      if (close > open) {
        flush();
        nodes.push({ kind: "sqrt", children: parseMath(src.slice(open + 1, close)) });
        i = close + 1;
        continue;
      }
    }
    // كسر: frac(a,b)
    const fr = /^frac\s*\(/.exec(rest);
    if (fr) {
      const open = i + fr[0].length - 1;
      const close = matchParen(src, open);
      const parts = close > open ? splitTopComma(src.slice(open + 1, close)) : null;
      if (parts) {
        flush();
        nodes.push({ kind: "frac", num: parseMath(parts[0].trim()), den: parseMath(parts[1].trim()) });
        i = close + 1;
        continue;
      }
    }
    // كسر بالصيغة (a)/(b)
    if (src[i] === "(") {
      const close = matchParen(src, i);
      if (close > i && src[close + 1] === "/" && src[close + 2] === "(") {
        const close2 = matchParen(src, close + 2);
        if (close2 > close + 2) {
          flush();
          nodes.push({ kind: "frac", num: parseMath(src.slice(i + 1, close)), den: parseMath(src.slice(close + 3, close2)) });
          i = close2 + 1;
          continue;
        }
      }
    }
    // أس / رمز سفلي
    if (src[i] === "^" || src[i] === "_") {
      const atom = readAtom(src, i + 1);
      if (atom.body) {
        flush();
        nodes.push({ kind: src[i] === "^" ? "sup" : "sub", children: parseMath(atom.body) });
        i = atom.end;
        continue;
      }
    }
    buf += src[i];
    i++;
  }
  flush();
  return nodes;
}

/** يحوّل الشجرة إلى نص مسطّح (للتصدير/البحث) — يستخدم رموز يونيكود للأس البسيط */
export function toPlainText(nodes: MathNode[]): string {
  const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "n": "ⁿ" };
  return nodes.map((n) => {
    switch (n.kind) {
      case "text": return n.value;
      case "sup": { const t = toPlainText(n.children); return [...t].every((c) => SUP[c]) ? [...t].map((c) => SUP[c]).join("") : `^(${t})`; }
      case "sub": return `_(${toPlainText(n.children)})`;
      case "sqrt": return `√(${toPlainText(n.children)})`;
      case "frac": return `(${toPlainText(n.num)})/(${toPlainText(n.den)})`;
    }
  }).join("");
}

/** هل يحتوي النص على مقطع رياضي؟ (لتقرير ما إذا كان العرض يحتاج المكوّن الخاص) */
export function hasMath(text: string): boolean {
  return splitSegments(text).some((s) => s.kind === "math");
}
