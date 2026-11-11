// Toast queue (docs/ux.md §5.2). Stack <= 3, newest last; errors stay until closed.
import { reactive } from "vue";

export type ToastTone = "info" | "ok" | "bad";
export type ToastAction = { label: string; run: () => void };
export type Toast = { id: number; text: string; tone: ToastTone; action?: ToastAction };
export type ToastInput = { text: string; tone?: ToastTone; action?: ToastAction; ms?: number };

export const toasts = reactive<{ list: Toast[] }>({ list: [] });
const MAX = 3;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

export function dismiss(id: number): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts.list = toasts.list.filter((x) => x.id !== id);
}

export function toast(input: ToastInput): number {
  const id = nextId++;
  const tone = input.tone ?? "info";
  toasts.list = [...toasts.list, { id, text: input.text, tone, action: input.action }].slice(-MAX);
  const ms = input.ms ?? (tone === "bad" ? 0 : input.action ? 8000 : 5000);
  if (ms > 0) timers.set(id, setTimeout(() => dismiss(id), ms));
  return id;
}

export const clearToasts = (): void => { [...timers.keys()].forEach(dismiss); toasts.list = []; };
