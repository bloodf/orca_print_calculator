import { afterEach, expect, test, vi } from "vitest";
import { nextTick, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import HelpGuide from "../src/components/HelpGuide.vue";
import { column } from "../src/i18n/messages";
import { setLocale } from "../src/i18n";
import { closeHelp, HELP_STEPS, helpStep, openHelp } from "../src/state/help";

let app: App | null = null;
afterEach(() => { app?.unmount(); app = null; closeHelp(); document.body.innerHTML = ""; });

test("every step has a title and a body in both languages", () => {
  for (const i of [0, 1] as const) for (const s of HELP_STEPS) for (const part of ["title", "body"]) expect(column(i)[`help.${s}.${part}`], `${s}.${part}`).toBeTruthy();
});
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i++) { await nextTick(); await new Promise((r) => setTimeout(r, 50)); } };
test("opens at the asked step, marks it, closes from the button, and gives focus back to the opener", async () => {
  setLocale("en");
  const opener = document.body.appendChild(document.createElement("button"));
  opener.focus();
  const root = document.body.appendChild(document.createElement("div"));
  app = createApp(HelpGuide);
  app.mount(root);
  expect(document.querySelector("[role=dialog]")).toBeNull();
  openHelp("labor");
  await settle();
  const d = document.querySelector<HTMLElement>("[role=dialog]")!;
  expect(d).not.toBeNull();
  expect(d.getAttribute("aria-modal")).toBe("true");
  expect(d.querySelectorAll("li").length).toBe(HELP_STEPS.length);
  expect(d.querySelector('[aria-current="step"]')?.textContent).toContain("Your hourly rate");
  d.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
  await settle();
  expect(helpStep.value).toBeNull();
  await vi.waitFor(() => expect(document.querySelector("[role=dialog]")).toBeNull(), { timeout: 3000 });
  expect(document.activeElement).toBe(opener);
});
