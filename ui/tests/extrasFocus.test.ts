// Editing extras must not throw keyboard focus to the page: removing a row or saving it to the catalog moves focus to a neighbour.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { nextTick, type App } from "vue";
import ExtrasEditor from "../src/components/costs/ExtrasEditor.vue";
import { setLocale } from "../src/i18n";
import { store } from "../src/state/store";
import { clearToasts } from "../src/state/toast";
import { load, mount } from "./priceKit";

const mounted: { app: App; root: HTMLElement }[] = [];
const flush = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); } };
beforeEach(() => { setLocale("en"); clearToasts(); });
afterEach(() => { for (const m of mounted.splice(0)) { m.app.unmount(); m.root.remove(); } });
const rows = () => [{ key: "a", label: "Box", unitMinor: 100, qtyE3: 1000, per: "piece" as const }, { key: "b", label: "Bag", unitMinor: 50, qtyE3: 1000, per: "order" as const }];

describe("extras focus", () => {
  test("removing a row lands on the row that took its place, then on + Extra when none is left", async () => {
    load("ok", { draft: (d) => ({ ...d, extras: rows() }) });
    const m = mount(ExtrasEditor); mounted.push(m); await flush();
    m.root.querySelector<HTMLButtonElement>(".xdel")!.click(); await flush();
    expect(store.draft.extras.map((x) => x.key)).toEqual(["b"]);
    expect(document.activeElement).toBe(m.root.querySelector("[data-extra-name]"));
    expect((document.activeElement as HTMLInputElement).value).toBe("Bag");
    m.root.querySelector<HTMLButtonElement>(".xdel")!.click(); await flush();
    expect(store.draft.extras).toEqual([]);
    expect((document.activeElement as HTMLElement).getAttribute("aria-haspopup")).toBe("menu");
  });

  test("saving a row to the catalog keeps focus on that row", async () => {
    load("ok", { draft: (d) => ({ ...d, extras: [{ key: "n", label: "Ribbon", unitMinor: 70, qtyE3: 2000, per: "piece" as const }] }) });
    const m = mount(ExtrasEditor); mounted.push(m); await flush();
    m.root.querySelector<HTMLButtonElement>(".xsave button")!.click(); await flush();
    expect(m.root.querySelector(".xsave")).toBeNull();
    expect(document.activeElement?.id).toBe("xn-n");
  });
});
