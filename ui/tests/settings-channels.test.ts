import { afterEach, beforeEach, describe, expect, test } from "vitest";
import ChannelEditor from "../src/components/settings/ChannelEditor.vue";
import { addChannel, problemMessage, problemsFor, removeChannel } from "../src/components/settings/channelOps";
import { MAX_TIERS } from "../src/engine/channels";
import { t } from "../src/i18n";
import { store } from "../src/state/store";
import { byText, flush, installHost, lastToast, mountComponent, resetStore, type, unmountComponent } from "./settings-helpers";

beforeEach(() => { resetStore(); installHost(); });
afterEach(unmountComponent);
const ids = () => store.settings.channels.map((c) => c.id);
const open = async (root: HTMLElement, name: string) => { (root.querySelector(`button[aria-label='Edit ${name}']`) as HTMLElement).click(); await flush(); };

describe("channel validation maps to inline errors", () => {
  test("every engine code has copy and shows on the right element", async () => {
    const id = addChannel();
    const root = mountComponent(ChannelEditor);
    await open(root, "My channel");
    type(root.querySelector(`#channel-name-${id}`)!, "  ");
    await flush();
    expect(root.textContent).toContain(t("channel.def.name_empty"));
    expect(root.textContent).toContain(t("channel.fixFees"));
    for (const c of ["name_empty", "no_tiers", "too_many_tiers", "not_natural", "first_tier_not_zero", "tiers_not_ascending", "pct_plus_tax_too_high", "duplicate_id"] as const) {
      expect(problemMessage({ code: c }), c).not.toMatch(/^channel\.def\./);
    }
    expect(problemMessage({ code: "too_many_tiers" })).toContain(String(MAX_TIERS));
  });

  test("fee plus tax over 90% flags the channel but keeps what was typed", async () => {
    const id = addChannel();
    const root = mountComponent(ChannelEditor);
    await open(root, "My channel");
    const [fee, , tax] = [...root.querySelectorAll<HTMLInputElement>(".ce-edit .form-grid input")];
    type(fee!, "60"); type(tax!, "40"); await flush();
    expect(store.settings.channels.find((c) => c.id === id)).toMatchObject({ taxBp: 4000 });
    expect(problemsFor(id).map((p) => p.code)).toContain("pct_plus_tax_too_high");
    expect(root.textContent).toContain("Fee plus tax can't pass 90%.");
  });

  test("duplicate ids are reported and adding never creates one", () => {
    const a = addChannel(), b = addChannel();
    expect(new Set([a, b]).size).toBe(2);
    store.settings = { ...store.settings, channels: [...store.settings.channels, { ...store.settings.channels[1]! }] };
    expect(problemsFor(a).length + problemsFor(store.settings.channels[2]!.id).length).toBeGreaterThan(0);
    expect(problemsFor(a).concat(problemsFor(b)).some((p) => p.code === "duplicate_id")).toBe(true);
  });
});

describe("price tiers", () => {
  test("add up to the limit, then the button stops adding; remove frees a slot", async () => {
    const id = addChannel();
    const root = mountComponent(ChannelEditor);
    await open(root, "My channel");
    byText(root, "button", t("channel.addTiers"))!.click(); await flush();
    const add = () => byText(root, "button", t("channel.addTier"))!;
    for (let i = 0; i < 12; i++) { add().click(); await flush(); }
    const tiers = () => store.settings.channels.find((c) => c.id === id)!.tiers;
    expect(tiers()).toHaveLength(MAX_TIERS);
    expect(add().getAttribute("aria-disabled")).toBe("true");
    expect(problemsFor(id)).toEqual([]);
    (root.querySelector("button[aria-label^='Remove From price']") as HTMLElement).click(); await flush();
    expect(tiers()).toHaveLength(MAX_TIERS - 1);
    expect(add().getAttribute("aria-disabled")).toBe("false");
  });

  test("first tier row is read-only", async () => {
    addChannel();
    const root = mountComponent(ChannelEditor);
    await open(root, "My channel");
    byText(root, "button", t("channel.addTiers"))!.click(); await flush();
    expect(root.querySelectorAll(".tr-grid.first input")).toHaveLength(0);
  });
});

describe("delete and undo", () => {
  test("delete restores at the same index with compare and default state", async () => {
    store.settings = { ...store.settings, defaultChannelId: "direct" };
    const mid = addChannel(); addChannel();
    store.settings = { ...store.settings, defaultChannelId: mid };
    const before = ids();
    expect(removeChannel(mid)).toBe(true);
    expect(ids()).not.toContain(mid);
    expect(store.settings.defaultChannelId).toBe("direct");
    expect(lastToast()?.text).toBe("My channel deleted");
    lastToast()!.action!.run();
    expect(ids()).toEqual(before);
    expect(store.settings.defaultChannelId).toBe(mid);
    expect(store.settings.comparedChannelIds).toContain(mid);
  });

  test("the last remaining channel cannot be deleted and shows no trash button", () => {
    const root = mountComponent(ChannelEditor);
    expect(removeChannel("direct")).toBe(false);
    expect(root.querySelector("button[aria-label^='Delete']")).toBeNull();
    expect(root.querySelector("input[type=checkbox]")).toBeNull();
  });
});
