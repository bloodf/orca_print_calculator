// Toasts only count down while the page has focus (foundation 4.2.1); jsdom never has it. Stubbed here, before any test imports
// the toast module (it reads focus once at load), so timed toasts leave as they would for someone looking at the page.
if (typeof document !== "undefined") document.hasFocus = () => true;
// jsdom gaps that PrimeVue's tabs, selects and overlays read at mount time. These are browser APIs the real WebView has; nothing
// here changes component behaviour, it only gives jsdom something to observe.
class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
if (typeof globalThis.ResizeObserver === "undefined") globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
// A closed banner is remembered for the session (OuiBanner dismissKey, sessionStorage): every test starts with none closed.
import { beforeEach } from "vitest";
beforeEach(() => { try { sessionStorage.clear(); } catch { /* no storage in this environment */ } });
