// Quote sheet branding: logo and company details (pure rules; the canvas work is in logoFile.ts).
import type { SheetBrand } from "./types";

export const DEFAULT_ACCENT = "#00675B";
export const MAX_LOGO_CHARS = 400_000; // ~300 KB image as a data URI; it rides in settings.json on every save
export const EMPTY_BRAND: SheetBrand = { logo: "", taxId: "", phone: "", email: "", website: "", address: "", payment: "", accent: DEFAULT_ACCENT };

/** Only a raster image we encoded ourselves: no SVG, no remote URL, nothing that can carry markup into the exported HTML. */
export const validLogo = (v: unknown): v is string => v === "" || (typeof v === "string" && v.length <= MAX_LOGO_CHARS && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(v));
export const validAccent = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const text = (max: number) => (v: unknown): boolean => typeof v === "string" && v.length <= max;
export const BRAND_SHAPES: { [K in keyof SheetBrand]: (v: unknown) => boolean } = {
  logo: validLogo, accent: validAccent, taxId: text(40), phone: text(40), email: text(80), website: text(80), address: text(280), payment: text(280),
};
