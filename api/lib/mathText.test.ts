import { describe, it, expect } from "vitest";
import { splitSegments, parseMath, toPlainText } from "@/lib/mathText";

describe("mathText (ملاحظة 1)", () => {
  it("يعزل المعادلة داخل الجملة العربية ويحافظ على الفواصل", () => {
    const seg = splitSegments("ما ناتج 10 − 3 = ؟ في الحساب");
    expect(seg.map((s) => s.kind)).toEqual(["text", "math", "text"]);
    expect((seg[1] as { raw: string }).raw).toBe("10 − 3 =");
    expect((seg[0] as { value: string }).value).toBe("ما ناتج ");
    expect((seg[2] as { value: string }).value).toBe(" ؟ في الحساب");
  });
  it("لا يعدّ الكلمات الإنجليزية العادية معادلات", () => {
    expect(splitSegments("What is the capital of France?").every((s) => s.kind === "text")).toBe(true);
    expect(splitSegments("راسلنا على e-mail").every((s) => s.kind === "text")).toBe(true);
    expect(splitSegments("عام 2030").every((s) => s.kind === "text")).toBe(true);
  });
  it("الشرطة بين رقمين تُعدّ طرحًا وتُحوَّل إلى −", () => {
    const seg = splitSegments("احسب 5 - 3");
    expect(seg[1].kind).toBe("math");
    expect(seg[1].kind === "math" ? toPlainText(seg[1].nodes) : "").toBe("5 − 3");
  });
  it("يحلّل الأس والجذر والكسر", () => {
    expect(parseMath("x^2")).toEqual([{ kind: "text", value: "x" }, { kind: "sup", children: [{ kind: "text", value: "2" }] }]);
    expect(parseMath("x^{n+1}")[1]).toEqual({ kind: "sup", children: [{ kind: "text", value: "n+1" }] });
    expect(parseMath("sqrt(16)")).toEqual([{ kind: "sqrt", children: [{ kind: "text", value: "16" }] }]);
    expect(parseMath("√(a+b)")[0].kind).toBe("sqrt");
    expect(parseMath("frac(1,2)")).toEqual([{ kind: "frac", num: [{ kind: "text", value: "1" }], den: [{ kind: "text", value: "2" }] }]);
    expect(parseMath("(a+b)/(c)")[0].kind).toBe("frac");
  });
  it("المقطع الصريح $...$ يُعزل دائمًا", () => {
    const seg = splitSegments("القيمة $x$ هنا");
    expect(seg[1]).toMatchObject({ kind: "math", raw: "x" });
  });
  it("toPlainText يعيد نصًا مقروءًا", () => {
    expect(toPlainText(parseMath("x^2 + sqrt(9)"))).toBe("x² + √(9)");
  });
});
