import { useState } from "react";
import { useI18n } from "@/i18n";
import { MathText } from "@/components/MathText";
import { cn } from "@/lib/utils";
import { Sigma, Eye } from "lucide-react";

/**
 * شريط رموز المعادلات (ملاحظة 1): يُدرج الرمز في الحقل الذي فيه المؤشر حاليًا
 * (نص السؤال، أي خيار، الإجابة الصحيحة، الإجابة النموذجية) دون الحاجة لمراجع لكل حقل.
 * يعمل مع الحقول المتحكَّم بها في React عبر مُعيّن القيمة الأصلي + حدث input.
 */
const SYMBOLS: { label: string; insert: string; cursor?: number; title?: string }[] = [
  { label: "+", insert: "+" }, { label: "−", insert: "−" }, { label: "×", insert: "×" }, { label: "÷", insert: "÷" },
  { label: "±", insert: "±" }, { label: "=", insert: "=" }, { label: "≠", insert: "≠" }, { label: "≤", insert: "≤" }, { label: "≥", insert: "≥" },
  { label: "x²", insert: "^{2}", title: "أس: x^{2}" }, { label: "xⁿ", insert: "^{}", cursor: 2, title: "أس: x^{n}" },
  { label: "x₁", insert: "_{}", cursor: 2, title: "رمز سفلي: x_{1}" },
  { label: "√", insert: "sqrt()", cursor: 5, title: "جذر: sqrt(x)" }, { label: "a⁄b", insert: "frac(,)", cursor: 5, title: "كسر: frac(a,b)" },
  { label: "½", insert: "½" }, { label: "¼", insert: "¼" }, { label: "¾", insert: "¾" },
  { label: "π", insert: "π" }, { label: "°", insert: "°" }, { label: "%", insert: "%" }, { label: "∞", insert: "∞" },
  { label: "( )", insert: "()", cursor: 1 },
];

function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement, text: string, cursorOffset?: number) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, next); else el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const pos = start + (cursorOffset ?? text.length);
  requestAnimationFrame(() => { el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* number inputs */ } });
}

export function MathToolbar({ className, previewText }: { className?: string; previewText?: string }) {
  const { t } = useI18n();
  const [hint, setHint] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const onInsert = (s: (typeof SYMBOLS)[number]) => {
    const el = document.activeElement;
    const ok = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && ["text", "search", ""].includes(el.type));
    if (!ok) { setHint(true); setTimeout(() => setHint(false), 2500); return; }
    insertAtCursor(el, s.insert, s.cursor);
  };
  return (
    <div className={cn("rounded-lg border bg-secondary/40 p-2", className)}>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Sigma className="h-3.5 w-3.5" /> {t("mathToolbar")}</span>
        {previewText !== undefined && (
          <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => setShowPreview((v) => !v)}>
            <Eye className="h-3.5 w-3.5" /> {t("livePreview")}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1" dir="ltr">
        {SYMBOLS.map((s) => (
          <button
            key={s.label}
            type="button"
            title={s.title ?? s.label}
            onMouseDown={(e) => e.preventDefault()} // يبقي المؤشر في الحقل الحالي
            onClick={() => onInsert(s)}
            className="math-run min-w-8 rounded-md border bg-white px-2 py-1 text-sm hover:border-brand hover:bg-brand/5"
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className={cn("mt-1 text-[11px]", hint ? "text-amber-700" : "text-muted-foreground")}>{hint ? t("mathFocusHint") : t("mathSyntaxHint")}</p>
      {previewText !== undefined && showPreview && previewText.trim() && (
        <div className="mt-2 rounded-md border bg-white p-2 text-sm">
          <span className="me-2 text-[11px] text-muted-foreground">{t("livePreview")}:</span>
          <MathText text={previewText} />
        </div>
      )}
    </div>
  );
}
