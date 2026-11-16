// Regenerates the vector mark and its PNGs. The store tile, hero, social and listing images are not built here:
// they are the generated images in assets/ (see scripts/brand_assets.py and assets/marketing/asset-manifest.json).
//   npm i --no-save sharp && node brand/src/build.mjs
// Writes SVG sources to brand/src and PNGs to brand/. BRAND_DIR overrides the output root (used for scratch builds).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const BRAND = process.env.BRAND_DIR || join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(BRAND, 'src')
mkdirSync(SRC, { recursive: true })
// lime family (UI foundation 4 accent): deep green for the mark on light surfaces, lime for the mark on graphite
const C = { green: '#446600', lime: '#B9DC6C' }
const svg = (w, h, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${extra}>${body}</svg>`

// ---- the mark (construction A): price tag pointing left, punched hole, two layer lines. 24 grid, 1.5 stroke.
const markBody = (c, sw = 1.5) => `<path d="M2.75 12L8 6.25H21.25V17.75H8Z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.75" cy="12" r="1.25" fill="${c}"/><path d="M12 9.6H18M12 14.4H18" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`
const mark = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s / 24})">${markBody(c)}</g>`
const markOnly = (c) => svg(24, 24, markBody(c), 'fill="none"')
const markCanvas = (c) => svg(1024, 1024, mark(64, 64, 896, c))

const emit = (name, s, dir = SRC) => writeFileSync(join(dir, name), s)
emit('logo.svg', markOnly(C.green), BRAND); emit('logo-dark.svg', markOnly(C.lime), BRAND)
emit('logo-mark-1024.svg', markCanvas(C.green))
for (const [f, w, d] of [['logo-mark-1024.svg', 1024, 'logo-1024.png'], ['logo-mark-1024.svg', 512, 'logo-512.png']]) {
  await sharp(readFileSync(join(SRC, f)), { density: 72 }).resize({ width: w }).png().toFile(join(BRAND, d))
  console.log('wrote', d)
}
