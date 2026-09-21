import { describe, it, expect } from "vitest";
import { parseQuestionsSmart, parseRows } from "@/lib/questionImport";

describe("الاستيراد الذكي للأسئلة (ملاحظة 8)", () => {
  it("يستنتج اختيار من واحد مع الإجابة من سطر «الإجابة»", () => {
    const { questions, format } = parseQuestionsSmart(`
1) ما عاصمة المملكة العربية السعودية؟ (2 درجات)
أ) جدة
ب) الرياض
ج) الدمام
د) مكة
الإجابة: ب
`);
    expect(format).toBe("text");
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ type: "single", correctAnswer: "B", points: 2 });
    expect(questions[0].options?.map((o) => o.textAr)).toEqual(["جدة", "الرياض", "الدمام", "مكة"]);
    expect(questions[0].textAr).toBe("ما عاصمة المملكة العربية السعودية؟");
  });
  it("علامة * بجانب الخيار = الإجابة الصحيحة، وأكثر من علامة = متعدد", () => {
    const { questions } = parseQuestionsSmart(`
2. اختر مبادئ الحوكمة:
A. الشفافية *
B. المحسوبية
C. المساءلة *
`);
    expect(questions[0]).toMatchObject({ type: "multiple", correctAnswer: ["A", "C"] });
  });
  it("صح/خطأ من خيارين أو من صيغة السؤال", () => {
    const { questions } = parseQuestionsSmart(`
3- الأرض كروية. (صح أم خطأ)
الإجابة: صح

4- الشمس تدور حول الأرض.
أ) صح
ب) خطأ *
`);
    expect(questions[0]).toMatchObject({ type: "truefalse", correctAnswer: "T" });
    expect(questions[1]).toMatchObject({ type: "truefalse", correctAnswer: "F" });
  });
  it("مقالي ورقمي وقصير بلا خيارات", () => {
    const { questions } = parseQuestionsSmart(`
5) اشرح أثر التحول الرقمي على الخدمات الحكومية. [مقالي] (5 درجات)
الإجابة النموذجية: تحسين الكفاءة وتقليل التكلفة ورفع رضا المستفيد.

6) كم عدد محاور رؤية 2030؟
الإجابة: 3

7) ما اسم المنهجية التي تركز على المستفيد؟
الإجابة: التفكير التصميمي
`);
    expect(questions[0]).toMatchObject({ type: "essay", points: 5 });
    expect(questions[0].modelAnswer).toContain("تحسين الكفاءة");
    expect(questions[1]).toMatchObject({ type: "numeric", correctAnswer: 3 });
    expect(questions[2]).toMatchObject({ type: "short", correctAnswer: "التفكير التصميمي" });
  });
  it("جدول Excel: سؤال، خيارات، إجابة، درجة", () => {
    const qs = parseRows([
      ["السؤال", "أ", "ب", "ج", "د", "الإجابة", "الدرجة"],
      ["2 + 2 = ؟", "3", "4", "5", "6", "ب", "1"],
      ["ما عاصمة مصر؟", "القاهرة", "", "", "", "", "2"],
    ]);
    expect(qs[0]).toMatchObject({ type: "single", correctAnswer: "B", points: 1 });
    expect(qs[1].type).toBe("short");
  });
  it("JSON مرن", () => {
    const { questions, format } = parseQuestionsSmart(JSON.stringify([{ question: "ما ناتج 1+1؟", choices: ["أ1", "أ2", "أ3"], answer: "C", points: 2 }]));
    expect(format).toBe("json");
    expect(questions[0]).toMatchObject({ type: "single", correctAnswer: "C", points: 2 });
  });
  it("يحذّر عند غياب الإجابة الصحيحة بدل رفض السؤال", () => {
    const { questions } = parseQuestionsSmart(`1) سؤال بلا إجابة\nأ) خيار\nب) خيار آخر`);
    expect(questions[0].type).toBe("single");
    expect(questions[0].warnings.length).toBeGreaterThan(0);
  });
});
