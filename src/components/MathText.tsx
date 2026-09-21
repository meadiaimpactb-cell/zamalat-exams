import { useMemo, type ReactNode } from "react";
import { splitSegments, type MathNode } from "@/lib/mathText";
import { cn } from "@/lib/utils";

/**
 * عرض موحّد لنصوص الأسئلة/الخيارات/الإجابات مع المعادلات البسيطة (ملاحظة 1).
 * يُستخدم في: إنشاء السؤال (معاينة حية)، معاينة الطالب، شاشة الاختبار، شاشة التصحيح، والتقارير —
 * فتظهر المعادلة نفسها في كل مكان.
 */
export function MathText({ text, className, as: Tag = "span" }: { text: string | null | undefined; className?: string; as?: "span" | "p" | "div" }) {
  const segments = useMemo(() => splitSegments(text ?? ""), [text]);
  if (!text) return null;
  return (
    <Tag className={cn("whitespace-pre-wrap", className)}>
      {segments.map((s, i) =>
        s.kind === "text"
          ? <span key={i}>{s.value}</span>
          : <bdi key={i} dir="ltr" className="math-run" title={s.raw}>{renderNodes(s.nodes)}</bdi>,
      )}
    </Tag>
  );
}

function renderNodes(nodes: MathNode[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.kind) {
      case "text": return <span key={i}>{n.value}</span>;
      case "sup": return <sup key={i} className="math-sup">{renderNodes(n.children)}</sup>;
      case "sub": return <sub key={i} className="math-sub">{renderNodes(n.children)}</sub>;
      case "sqrt": return (
        <span key={i} className="math-sqrt">
          <span className="math-sqrt-sign">√</span>
          <span className="math-sqrt-body">{renderNodes(n.children)}</span>
        </span>
      );
      case "frac": return (
        <span key={i} className="math-frac">
          <span className="math-frac-num">{renderNodes(n.num)}</span>
          <span className="math-frac-den">{renderNodes(n.den)}</span>
        </span>
      );
    }
  });
}
