/** The DOM element behind a template ref that points at a PrimeVue component (components expose it as `$el`). */
export const elOf = (c: unknown): HTMLElement | null => (c as { $el?: HTMLElement } | null)?.$el ?? null;
