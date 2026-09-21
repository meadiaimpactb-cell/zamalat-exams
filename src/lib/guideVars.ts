import { DEFAULT_VARS, type GuideVars } from "@/content/studentGuide";

/** يقرأ إعدادات الاختبار من جلسة الدخول (إن وُجدت) ليُظهر الأرقام الفعلية للطالب */
export function useGuideVars(): GuideVars {
  try {
    const raw = sessionStorage.getItem("exam_access");
    if (!raw) return DEFAULT_VARS;
    const a = JSON.parse(raw) as { info?: { exam?: { durationMin?: number; maxFullscreenExits?: number; snapshotIntervalSec?: number }; extraTimeMin?: number } };
    const e = a.info?.exam ?? {};
    const extra = a.info?.extraTimeMin ?? 0;
    return {
      duration: (e.durationMin ?? DEFAULT_VARS.duration) as number + extra,
      exits: e.maxFullscreenExits === 0 ? "∞" : (e.maxFullscreenExits ?? DEFAULT_VARS.exits),
      snapshot: e.snapshotIntervalSec ?? DEFAULT_VARS.snapshot,
      extra,
    };
  } catch { return DEFAULT_VARS; }
}

