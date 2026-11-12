<script setup lang="ts">
import InputGroup from "primevue/inputgroup";
import InputGroupAddon from "primevue/inputgroupaddon";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { intlLocale, t } from "../../i18n";
import { markInvalid } from "../../state/invalid";
import ResetButton from "./ResetButton.vue";
import { checkText, clamp, formatNum, keyDelta, parseNum, type FieldError, type NumSpec } from "./numeric";

const props = withDefaults(
  defineProps<{
    modelValue: number | null; label: string; scale: number; step: number;
    unit?: string; prefix?: string; min?: number; max?: number; nullable?: boolean; required?: boolean;
    defaultValue?: number | null; error?: string; helper?: string; id?: string; width?: "sm" | "md"; readonly?: boolean;
    /** Money mode (set by MoneyField): parse with parseMoney at `digits`, reject extra decimals. */
    money?: { digits: number; currency?: string };
  }>(),
  { unit: undefined, prefix: undefined, min: 0, max: undefined, defaultValue: undefined, error: undefined, helper: undefined, id: undefined, width: undefined, readonly: false, money: undefined },
);
const emit = defineEmits<{ "update:modelValue": [value: number | null]; reset: [] }>();

const fid = props.id ?? `nf-${useId()}`;
const spec = computed<NumSpec>(() => ({ scale: props.scale, money: props.money }));
const bounds = computed(() => ({ min: props.min, max: props.max, required: props.required, nullable: props.nullable }));
const fmt = (v: number | null): string => (v === null ? "" : formatNum(v, spec.value, intlLocale()));

const text = ref(fmt(props.modelValue));
const focused = ref(false);
const localError = ref<FieldError | null>(null);
const showError = ref(false);
let idle: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(idle));

watch(() => props.modelValue, (v) => {
  const cur = checkText(text.value, spec.value, bounds.value, intlLocale()).value;
  if (!focused.value || cur !== v) { text.value = fmt(v); localError.value = null; }
});

// The currency (digits) changed under a mounted field: show the same stored value in the new format.
// Watch the primitives: MoneyField passes a fresh `money` object on every render, and watching that rewrote the text on each keystroke.
watch([() => props.scale, () => props.money?.digits], () => { text.value = fmt(props.modelValue); localError.value = null; });

// The language changed under a mounted field. Text that was the confirmed value in the old language is shown again in the new
// one (same number, new punctuation). An edit that was invalid or empty stays exactly as typed: it is never re-read with the new rules.
watch(() => intlLocale(), (_now, before) => {
  const was = checkText(text.value, spec.value, bounds.value, before);
  if (was.error || was.value !== props.modelValue) return;
  text.value = fmt(props.modelValue);
  localError.value = null;
});

const overridden = computed(() => props.defaultValue !== undefined && props.modelValue !== props.defaultValue);
const defaultText = computed(() => (props.defaultValue == null ? t("a11y.unknown") : `${props.prefix ?? ""}${fmt(props.defaultValue)}${props.unit ? ` ${props.unit}` : ""}`.trim()));
const shownError = computed(() => props.error ?? (showError.value && localError.value ? t(localError.value.key, localError.value.params) : ""));
const helperText = computed(() => props.helper ?? (props.nullable && props.modelValue === null ? t("field.notSet") : ""));
watch(() => !!shownError.value, (bad) => markInvalid(fid, bad), { immediate: true });
onBeforeUnmount(() => markInvalid(fid, false));
const describedBy = computed(() => (shownError.value || helperText.value ? `${fid}-d` : undefined));

function commitText(): void {
  const r = checkText(text.value, spec.value, bounds.value, intlLocale());
  localError.value = r.error ?? null;
  if (r.value !== undefined && r.value !== props.modelValue) emit("update:modelValue", r.value);
}
function onInput(e: Event): void {
  if (props.readonly) return;
  text.value = (e.target as HTMLInputElement).value;
  commitText();
  showError.value = false;
  clearTimeout(idle);
  idle = setTimeout(() => (showError.value = true), 800);
}
function onBlur(): void {
  focused.value = false;
  clearTimeout(idle);
  showError.value = true; // typed text stays as typed: only its punctuation is checked, never rewritten
}
function setModel(v: number): void {
  text.value = fmt(v);
  localError.value = null;
  if (v !== props.modelValue) emit("update:modelValue", v);
}
function onKey(e: KeyboardEvent): void {
  if (props.readonly) return;
  if (e.key === "Enter") { commitText(); showError.value = true; return; }
  if (e.key === "Escape") { text.value = fmt(props.modelValue); localError.value = null; (e.target as HTMLElement).blur(); return; }
  const d = keyDelta(e, props.step, true);
  if (d === null) return;
  e.preventDefault();
  const cur = parseNum(text.value, spec.value, intlLocale()) ?? props.modelValue ?? 0;
  setModel(clamp(cur + d, props.min, props.max));
}
</script>

<template>
  <div class="nf" :class="width">
    <div class="nf-head row">
      <span v-if="overridden" class="ovr-dot" aria-hidden="true" />
      <span v-if="overridden" class="sr-only">{{ t("a11y.edited") }}</span>
      <label :for="fid" class="sm muted">{{ label }}</label>
      <ResetButton v-if="overridden" :label="label" :default-text="defaultText" @click="emit('reset')" />
    </div>
    <InputGroup class="nf-box">
      <InputGroupAddon v-if="prefix" class="num">{{ prefix }}</InputGroupAddon>
      <InputText
        :id="fid" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" class="num nf-input"
        :model-value="text" :readonly="readonly" :invalid="!!shownError" :aria-invalid="shownError ? 'true' : undefined" :aria-describedby="describedBy"
        @input="onInput" @keydown="onKey" @focus="(e: FocusEvent) => { focused = true; (e.target as HTMLInputElement).select(); }" @blur="onBlur"
      />
      <InputGroupAddon v-if="unit" class="num">{{ unit }}</InputGroupAddon>
    </InputGroup>
    <Message v-if="shownError" :id="`${fid}-d`" class="nf-help bad" severity="error" size="small" variant="simple" role="alert">{{ shownError }}</Message>
    <p v-else-if="helperText" :id="`${fid}-d`" class="sm nf-help">{{ helperText }}</p>
  </div>
</template>

<style scoped>
.nf { min-width: 0; }
.nf.sm { max-width: 128px; }
.nf.md { max-width: 184px; }
.nf-head { min-height: 24px; }
.nf-head > * + * { margin-left: 4px; }
.nf-box :deep(.nf-input) { flex: 1 1 auto; min-width: 0; text-align: right; }
.nf-box :deep(.p-inputgroupaddon) { padding-inline: 8px; font-size: var(--opc-fs-sm); }
.nf-help { margin: 2px 0 0; color: var(--opc-muted); }
.nf-help.bad { color: var(--opc-bad); }
</style>
