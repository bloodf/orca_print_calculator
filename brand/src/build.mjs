// Regenerates every brand asset. Build on macOS (text uses the system Avenir Next; other OSes fall back to different metrics).
//   npm i --no-save sharp && node brand/src/build.mjs
// Writes SVG sources to brand/src and PNGs to brand/. BRAND_DIR overrides the output root (used for scratch builds).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const BRAND = process.env.BRAND_DIR || join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(BRAND, 'src')
mkdirSync(SRC, { recursive: true })
const C = { teal: '#009688', tealL: '#2EBBAA', graphite: '#2B2B2B', panel: '#343434', line: '#4A4A4A', off: '#FAFAFA', amber: '#F5A524', mute: '#A8A8A8', track: '#262626' }
const FONT = `font-family="'Avenir Next','Helvetica Neue',Helvetica,Arial,sans-serif"`
const svg = (w, h, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${extra}>${body}</svg>`

// ---- the mark (construction A): price tag pointing left, punched hole, two layer lines. 24 grid, 1.5 stroke.
const markBody = (c, sw = 1.5) => `<path d="M2.75 12L8 6.25H21.25V17.75H8Z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.75" cy="12" r="1.25" fill="${c}"/><path d="M12 9.6H18M12 14.4H18" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`
const mark = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s / 24})">${markBody(c)}</g>`

const t = (x, y, s, size, fill, w = 500, anchor = 'start', extra = '') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}" ${FONT} ${extra}>${s}</text>`
const rect = (x, y, w, h, fill, r = 2, stroke = '', sw = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`

// ---- data: one scenario per language, all numbers derived (integer cents)
const SW = { white: '#E8E8E8', teal: C.tealL, slate: '#7C8C9C' }
const PLATES = [
  { time: '2h 14m', chips: [['white', 88], ['teal', 41]] },
  { time: '4h 02m', chips: [['slate', 186]] },
  { time: '58m', chips: [['teal', 22], ['white', 64]] },
]
const fmtMoney = (lg, cents) => {
  const n = (cents / 100).toFixed(2)
  const [i, d] = n.split('.')
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, lg.thou)
  return `${lg.sym}${g}${lg.dec}${d}`
}
function scenario(lg) {
  const plates = PLATES.map((p) => ({ ...p, cents: Math.round(p.chips.reduce((a, [, g]) => a + g, 0) * lg.perG) }))
  const filament = plates.reduce((a, p) => a + p.cents, 0)
  const sub = filament + lg.energy + lg.labor
  const fail = Math.round(sub * 0.08)
  const cost = sub + fail
  const price = Math.ceil(cost / 0.6 / 100) * 100 - 10 // prettied to x.90
  const margin = price - cost
  const channels = lg.channels.map(([name, fee]) => {
    const p = name === 'direct' ? price : Math.ceil(price / (1 - fee) / 100) * 100 - 10
    const net = Math.round(p * (1 - fee))
    return { name, fee, price: p, margin: (net - cost) / net }
  })
  return { plates, filament, rows: [[lg.filament, filament], [lg.energyL, lg.energy], [lg.labor_l, lg.labor], [lg.failL, fail], [lg.marginL, margin]], price, channels }
}

const L = {
  en: { sym: '$', thou: ',', dec: '.', perG: 2.25, energy: 85, labor: 600, filament: 'Filament', energyL: 'Energy', labor_l: 'Labor', failL: 'Failure losses', marginL: 'Margin', breakdown: 'Cost breakdown', price: 'Suggested price', channel: 'Channel', fee: 'Fee', margin: 'Net margin', pr: 'Price', item: 'Item', total: 'Total', slot: 'Slot', remain: 'Remaining', perkg: 'Per kg', plate: 'Plate',
    channels: [['direct', 0], ['Online store', 0.04], ['Marketplace', 0.12], ['Wholesale', 0.25]], direct: 'Direct',
    spools: [['AMS A1', 'PLA Basic White', 'white', .72, 1990], ['AMS A2', 'PETG HF Teal', 'teal', .41, 2450], ['AMS A3', 'PLA Matte Slate', 'slate', .88, 2100], ['Ext 1', 'ABS Graphite', 'white', .15, 2340]],
    quote: { shop: 'Studio Layer', mono: 'SL', no: 'Quote #0042', lines: [['Bracket, PLA Basic ×2', 980], ['Cable clip, PETG ×10', 1800], ['Gift box + shipping', 1510]], foot: 'Made with Orca Print Calculator' },
    cap: ['Every plate, priced', 'Real filament cost from Spoolman', 'Know your margin on every channel', 'Send a quote in one click'], tag: 'Price every plate.', sub: 'Calculator for OrcaSlicer', scope: 'Spoolman connected' },
  pt: { sym: 'R$ ', thou: '.', dec: ',', perG: 11, energy: 240, labor: 5500, filament: 'Filamento', energyL: 'Energia', labor_l: 'Mão de obra', failL: 'Perdas por falha', marginL: 'Margem', breakdown: 'Detalhe do custo', price: 'Preço sugerido', channel: 'Canal', fee: 'Taxa', margin: 'Margem líquida', pr: 'Preço', item: 'Item', total: 'Total', slot: 'Slot', remain: 'Restante', perkg: 'Por kg', plate: 'Placa',
    channels: [['direct', 0], ['Loja online', 0.04], ['Marketplace', 0.12], ['Atacado', 0.25]], direct: 'Direto',
    spools: [['AMS A1', 'PLA Basic Branco', 'white', .72, 10990], ['AMS A2', 'PETG HF Verde-água', 'teal', .41, 13990], ['AMS A3', 'PLA Matte Ardósia', 'slate', .88, 11990], ['Ext 1', 'ABS Grafite', 'white', .15, 12490]],
    quote: { shop: 'Oficina Três D', mono: 'O3', no: 'Orçamento nº 0042', lines: [['Suporte, PLA Basic ×2', 4980], ['Presilha de cabo, PETG ×10', 8900], ['Caixa de presente + frete', 2490]], foot: 'Feito com Orca Print Calculator' },
    cap: ['Cada placa, precificada', 'Custo real do filamento via Spoolman', 'Saiba sua margem em cada canal', 'Envie um orçamento com um clique'], tag: 'Precifique cada placa.', sub: 'Calculadora para OrcaSlicer', scope: 'Spoolman conectado' },
}
const fmtPct = (lg, x) => `${(x * 100).toFixed(0)}%`
const fmtFee = (lg, f) => `${(f * 100).toFixed(Math.abs(f * 100 - Math.round(f * 100)) < 1e-9 ? 0 : 1).replace('.', lg.dec)}%`

// ---- UI pieces
function plateThumb(x, y, w, h, k, chips) {
  const g = [rect(x, y, w, h, '#2F2F2B', 4, C.line)]
  for (let i = 1; i < 6; i++) g.push(`<path d="M${x + (w * i) / 6} ${y + 6}V${y + h - 6}" stroke="#3E3E3E"/>`)
  for (let i = 1; i < 4; i++) g.push(`<path d="M${x + 6} ${y + (h * i) / 4}H${x + w - 6}" stroke="#3E3E3E"/>`)
  const tpl = [[[.2, .3, .26, .4], [.58, .22, .2, .5]], [[.18, .5, .5, .25], [.62, .25, .2, .2]], [[.2, .3, .28, .45], [.55, .3, .25, .4]]][k]
  tpl.forEach(([a, b, c, d], i) => g.push(rect(x + w * a, y + h * b, w * c, h * d, SW[chips[i % chips.length][0]], 3)))
  return g.join('')
}
function plateCard(x, y, w, k, p, lg, sel) {
  const h = 128
  return rect(x, y, w, h, C.panel, 6, sel ? C.tealL : C.line, sel ? 2 : 1) + plateThumb(x + 12, y + 12, 96, h - 24, k, p.chips)
    + t(x + 128, y + 34, `${lg.plate} ${k + 1}`, 18, C.off, 600) + t(x + 128, y + 58, p.time, 15, C.mute)
    + p.chips.map(([c, g], i) => `<circle cx="${x + 134 + i * 92}" cy="${y + 82}" r="6" fill="${SW[c]}"/>` + t(x + 146 + i * 92, y + 88, `${g} g`, 15, C.off, 500)).join('')
    + t(x + w - 16, y + h - 20, fmtMoney(lg, p.cents), 20, C.off, 600, 'end')
}
function breakdown(x, y, w, lg, sc) {
  const max = Math.max(...sc.rows.map((r) => r[1]))
  const g = [rect(x, y, w, 468 - 68 + 8, C.panel, 6, C.line), t(x + 18, y + 32, lg.breakdown, 15, C.mute, 500)]
  sc.rows.forEach(([name, v], i) => {
    const yy = y + 66 + i * 36
    g.push(t(x + 18, yy + 5, name, 15, C.off), rect(x + 150, yy - 7, w - 150 - 100, 12, C.track, 2), rect(x + 150, yy - 7, (w - 250) * (v / max), 12, C.teal, 2), t(x + w - 18, yy + 5, fmtMoney(lg, v), 15, C.off, 500, 'end'))
  })
  const py = y + 66 + sc.rows.length * 36 + 18
  g.push(`<path d="M${x + 18} ${py}H${x + w - 18}" stroke="${C.line}"/>`, t(x + 18, py + 32, lg.price, 15, C.mute, 500), t(x + 18, py + 82, fmtMoney(lg, sc.price), 46, C.amber, 700))
  return g.join('')
}
function windowFrame(x, y, w, h, lg, inner) {
  return rect(x, y, w, h, C.graphite, 10, C.line) + rect(x + 1, y + 1, w - 2, 43, C.track, 9) + rect(x + 1, y + 34, w - 2, 10, C.track, 0)
    + mark(x + 14, y + 10, 24, C.tealL) + t(x + 46, y + 28, 'Orca Print Calculator', 15, C.off, 600)
    + `<circle cx="${x + w - 196}" cy="${y + 22}" r="4.5" fill="${C.tealL}"/>` + t(x + w - 184, y + 27, lg.scope, 14, C.mute, 500)
    + `<path d="M${x} ${y + 44}H${x + w}" stroke="${C.line}"/>` + inner
}
const mockPlates = (x, y, w, h, lg) => {
  const sc = scenario(lg), cw = w - 72 - 340
  return windowFrame(x, y, w, h, lg, sc.plates.map((p, k) => plateCard(x + 24, y + 68 + k * 140, cw, k, p, lg, k === 0)).join('') + breakdown(x + w - 24 - 340, y + 68, 340, lg, sc))
}
const mockSpools = (x, y, w, h, lg) => {
  const g = [t(x + 40, y + 86, lg.slot, 14, C.mute, 500), t(x + 160, y + 86, lg.filament, 14, C.mute, 500), t(x + w - 330, y + 86, lg.remain, 14, C.mute, 500), t(x + w - 40, y + 86, lg.perkg, 14, C.mute, 500, 'end')]
  lg.spools.forEach(([s, n, ci, f, p], i) => {
    const yy = y + 100 + i * 92
    g.push(rect(x + 20, yy, w - 40, 76, C.panel, 6, C.line), t(x + 40, yy + 45, s, 18, C.off, 600), `<circle cx="${x + 172}" cy="${yy + 38}" r="12" fill="none" stroke="${SW[ci]}" stroke-width="5"/>`, t(x + 200, yy + 45, n, 18, C.off, 500), rect(x + w - 330, yy + 33, 150, 10, C.track, 2), rect(x + w - 330, yy + 33, 150 * f, 10, f < .2 ? C.mute : C.tealL, 2), t(x + w - 40, yy + 45, fmtMoney(lg, p), 18, C.off, 600, 'end'))
  })
  return windowFrame(x, y, w, h, lg, g.join(''))
}
const mockChannels = (x, y, w, h, lg) => {
  const sc = scenario(lg), cols = [x + 44, x + w * .46, x + w * .68, x + w - 44]
  const g = [t(cols[0], y + 86, lg.channel, 14, C.mute, 500), t(cols[1], y + 86, lg.fee, 14, C.mute, 500, 'end'), t(cols[2], y + 86, lg.pr, 14, C.mute, 500, 'end'), t(cols[3], y + 86, lg.margin, 14, C.mute, 500, 'end')]
  sc.channels.forEach((c, i) => {
    const yy = y + 100 + i * 92, best = i === 0
    g.push(rect(x + 24, yy, w - 48, 76, C.panel, 6, best ? C.tealL : C.line, best ? 2 : 1), t(cols[0], yy + 46, c.name === 'direct' ? lg.direct : c.name, 18, C.off, 600), t(cols[1], yy + 46, fmtFee(lg, c.fee), 18, C.mute, 500, 'end'),
      t(cols[2], yy + 47, fmtMoney(lg, c.price), best ? 26 : 22, best ? C.amber : C.off, best ? 700 : 600, 'end'), rect(cols[3] - 190, yy + 33, 100, 10, C.track, 2), rect(cols[3] - 190, yy + 33, 100 * Math.min(1, c.margin / 0.45), 10, C.tealL, 2), t(cols[3], yy + 46, fmtPct(lg, c.margin), 18, C.off, 600, 'end'))
  })
  return windowFrame(x, y, w, h, lg, g.join(''))
}
const mockQuote = (x, y, w, h, lg) => {
  const q = lg.quote, px = x + w * .2, pw = w * .6, total = q.lines.reduce((a, l) => a + l[1], 0)
  const g = [rect(px, y + 62, pw, h - 62 - 22, '#FFFFFF', 4), rect(px + 36, y + 88, 36, 36, '#2B2B2B', 4), t(px + 54, y + 112, q.mono, 15, '#FAFAFA', 700, 'middle'), t(px + 86, y + 114, q.shop, 20, '#2B2B2B', 700), t(px + pw - 36, y + 114, q.no, 16, '#5C6664', 500, 'end'), `<path d="M${px + 36} ${y + 142}H${px + pw - 36}" stroke="#00675B" stroke-width="2"/>`, t(px + 36, y + 176, lg.item, 14, '#5C6664', 600), t(px + pw - 36, y + 176, lg.total, 14, '#5C6664', 600, 'end')]
  q.lines.forEach(([n, p], i) => {
    const yy = y + 212 + i * 46
    g.push(t(px + 36, yy, n, 17, '#2B2B2B', 500), t(px + pw - 36, yy, fmtMoney(lg, p), 17, '#2B2B2B', 600, 'end'), `<path d="M${px + 36} ${yy + 14}H${px + pw - 36}" stroke="#E3E6E5"/>`)
  })
  g.push(rect(px + 36, y + 366, pw - 72, 60, '#2B2B2B', 4), t(px + 56, y + 404, lg.total, 17, '#D0D0D0', 500), t(px + pw - 56, y + 406, fmtMoney(lg, total), 30, C.amber, 700, 'end'), t(px + 36, y + 448, q.foot, 12, '#5C6664', 500))
  return windowFrame(x, y, w, h, lg, g.join(''))
}

// ---- compositions
const wordmark = (x, y, size, c) => t(x, y, 'Orca Print Calculator', size, c, 700, 'start', 'letter-spacing="-0.01em"')
const hero = (lg = L.en) => svg(1600, 640, rect(0, 0, 1600, 640, C.graphite, 0) + `<path d="M0 0H1600V4H0z" fill="${C.teal}"/>`
  + mark(76, 196, 80, C.tealL) + wordmark(80, 336, 34, C.off) + `<path d="M80 362H200" stroke="${C.teal}" stroke-width="3"/>` + t(80, 412, lg.tag, 26, C.tealL, 600) + t(80, 448, lg.sub, 18, C.mute, 500)
  + mockPlates(540, 64, 1000, 512, lg))
const listing = (i, lg) => svg(1280, 800, rect(0, 0, 1280, 800, C.graphite, 0) + mark(60, 46, 44, C.tealL) + t(112, 80, 'Orca Print Calculator', 18, C.mute, 600)
  + t(64, 170, lg.cap[i], 52, C.off, 700, 'start', 'letter-spacing="-0.015em"') + `<path d="M64 200H184" stroke="${C.teal}" stroke-width="4"/>`
  + [mockPlates, mockSpools, mockChannels, mockQuote][i](64, 244, 1152, 508, lg))
const social = () => svg(1280, 640, rect(0, 0, 1280, 640, C.graphite, 0) + `<path d="M0 0H1280V6H0z" fill="${C.teal}"/>` + mark(112, 180, 140, C.tealL) + wordmark(300, 262, 56, C.off) + `<path d="M300 296H420" stroke="${C.teal}" stroke-width="4"/>` + t(300, 366, L.en.tag, 40, C.tealL, 600) + t(300, 414, L.en.sub, 22, C.mute, 500))
const iconTile = () => svg(512, 512, rect(0, 0, 512, 512, C.graphite, 112) + rect(12.5, 12.5, 487, 487, 'none', 100, C.line, 1) + mark(102.4, 102.4, 307.2, C.tealL))
const markOnly = (c) => svg(24, 24, markBody(c), 'fill="none"')
const markCanvas = (c) => svg(1024, 1024, mark(64, 64, 896, c))

const emit = (name, s, dir = SRC) => writeFileSync(join(dir, name), s)
emit('logo.svg', markOnly(C.teal), BRAND); emit('logo-dark.svg', markOnly(C.tealL), BRAND)
emit('icon-tile.svg', iconTile()); emit('hero.svg', hero()); emit('social.svg', social()); emit('logo-mark-1024.svg', markCanvas(C.teal))
for (let i = 0; i < 4; i++) { emit(`listing-${i + 1}.svg`, listing(i, L.en)); emit(`listing-${i + 1}-pt.svg`, listing(i, L.pt)) }
const jobs = [['logo-mark-1024.svg', 1024, 'logo-1024.png'], ['logo-mark-1024.svg', 512, 'logo-512.png'], ['icon-tile.svg', 512, 'icon-512.png'], ['icon-tile.svg', 256, 'icon-256.png'], ['hero.svg', 1600, 'hero.png'], ['social.svg', 1280, 'social.png'],
  ...[1, 2, 3, 4].flatMap((i) => [[`listing-${i}.svg`, 1280, `listing-${i}.png`], [`listing-${i}-pt.svg`, 1280, `listing-${i}-pt.png`]])]
for (const [f, w, d] of jobs) {
  await sharp(readFileSync(join(SRC, f)), { density: f.startsWith('logo-mark') ? 72 : 144 }).resize({ width: w }).png().toFile(join(BRAND, d))
  console.log('wrote', d)
}
