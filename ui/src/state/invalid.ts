// Number fields that currently show an error. The price keeps the last valid value, so the price panel says so (docs/ux.md §6.12).
import { reactive } from "vue";

export const invalidFields = reactive<Record<string, true>>({});
export function markInvalid(id: string, bad: boolean): void {
  if (bad) invalidFields[id] = true;
  else delete invalidFields[id];
}
