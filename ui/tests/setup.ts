// jsdom gaps that PrimeVue's tabs, selects and overlays read at mount time. These are browser APIs the real WebView has; nothing
// here changes component behaviour, it only gives jsdom something to observe.
class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
if (typeof globalThis.ResizeObserver === "undefined") globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
