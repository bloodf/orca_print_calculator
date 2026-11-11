// The one reactive store (docs/ux.md §5.1, §7). Plain Vue reactive + computed; every update replaces, never mutates.
// Quote actions live in state/quotes.ts.
import { computed, reactive } from "vue";
import { call, errorCode, on, ready, type HostEvent, type PlatesEvent } from "../bridge";
import { failText } from "../hostError";
import { hostLocale, intlLocale, setLocale, t, type Lang } from "../i18n";
import { defaultSettings, keepPlateControls, mergeSettings, newDraft, resetNames, shiftPlateControls } from "./defaults";
import { deriveQuote, failedDerive, safeDigits } from "./derive";
import { toast } from "./toast";
import { parseQuotes } from "./validate";
import type { Draft, HostInfo, HostPlate, HostState, OverridableKey, Defaults, SavedQuote, Settings, SpoolerInfo, SpoolmanData, SpoolmanState, View } from "./types";

export type Status = "loading" | "ready" | "error";
const EMPTY_HOST: HostInfo = { projectName: null, printerModel: null, printerVendor: null, pluginVersion: "" };
const guessCurrency = (): string => (hostLocale().toLowerCase().startsWith("pt") ? "BRL" : "USD");

export const store = reactive({
  status: "loading" as Status,
  error: null as string | null,
  view: "calc" as View,
  preview: false,
  host: EMPTY_HOST,
  plates: [] as HostPlate[],
  /** A live slice that arrived while imported or saved plates are on screen (shown as "New slice" with "Use it"). */
  pendingPlates: null as HostPlate[] | null,
  settings: defaultSettings(null, "Direct"),
  quotes: [] as SavedQuote[],
  /** Rows of quotes.json that could not be read: counted for a notice, and written back untouched on every save. */
  skippedQuotes: 0,
  /** Settings from the file that were invalid and reset to built-ins: shown once, then dismissed. */
  settingsReset: [] as string[],
  /** Saved files the host could not read ("settings", "quotes"): a persistent banner, no first run, nothing is written. */
  unreadable: [] as string[],
  quarantined: [] as unknown[],
  spooler: null as SpoolerInfo,
  spoolman: { state: "unset" as SpoolmanState, data: { currency: null, filaments: [], spools: [] } as SpoolmanData, error: null as string | null },
  draft: newDraft(defaultSettings(null, "Direct")),
  saveStatus: "idle" as "idle" | "saved" | "error",
});

// ---- derived (docs/ux.md §5.1 derive.ts computeds) ----
// A saved quote that is open keeps its own currency; otherwise Spoolman, the saved setting, then the host locale.
export const currency = computed(() => store.draft.currency ?? store.spoolman.data.currency ?? store.settings.currency ?? guessCurrency());
export const liveCurrency = computed(() => store.spoolman.data.currency ?? store.settings.currency ?? guessCurrency());
export const currencySource = computed<"spoolman" | "settings">(() => (store.spoolman.data.currency ? "spoolman" : "settings"));
export const digits = computed(() => safeDigits(currency.value));
export const locale = computed(() => intlLocale()); // intlLocale() reads the reactive i18n state, so this follows language changes
export const derived = computed(() => {
  try {
    return deriveQuote({ settings: store.settings, draft: store.draft, plates: store.plates, host: store.host, spoolman: store.spoolman.data, spooler: store.spooler, currency: currency.value });
  } catch (e) {
    console.error("derive", e);
    return failedDerive(currency.value, store.draft, defaultSettings(null, "Direct").defaults);
  }
});
export const quoteInput = computed(() => derived.value.quoteInput);
export const result = computed(() => derived.value.result);
export const selected = computed(() => derived.value.selected);
export const slotMatches = computed(() => derived.value.slotMatches);
export const notCounted = computed(() => derived.value.notCounted);
export const fieldErrors = computed(() => derived.value.fieldErrors);
export const plateOrigin = computed<"live" | "import" | "saved">(() => (store.draft.frozenPlates ? "saved" : store.plates.some((p) => p.source === "file") ? "import" : "live"));

// ---- settings: auto-save, debounced 600 ms trailing; flushed on hidden and before view switch ----
const SAVE_DELAY = 600;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let savedTimer: ReturnType<typeof setTimeout> | undefined;

/** Never write before the host's state was read: until then `store.settings` holds built-in defaults, not the user's file. */
export async function flushSettings(quiet = false): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (store.status !== "ready" || store.unreadable.includes("settings")) return; // an unreadable file is never written over
  try {
    await call("save_settings", { settings: store.settings });
    if (!quiet) {
      store.saveStatus = "saved";
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => { if (store.saveStatus === "saved") store.saveStatus = "idle"; }, 1500);
    }
  } catch (e) {
    store.saveStatus = "error";
    toast({ text: failText(t("host.cmdFailed", { action: t("settings.title") }), errorCode(e)), tone: "bad", action: { label: t("host.tryAgain"), run: () => void flushSettings() } });
    console.error("save_settings", errorCode(e));
  }
}

export function patchSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)): void {
  store.settings = { ...store.settings, ...(typeof patch === "function" ? patch(store.settings) : patch) };
  pinCurrency();
  setLocale(store.settings.language);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSettings(), SAVE_DELAY);
}
/** The first time any money value exists, remember which currency it was typed in (the effective one can change between sessions). */
function pinCurrency(): void {
  const s = store.settings;
  if (s.currency !== null) return;
  const d = s.defaults;
  const hasMoney = d.energyPerKwh !== null || d.laborPerHourMinor !== null || d.maintenancePerHourMinor > 0 || d.fixedPerPrintHourMinor > 0 || d.minOrderMinor > 0 || d.shipping.minor > 0
    || Object.keys(s.manualPrices).length > 0 || s.extrasCatalog.length > 0;
  if (hasMoney) store.settings = { ...s, currency: liveCurrency.value, defaultsCurrency: s.defaultsCurrency ?? liveCurrency.value };
}
export const patchDefaults = (patch: Partial<Defaults>): void => patchSettings((s) => ({ defaults: { ...s.defaults, ...patch } }));
export const setLanguage = (language: Lang): void => patchSettings({ language });
export const setSectionOpen = (id: string, open: boolean): void => patchSettings((s) => ({ ui: { ...s.ui, open: { ...s.ui.open, [id]: open } } }));
export const finishOnboarding = (): void => patchSettings({ onboarded: true, ...(store.settings.currency === null ? { currency: liveCurrency.value, defaultsCurrency: store.settings.defaultsCurrency ?? liveCurrency.value } : {}) });

// ---- draft ----
export const patchDraft = (patch: Partial<Draft>): void => { store.draft = { ...store.draft, ...patch }; };
export const setPlateControl = (index: number, patch: Partial<{ include: boolean; copies: number }>): void => {
  const cur = store.draft.plates[index] ?? { include: true, copies: 1 };
  patchDraft({ plates: { ...store.draft.plates, [index]: { ...cur, ...patch } } });
};
/** An edit in the calculator is a per-quote override; editing back to the default removes the key (§7.2). */
export function setOverride<K extends OverridableKey>(key: K, value: Defaults[K]): void {
  const rest = { ...store.draft.overrides };
  if (JSON.stringify(value) === JSON.stringify((store.draft.frozenDefaults ?? store.settings.defaults)[key])) delete rest[key]; // back to the quote's own value when one is open
  else rest[key] = value;
  patchDraft({ overrides: rest });
}
export function clearOverride(key: OverridableKey): void {
  const rest = { ...store.draft.overrides };
  delete rest[key];
  patchDraft({ overrides: rest });
}
export const dismissSettingsReset = (): void => { store.settingsReset = []; };
export function setView(view: View): void {
  if (saveTimer) void flushSettings(true); // quiet: leaving a view is not a user-visible save; nothing pending means nothing to save, and no "Saved" flash on entry
  store.view = view;
}
export const resetDraft = (): void => { store.draft = newDraft(store.settings); store.pendingPlates = null; };

// ---- plates ----
export function setPlates(plates: HostPlate[], deleted?: number): void {
  store.plates = plates;
  store.pendingPlates = null;
  const shifted = deleted === undefined ? store.draft : { ...store.draft, plates: shiftPlateControls(store.draft.plates, deleted) };
  store.draft = { ...store.draft, plates: keepPlateControls(shifted, plates) };
}
/** Plates from an imported file replace the list. */
export const applyImported = (plates: HostPlate[]): void => setPlates(plates);
export function useNewSlice(): void {
  if (store.pendingPlates) setPlates(store.pendingPlates);
}
function onPlates(data: unknown): void {
  const d = data as PlatesEvent;
  const plates = Array.isArray(d) ? d : d?.plates;
  if (!Array.isArray(plates)) return;
  // imported or saved plates stay until the user opts in; an empty list (project closed) is nothing to offer
  if (plateOrigin.value !== "live") store.pendingPlates = plates.length ? plates : null;
  else setPlates(plates, Array.isArray(d) ? undefined : d.deleted);
}
function onHost(data: unknown): void {
  const d = (data ?? {}) as HostEvent;
  if (d.host) store.host = d.host;
  if (d.kind === "ProjectOpened" || d.kind === "NewProject" || d.kind === "ProjectClosed") { store.plates = []; resetDraft(); }
}

// ---- spoolman ----
let retryTimer: ReturnType<typeof setInterval> | undefined;
let fetchSeq = 0; // a reply counts only if no newer fetch started meanwhile (the user may have changed the address)
export async function fetchSpoolman(silent = false): Promise<void> {
  const url = store.settings.spoolman.url.trim();
  const mine = ++fetchSeq;
  clearInterval(retryTimer);
  retryTimer = undefined;
  if (!url) { store.spoolman = { ...store.spoolman, state: "unset", error: null }; return; }
  store.spoolman = { ...store.spoolman, state: "connecting" };
  try {
    const data = await call("spoolman_fetch", { url });
    if (mine !== fetchSeq) return;
    store.spoolman = { state: "ok", data, error: null };
    if (!silent) toast({ text: t("spoolman.refreshed") });
  } catch (e) {
    if (mine !== fetchSeq) return;
    // Offline: chips fall back to Orca presets; saved overrides stay in settings (docs/ux.md §6.7); currency stays as last known.
    store.spoolman = { state: "offline", data: { currency: store.spoolman.data.currency, filaments: [], spools: [] }, error: errorCode(e) };
    retryTimer = setInterval(() => { if (document.visibilityState === "visible") void fetchSpoolman(true); }, 60_000);
  }
}

// ---- boot ----
function applyState(s: HostState): void {
  store.host = s.host ?? EMPTY_HOST;
  store.unreadable = Array.isArray(s.unreadable) ? s.unreadable.filter((x) => typeof x === "string") : [];
  const savedCurrency = s.settings && typeof s.settings.currency === "string" ? s.settings.currency : null;
  const fresh = defaultSettings(null, t("channel.directName"), savedCurrency ?? guessCurrency());
  let merged = fresh;
  let reset: string[] = [];
  try {
    merged = mergeSettings(s.settings, fresh);
    reset = resetNames(s.settings);
  } catch (e) {
    // Anything we cannot make sense of is treated as an unreadable file for this session: built-ins on screen, nothing written.
    console.error("settings", e);
    if (!store.unreadable.includes("settings")) store.unreadable = [...store.unreadable, "settings"];
  }
  store.settingsReset = reset;
  let parsed: { quotes: SavedQuote[]; bad: unknown[] } = { quotes: [], bad: [] };
  try {
    parsed = parseQuotes(s.quotes);
  } catch (e) {
    console.error("quotes", e);
    if (!store.unreadable.includes("quotes")) store.unreadable = [...store.unreadable, "quotes"];
  }
  const { quotes, bad } = parsed;
  // A number is never reused: nextNo is at least one above every saved quote, even if the settings save was lost.
  const nextNo = Math.max(merged.sheet.nextNo, ...quotes.map((q) => q.no + 1));
  store.settings = { ...merged, sheet: { ...merged.sheet, nextNo } };
  setLocale(store.settings.language);
  store.quotes = quotes;
  store.quarantined = bad;
  store.skippedQuotes = bad.length;
  store.spooler = s.spooler ?? null;
  store.plates = s.plates ?? [];
  store.draft = newDraft(store.settings);
  store.pendingPlates = null;
  store.spoolman = { state: "unset", data: { currency: null, filaments: [], spools: [] }, error: null };
}

export async function loadState(): Promise<void> {
  store.status = "loading";
  store.error = null;
  try {
    applyState(await call("get_state", {}));
    store.status = "ready";
    void fetchSpoolman(true);
  } catch (e) {
    store.status = "error";
    store.error = errorCode(e);
  }
}

let booted: (() => void) | null = null;
export function init(): () => void {
  booted?.();
  const offs = [on("plates", onPlates), on("host", onHost)];
  const onHide = () => { if (document.visibilityState === "hidden" && saveTimer && store.status === "ready") void flushSettings(true); };
  document.addEventListener("visibilitychange", onHide);
  setLocale(store.settings.language);
  ready();
  void loadState();
  booted = () => { offs.forEach((o) => o()); document.removeEventListener("visibilitychange", onHide); clearInterval(retryTimer); };
  return booted;
}
