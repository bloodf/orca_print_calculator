// foundation-gap (4.2.0): OuiToastHost hands focus back only when the closed toast has already left the DOM, but its
// TransitionGroup keeps the card in place while it fades out, so focus fell to <body> after Undo or Close. Until the
// foundation fixes it, focus goes back to where it was before the toast as soon as the toast is closed.
import { nextTick, onBeforeUnmount, onMounted, watch } from "vue";
import { useToast } from "../../shared/src/components";

export function useToastFocusReturn(): void {
  const { list } = useToast();
  let outside: HTMLElement | null = null;
  const remember = (e: FocusEvent): void => { if (e.target instanceof HTMLElement && !e.target.closest(".oui-toasts")) outside = e.target; };
  onMounted(() => document.addEventListener("focusin", remember));
  onBeforeUnmount(() => document.removeEventListener("focusin", remember));
  watch(() => list.list.map((x) => x.id), (ids) => {
    const card = document.activeElement?.closest<HTMLElement>("[data-toast-id]");
    if (!card || ids.includes(Number(card.dataset.toastId))) return;
    void nextTick(() => (outside?.isConnected ? outside : document.querySelector<HTMLElement>("main"))?.focus());
  }, { flush: "pre" });
}
