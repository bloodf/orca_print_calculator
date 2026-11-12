// A dialog hands focus back to the control that opened it; if that control is gone (a list row that re-rendered, a removed
// section), to the fallback (the current view's title) instead of dropping it on <body>.
export function useDialogFocus(fallback: () => HTMLElement | null = () => document.querySelector<HTMLElement>("[data-view-title]") ?? document.querySelector<HTMLElement>("main")): { capture(): void; restore(): void } {
  let opener: HTMLElement | null = null;
  return {
    capture(): void { opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null; },
    restore(): void {
      const target = opener?.isConnected ? opener : fallback();
      opener = null;
      target?.focus?.();
    },
  };
}
