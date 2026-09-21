import { useState } from "react";
import { Link } from "react-router";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RiskBadge, SeverityBadge } from "@/components/shared";
import { Eye, OctagonX, Clock, RefreshCw, Camera, Flag, LockOpen, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/providers/confirm";

export default function Monitoring() {
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const exams = trpc.exam.list.useQuery();
  const [examId, setExamId] = useState<number | undefined>();
  const overview = trpc.monitor.examOverview.useQuery({ examId: examId! }, { enabled: !!examId, refetchInterval: 5000 });
  const sessions = trpc.monitor.liveSessions.useQuery({ examId: examId! }, { enabled: !!examId, refetchInterval: 5000 });
  const utils = trpc.useUtils();

  const [eventsSession, setEventsSession] = useState<number | null>(null);
  const events = trpc.monitor.sessionEvents.useQuery({ sessionId: eventsSession! }, { enabled: !!eventsSession, refetchInterval: 5000 });
  const [snapsSession, setSnapsSession] = useState<number | null>(null);
  const snaps = trpc.monitor.sessionSnapshots.useQuery({ sessionId: snapsSession!, limit: 120 }, { enabled: !!snapsSession, refetchInterval: 8000 });
  const flagSnap = trpc.monitor.flagSnapshot.useMutation({ onSuccess: () => utils.monitor.sessionSnapshots.invalidate() });
  const terminate = trpc.monitor.terminateSession.useMutation({
    onSuccess: () => { utils.monitor.liveSessions.invalidate(); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const extend = trpc.monitor.extendSession.useMutation({
    onSuccess: () => { utils.monitor.liveSessions.invalidate(); toast.success(t("toastUpdated")); },
    onError: (e) => toast.error(e.message),
  });
  const reviewEvent = trpc.monitor.reviewEvent.useMutation({ onSuccess: () => utils.monitor.sessionEvents.invalidate() });
  // إعادة فتح جلسة مقفَلة (ملاحظة 6)
  const reopen = trpc.monitor.reopenSession.useMutation({
    onSuccess: (r) => { utils.monitor.liveSessions.invalidate(); utils.monitor.examOverview.invalidate(); toast.success(`${t("reopenDone")} — ${t("remaining")}: ${Math.floor(r.remainingSec / 60)} ${t("minutes")}`); },
    onError: (e) => toast.error(e.message),
  });
  const [reopenMin, setReopenMin] = useState<Record<number, number>>({});

  const [reason, setReason] = useState("");
  const [extMin, setExtMin] = useState(10);
  const [lightbox, setLightbox] = useState<{ image: string; time: string } | null>(null);

  const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand"><Eye className="h-5 w-5" /> {t("monitoring")}</h2>
        <select className="rounded-md border bg-white px-3 py-2" value={examId ?? ""} onChange={(e) => setExamId(e.target.value ? +e.target.value : undefined)}>
          <option value="">{t("exams")}...</option>
          {exams.data?.map((x) => <option key={x.id} value={x.id}>{lang === "ar" ? x.titleAr : x.titleEn || x.titleAr}</option>)}
        </select>
      </div>

      {overview.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {[
            [t("registered"), overview.data.registered],
            [t("started"), overview.data.started],
            [t("activeNow"), overview.data.active],
            [t("submitted"), overview.data.submitted],
            [t("terminated"), overview.data.terminated],
            [t("notStarted"), overview.data.notStarted],
            [t("events"), overview.data.totalEvents],
          ].map(([label, val], i) => (
            <Card key={i}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-extrabold text-brand">{val}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sessions.data && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("liveSessions")}</CardTitle>
            <RefreshCw className="h-4 w-4 animate-pulse text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {sessions.data.length === 0 && <p className="py-6 text-center text-muted-foreground">—</p>}
            {sessions.data.map((s) => (
              <div key={s.sessionId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium">
                    {s.candidateName}
                    <span className="ms-2 text-xs text-muted-foreground" dir="ltr">{s.candidateMaskedId}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={s.status === "active" ? "default" : s.status === "terminated" ? "destructive" : "secondary"} className={s.status === "active" ? "bg-emerald-600" : ""}>
                      {t(`sstatus_${s.status}` as "sstatus_active")}
                    </Badge>
                    {s.reopenCount > 0 && <Badge variant="outline">{t("reopenedTimes")}: {s.reopenCount}</Badge>}
                    {s.status === "active" && <span className="font-mono text-brand">{fmtTime(s.remainingSec)}</span>}
                    <span className="flex items-center gap-1">{t("riskScore")}: <RiskBadge score={s.riskScore} /></span>
                    <span>{t("events")}: {s.eventsCount}{s.highEvents > 0 ? ` (${s.highEvents} ⚠)` : ""}</span>
                    {s.snapshotsCount > 0 && <span className="flex items-center gap-1 text-emerald-700"><Camera className="h-3 w-3" /> {s.snapshotsCount}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEventsSession(s.sessionId)}>
                    <Eye className="me-1 h-3.5 w-3.5" /> {t("events")}
                  </Button>
                  {s.status !== "active" && (
                    <Link to={`/dashboard/grading/${s.sessionId}`}>
                      <Button size="sm" variant="outline" className="border-brand text-brand"><ListChecks className="me-1 h-3.5 w-3.5" /> {t("fullGradingReview")}</Button>
                    </Link>
                  )}
                  {/* (ب) إعادة فتح الاختبار للطالب المقفَل مع الإبقاء على إجاباته (ملاحظة 6) */}
                  {s.status === "terminated" && (
                    <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 p-1" title={s.terminationReason ?? ""}>
                      <Input type="number" className="h-8 w-16" min={0} max={300} value={reopenMin[s.sessionId] ?? 0}
                        onChange={(e) => setReopenMin({ ...reopenMin, [s.sessionId]: +e.target.value })} title={t("reopenExtraMinutes")} />
                      <Button size="sm" className="bg-amber-600 text-white hover:bg-amber-700" disabled={reopen.isPending}
                        onClick={async () => { if (await confirm({ title: t("reopenExam"), description: `${t("reopenConfirmDesc")} (${s.candidateName})`, confirmText: t("reopenExam") })) reopen.mutate({ sessionId: s.sessionId, extraMinutes: reopenMin[s.sessionId] ?? 0 }); }}>
                        <LockOpen className="me-1 h-3.5 w-3.5" /> {t("reopenExam")}
                      </Button>
                    </div>
                  )}
                  {s.snapshotsCount > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setSnapsSession(s.sessionId)}>
                      <Camera className="me-1 h-3.5 w-3.5" /> {t("snapshots")}
                    </Button>
                  )}
                  {s.status === "active" && (
                    <>
                      {/* (أ) تمديد الوقت بدقائق */}
                      <div className="flex items-center gap-1">
                        <Input type="number" className="h-8 w-16" value={extMin} onChange={(e) => setExtMin(+e.target.value)} min={1} />
                        <Button size="sm" variant="outline" onClick={() => extend.mutate({ sessionId: s.sessionId, minutes: extMin })}>
                          <Clock className="me-1 h-3.5 w-3.5" /> {t("extendTime")}
                        </Button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input className="h-8 w-36" placeholder={t("terminateReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
                        <Button size="sm" variant="destructive" disabled={reason.length < 3}
                          onClick={async () => { if (await confirm({ title: t("terminate"), description: `${t("confirmActionDesc")} (${s.candidateName})`, danger: true, confirmText: t("terminate") })) terminate.mutate({ sessionId: s.sessionId, reason }); }}>
                          <OctagonX className="me-1 h-3.5 w-3.5" /> {t("terminate")}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!eventsSession} onOpenChange={() => setEventsSession(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{t("events")}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {events.data?.map((e) => (
              <div key={e.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={e.severity} />
                    <span className="font-mono text-sm">{e.eventType}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</span>
                </div>
                {e.details && <p className="mt-1 text-sm text-muted-foreground">{e.details}</p>}
                <div className="mt-2 flex items-center gap-2">
                  {e.reviewDecision ? (
                    <Badge variant="outline">✓ {e.reviewDecision}</Badge>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => reviewEvent.mutate({ eventId: e.id, decision: "clean" })}>{t("decision_clean")}</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-amber-600" onClick={() => reviewEvent.mutate({ eventId: e.id, decision: "suspicious" })}>{t("decision_suspicious")}</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => reviewEvent.mutate({ eventId: e.id, decision: "violation" })}>{t("decision_violation")}</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {events.data?.length === 0 && <p className="py-6 text-center text-muted-foreground">—</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* معرض لقطات الكاميرا (المتطلب 5) */}
      <Dialog open={!!snapsSession} onOpenChange={() => setSnapsSession(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> {t("cameraSnapshots")}</DialogTitle></DialogHeader>
          {snaps.data?.length === 0 && <p className="py-6 text-center text-muted-foreground">{t("noSnapshots")}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {snaps.data?.map((sn) => (
              <div key={sn.id} className={`overflow-hidden rounded-lg border ${sn.flagged ? "border-red-400 ring-2 ring-red-200" : ""}`}>
                <button type="button" className="block w-full"
                  onClick={() => setLightbox({ image: sn.image, time: new Date(sn.capturedAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US") })}>
                  <img src={sn.image} alt="" className="aspect-[4/3] w-full bg-black object-cover" loading="lazy" />
                </button>
                <div className="flex items-center justify-between gap-1 p-1.5">
                  <span className="text-[10px] text-muted-foreground">{new Date(sn.capturedAt).toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-US")}</span>
                  <Button size="sm" variant="ghost" className={`h-6 px-1.5 text-xs ${sn.flagged ? "text-red-600" : "text-muted-foreground"}`}
                    onClick={() => flagSnap.mutate({ snapshotId: sn.id, flagged: !sn.flagged })}>
                    <Flag className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* عرض اللقطة مُكبّرة داخل النظام */}
      <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> {t("cameraSnapshots")} <span className="text-sm font-normal text-muted-foreground" dir="ltr">{lightbox?.time}</span></DialogTitle></DialogHeader>
          {lightbox && <img src={lightbox.image} alt="" className="max-h-[75vh] w-full rounded-lg bg-black object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
