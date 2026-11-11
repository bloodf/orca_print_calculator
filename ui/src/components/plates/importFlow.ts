// Sliced-file import (docs/ux.md §5.3 ImportButton): check, read with progress, send, map errors. Failure leaves plates untouched.
import { reactive } from "vue";
import { call, errorCode } from "../../bridge";
import { bytes } from "../../format";
import { t } from "../../i18n";
import { applyImported, locale } from "../../state/store";
import { toast } from "../../state/toast";

export const MAX_BYTES = 100 * 1024 * 1024;
export const importState = reactive({ phase: "idle" as "idle" | "reading" | "parsing", name: "", size: 0, loaded: 0, total: 0 });
let reader: FileReader | null = null;

/** Error text for a file that must not be read at all, else null. */
export function checkFile(f: { name: string; size: number }): string | null {
  if (!/\.3mf$/i.test(f.name)) return t("import.error.notThreeMf");
  if (f.size > MAX_BYTES) return t("import.error.tooBig", { size: bytes(f.size, locale.value) });
  return null;
}

export function errorText(code: string, size: number): string {
  if (code === "not_zip") return t("import.error.notThreeMf");
  if (code === "no_slice_info") return t("import.error.notSliced");
  if (code === "too_big") return t("import.error.tooBig", { size: bytes(size, locale.value) });
  if (code === "too_large") return t("import.error.sliceTooBig");
  if (code === "timeout") return t("import.error.timeout");
  return t("import.error.unreadable");
}

const fail = (text: string): void => { toast({ text, tone: "bad" }); };
const finish = (): void => { importState.phase = "idle"; reader = null; };

export function cancelImport(): void {
  if (importState.phase === "reading") reader?.abort();
}

export function importFile(file: File): Promise<void> {
  if (importState.phase !== "idle") return Promise.resolve();
  const bad = checkFile(file);
  if (bad) { fail(bad); return Promise.resolve(); }
  Object.assign(importState, { phase: "reading", name: file.name, size: file.size, loaded: 0, total: file.size });
  return new Promise((resolve) => {
    const r = new FileReader();
    reader = r;
    r.onprogress = (e) => { if (e.lengthComputable) Object.assign(importState, { loaded: e.loaded, total: e.total }); };
    r.onabort = () => { finish(); resolve(); };
    r.onerror = () => { finish(); fail(t("import.error.unreadable")); resolve(); };
    r.onload = () => {
      const url = String(r.result ?? "");
      const b64 = url.slice(url.indexOf(",") + 1);
      importState.phase = "parsing";
      call("import_sliced", { name: file.name, b64 })
        .then((d) => {
          if (Array.isArray(d?.plates) && d.plates.length > 0) applyImported(d.plates);
          else fail(t("import.error.notSliced"));
        })
        .catch((e: unknown) => fail(errorText(errorCode(e), file.size)))
        .finally(() => { finish(); resolve(); });
    };
    r.readAsDataURL(file);
  });
}
