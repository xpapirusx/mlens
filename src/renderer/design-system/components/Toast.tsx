import { create } from "zustand";
import { CircleCheck, CircleExclamationPoint, Info, X } from "lucide-react";
import { cn } from "../lib/cn";

export type ToastTone = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = ++counter;
    set((state) => ({ toasts: [...state.toasts.slice(-4), { ...toast, id }] }));
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) }));
    }, toast.tone === "error" ? 9000 : 4500);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) })),
}));

export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().push({ tone: "success", title, message }),
  error: (title: string, message?: string) => useToastStore.getState().push({ tone: "error", title, message }),
  info: (title: string, message?: string) => useToastStore.getState().push({ tone: "info", title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().push({ tone: "warning", title, message }),
};

const ICONS = {
  success: CircleCheck,
  error: CircleExclamationPoint,
  info: Info,
  warning: CircleExclamationPoint,
};

const TONE_CLASSES: Record<ToastTone, string> = {
  success: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  error: "border-red-500/40 text-red-600 dark:text-red-400",
  info: "border-skyhook-500/40 text-accent-text",
  warning: "border-amber-500/40 text-amber-600 dark:text-amber-400",
};

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-8 right-4 z-[110] flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((entry) => {
        const Icon = ICONS[entry.tone];
        return (
          <div
            key={entry.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-theme-surface px-3 py-2.5 shadow-theme-lg",
              TONE_CLASSES[entry.tone],
            )}
            role="status"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-theme-text-primary">{entry.title}</div>
              {entry.message ? (
                <div className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-theme-text-secondary">
                  {entry.message}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
              onClick={() => dismiss(entry.id)}
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
