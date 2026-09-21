import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { AlertTriangle } from "lucide-react";

type ConfirmOpts = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ConfirmFn = (opts?: ConfirmOpts) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => true);

/** نافذة تأكيد موحّدة قبل الحذف/الإجراءات المهمة — تُستدعى: const ok = await confirm({...}) */
export function useConfirm() {
  return useContext(ConfirmCtx);
}

/** اختصار لتأكيد الحذف: askDelete(() => del.mutate(...)) */
export function useDeleteConfirm() {
  const confirm = useConfirm();
  const { t } = useI18n();
  return useCallback(
    async (onConfirm: () => void, opts?: { title?: string; description?: string }) => {
      const ok = await confirm({
        title: opts?.title ?? t("confirmDeleteTitle"),
        description: opts?.description ?? t("confirmDeleteDesc"),
        confirmText: t("yesDelete"),
        danger: true,
      });
      if (ok) onConfirm();
    },
    [confirm, t],
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOpts>({});
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o ?? {});
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (value: boolean) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(v) => { if (!v) settle(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {opts.danger && <AlertTriangle className="h-5 w-5 text-destructive" />}
              {opts.title ?? t("confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>{opts.description ?? t("confirmActionDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>{opts.cancelText ?? t("cancel")}</Button>
            <Button
              className={opts.danger ? "bg-destructive text-white hover:bg-destructive/90" : "bg-brand text-white"}
              onClick={() => settle(true)}
            >
              {opts.confirmText ?? t("confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmCtx.Provider>
  );
}
