<script setup lang="ts">
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
watch(spec, () => { text.value = fmt(props.modelValue); localError.value = null; });

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
  showError.value = true;
  if (!localError.value) text.value = fmt(props.modelValue);
}
function setModel(v: number): void {
  text.value = fmt(v);
  localError.value = null;
  if (v !== props.modelValue) emit("update:modelValue", v);
}
function onKey(e: KeyboardEvent): void {
  if (props.readonly) return;
  if (e.key === "Enter") { commitText(); if (!localError.value) text.value = fmt(props.modelValue); return; }
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
    <div class="nf-box row" :class="{ bad: !!shownError }">
      <span v-if="prefix" class="nf-affix muted num">{{ prefix }}</span>
      <input
        :id="fid" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" class="num"
        :value="text" :readonly="readonly" :aria-invalid="shownError ? 'true' : undefined" :aria-describedby="describedBy"
        @input="onInput" @keydown="onKey" @focus="(e) => { focused = true; (e.target as HTMLInputElement).select(); }" @blur="onBlur"
      />
      <span v-if="unit" class="nf-affix muted num">{{ unit }}</span>
    </div>
    <p v-if="shownError || helperText" :id="`${fid}-d`" class="sm nf-help" :class="{ bad: !!shownError }" :role="shownError ? 'alert' : undefined">{{ shownError || helperText }}</p>
  </div>
</template>

<style scoped>
.nf { min-width: 0; }
.nf.sm { max-width: 112px; }
.nf.md { max-width: 168px; }
.nf-head { min-height: 24px; }
.nf-head > * + * { margin-left: 4px; }
.nf-box { height: 28px; border: 1px solid var(--opc-border); border-radius: var(--opc-r-control); background: var(--opc-bg); padding: 0 8px; }
.nf-box:hover { border-color: var(--opc-muted); }
.nf-box:focus-within { border-color: var(--opc-accent-text); box-shadow: var(--opc-focus); }
.nf-box.bad, .nf-box.bad:focus-within { border-color: var(--opc-bad); }
.nf-box input { flex: 1 1 auto; min-width: 0; height: 26px; padding: 0; border: 0; background: transparent; box-shadow: none; text-align: right; }
.nf-box input:focus { box-shadow: none; }
.nf-affix { flex: none; font-size: var(--opc-fs-sm); }
.nf-affix:first-child { margin-right: 6px; }
.nf-box input + .nf-affix { margin-left: 4px; }
.nf-help { margin-top: 2px; color: var(--opc-muted); }
.nf-help.bad { color: var(--opc-bad); }
</style>
