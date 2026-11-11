// Picked image file -> small PNG/JPEG data URI for the quote sheet. Re-encoding through a canvas drops metadata and
// anything that is not pixels. Data URIs only: the page's CSP allows no blob: or remote images.
import { MAX_LOGO_CHARS, validLogo } from "./state/sheet";

const MAX_FILE = 5 * 1024 * 1024;
const MAX_W = 480;
const MAX_H = 240;
export type LogoError = "type" | "size" | "read";

const readAsDataUrl = (f: File): Promise<string> => new Promise((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => bad(new Error("read"));
  r.readAsDataURL(f);
});
const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((ok, bad) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => bad(new Error("read"));
  img.src = src;
});

export async function logoFromFile(f: File): Promise<{ ok: true; logo: string } | { ok: false; error: LogoError }> {
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return { ok: false, error: "type" };
  if (f.size > MAX_FILE) return { ok: false, error: "size" };
  try {
    const img = await loadImage(await readAsDataUrl(f));
    const k = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "read" };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let logo = canvas.toDataURL("image/png"); // keeps transparency
    if (logo.length > MAX_LOGO_CHARS) { // a photo: flatten on white and compress
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      logo = canvas.toDataURL("image/jpeg", 0.85);
    }
    if (validLogo(logo) && logo !== "") return { ok: true, logo };
    return { ok: false, error: /^data:image\/(png|jpeg);base64,./.test(logo) ? "size" : "read" }; // empty canvas: "data:,"
  } catch {
    return { ok: false, error: "read" };
  }
}
