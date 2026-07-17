import { useState } from "react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TYPE_KEYS = ["single", "multiple", "truefalse", "short", "essay", "numeric"] as const;

export default function AiStudio() {
  const { t, lang } = useI18n();
  const banks = trpc.bank.listBanks.useQuery();
  const utils = trpc.useUtils();
  const [bankId, setBankId] = useState<number | undefined>();
  const [topic, setTopic] = useState("");
  const [competency, setCompetency] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [types, setTypes] = useState<string[]>(["single", "truefalse"]);

  const gen = trpc.bank.aiGenerate.useMutation({
    onSuccess: (r) => {
      utils.bank.listQuestions.invalidate();
      toast.success(`${r.generated} ✓`);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleType = (k: string) => {
    setTypes((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card className="border-t-4 border-t-[hsl(22,60%,55%)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand">
            <BrainCircuit className="h-6 w-6" /> {t("aiGenerateTitle")}
          </CardTitle>
          <CardDescription>{t("aiNote")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t("bank")} *</Label>
            <select className="rounded-md border px-3 py-2" value={bankId ?? ""} onChange={(e) => setBankId(e.target.value ? +e.target.value : undefined)}>
              <option value="">—</option>
              {banks.data?.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.nameAr : b.nameEn}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("topic")} *</Label>
            <Input placeholder={lang === "ar" ? "مثال: الحوكمة والإدارة" : "e.g. Governance"} value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("competency")}</Label>
            <Input value={competency} onChange={(e) => setCompetency(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("questionType")}</Label>
            <div className="flex flex-wrap gap-2">
              {TYPE_KEYS.map((k) => (
                <Badge
                  key={k}
                  onClick={() => toggleType(k)}
                  className={`cursor-pointer px-3 py-1.5 ${types.includes(k) ? "bg-brand text-white" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
                >
                  {t(`type_${k}` as "type_single")}
                </Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>{t("count")}</Label>
              <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(+e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("difficulty")}</Label>
              <select className="rounded-md border px-3 py-2" value={difficulty} onChange={(e) => setDifficulty(e.target.value as "easy")}>
                <option value="easy">{t("diff_easy")}</option>
                <option value="medium">{t("diff_medium")}</option>
                <option value="hard">{t("diff_hard")}</option>
              </select>
            </div>
          </div>
          <Button
            className="bg-accent-brand text-white hover:opacity-90"
            disabled={!bankId || !topic || types.length === 0 || gen.isPending}
            onClick={() => gen.mutate({ bankId: bankId!, topic, competency: competency || undefined, count, types: types as never, difficulty })}
          >
            {gen.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Sparkles className="me-2 h-4 w-4" />}
            {t("generate")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
