// The fill drawn by OuiSpool: remaining over initial weight, null whenever Spoolman does not say (the full reel with the unknown badge when there is a colour).
import { describe, expect, test } from "vitest";
import { h } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import OuiSpool from "@orca-plugins/ui-foundation/src/components/OuiSpool.vue";
import { spoolFraction, stockFraction } from "../src/spoolFill";

describe("spoolFraction", () => {
  test("remaining over initial", () => {
    expect(spoolFraction({ remainingWeight: 250, initialWeight: 1000 })).toBe(0.25);
    expect(spoolFraction({ remainingWeight: 1000, initialWeight: 1000 })).toBe(1);
    expect(spoolFraction({ remainingWeight: 0, initialWeight: 1000 })).toBe(0);
  });
  test("clamped to 0..1", () => {
    expect(spoolFraction({ remainingWeight: -20, initialWeight: 1000 })).toBe(0);
    expect(spoolFraction({ remainingWeight: 1100, initialWeight: 1000 })).toBe(1);
  });
  test.each([
    [undefined],
    [{ remainingWeight: null, initialWeight: 1000 }],
    [{ initialWeight: 1000 }],
    [{ remainingWeight: 500, initialWeight: null }],
    [{ remainingWeight: 500, initialWeight: 0 }],
    [{ remainingWeight: Number.NaN, initialWeight: 1000 }],
    [{ remainingWeight: 500, initialWeight: Number.POSITIVE_INFINITY }],
  ])("unknown when a weight is missing or unusable: %j", (s) => {
    expect(spoolFraction(s)).toBeNull();
  });
});

describe("stockFraction", () => {
  test("summed remaining over summed initial", () => {
    expect(stockFraction([{ remainingWeight: 900, initialWeight: 1000 }, { remainingWeight: 100, initialWeight: 1000 }])).toBe(0.5);
    expect(stockFraction([{ remainingWeight: 500, initialWeight: 500 }, { remainingWeight: 0, initialWeight: 1500 }])).toBe(0.25);
  });
  test("spools without both weights are left out, not counted as empty", () => {
    expect(stockFraction([{ remainingWeight: 750, initialWeight: 1000 }, { remainingWeight: null, initialWeight: 1000 }, { remainingWeight: 300 }])).toBe(0.75);
  });
  test("null with no spool, or none with both weights", () => {
    expect(stockFraction([])).toBeNull();
    expect(stockFraction([{ remainingWeight: 300, initialWeight: null }])).toBeNull();
  });
});

describe("the drawn spool", () => {
  const draw = (color: string | null, fraction: number | null): HTMLElement => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    createApp({ render: () => h(OuiSpool, { color, fraction }) }).mount(root);
    return root.querySelector<HTMLElement>(".oui-spool")!;
  };
  test("an unknown weight with a colour: the full reel with the unknown badge", () => {
    const spool = draw("#2E6FBF", spoolFraction({ remainingWeight: null, initialWeight: 1000 }));
    expect([spool.dataset.level, spool.hasAttribute("data-unknown"), spool.querySelector(".oui-spool-unknown")?.textContent]).toEqual(["1", true, "?"]);
  });
  test("a known weight: its level, no badge; no colour and no weight: the bare reel", () => {
    const known = draw("#2E6FBF", spoolFraction({ remainingWeight: 250, initialWeight: 1000 }));
    expect([known.dataset.level, known.querySelector(".oui-spool-unknown")]).toEqual(["6", null]);
    const bare = draw(null, null);
    expect([bare.dataset.level, bare.hasAttribute("data-unknown"), bare.querySelector(".oui-spool-unknown")]).toEqual(["8", false, null]);
  });
});
