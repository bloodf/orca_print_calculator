import { afterEach, expect, test } from "vitest";
import { createApp, nextTick, type App } from "vue";
import HelpGuide from "../src/components/HelpGuide.vue";
import { column } from "../src/i18n/messages";
import { setLocale } from "../src/i18n";
import { closeHelp, HELP_STEPS, helpStep, openHelp } from "../src/state/help";

let app: App | null = null;
afterEach(() => { app?.unmount(); app = null; closeHelp(); document.body.innerHTML = ""; });

test("every step has a title and a body in both languages", () => {
  for (const i of [0, 1] as const) for (const s of HELP_STEPS) for (const part of ["title", "body"]) expect(column(i)[`help.${s}.${part}`], `${s}.${part}`).toBeTruthy();
});
test("opens at the asked step, marks it, and closes from the button", async () => {
  setLocale("en");
  const root = document.body.appendChild(document.createElement("div"));
  app = createApp(HelpGuide);
  app.mount(root);
  const d = root.querySelector("dialog")!;
  expect(d.hasAttribute("open")).toBe(false);
  openHelp("labor");
  await nextTick();
  expect(d.hasAttribute("open")).toBe(true);
  expect(root.querySelectorAll("li").length).toBe(HELP_STEPS.length);
  expect(root.querySelector('[aria-current="step"]')?.textContent).toContain("Your hourly rate");
  root.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
  await nextTick();
  expect(helpStep.value).toBeNull();
  expect(d.hasAttribute("open")).toBe(false);
});
