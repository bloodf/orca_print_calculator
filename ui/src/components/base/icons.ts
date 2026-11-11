// Inline SVG icon set (docs/ux.md §4.6). 24x24 grid, 1.5 stroke, currentColor.
export type Part = { t: "p"; d: string } | { t: "c"; cx: number; cy: number; r: number; solid?: boolean } | { t: "r"; x: number; y: number; w: number; h: number; rx: number };
const p = (d: string): Part => ({ t: "p", d });
const c = (cx: number, cy: number, r: number): Part => ({ t: "c", cx, cy, r });
const dot = (cx: number, cy: number, r = 1): Part => ({ t: "c", cx, cy, r, solid: true });
const rect = (x: number, y: number, w: number, h: number, rx: number): Part => ({ t: "r", x, y, w, h, rx });

const link = "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1";

export const ICONS = {
  mark: [p("M2.75 12L8 6.25H21.25V17.75H8Z"), dot(7.75, 12, 1.25), p("M12 9.6H18M12 14.4H18")],
  "chevron-down": [p("M6 9l6 6 6-6")],
  "chevron-right": [p("M9 6l6 6-6 6")],
  "arrow-left": [p("M19 12H5M11 6l-6 6 6 6")],
  plus: [p("M12 5v14M5 12h14")],
  minus: [p("M5 12h14")],
  x: [p("M6 6l12 12M18 6L6 18")],
  check: [p("M5 12.5l4.5 4.5L19 7")],
  refresh: [p("M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9M19.5 4.5V9H15")],
  reset: [p("M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9")],
  sliders: [p("M4 7h9M17 7h3M4 17h3M11 17h9"), c(15, 7, 2), c(9, 17, 2)],
  list: [p("M9 7h11M9 12h11M9 17h11"), dot(5, 7), dot(5, 12), dot(5, 17)],
  calc: [rect(4.75, 3.75, 14.5, 16.5, 2), p("M8 7.75h8"), dot(8.5, 12), dot(12, 12), dot(15.5, 12), dot(8.5, 16), dot(12, 16), dot(15.5, 16)],
  "alert-triangle": [p("M12 3.75L21.25 19.75H2.75Z M12 9.75v4.5"), dot(12, 17)],
  "alert-circle": [c(12, 12, 8.25), p("M12 7.75v5"), dot(12, 16)],
  help: [c(12, 12, 8.25), p("M9.75 9.75a2.25 2.25 0 1 1 3.5 1.9c-.75.5-1.25.95-1.25 1.85"), dot(12, 16.25)],
  info: [c(12, 12, 8.25), p("M12 11v5"), dot(12, 8)],
  "printer-3d": [p("M4.75 20.25V3.75h14.5v16.5M4.75 8h14.5M10 8v3.5l2 2 2-2V8M8 20.25h8")],
  print: [p("M7 9V3.75h10V9M7 17H4.75V9h14.5v8H17M7 14h10v6.25H7Z")],
  download: [p("M12 4v11M7 10l5 5 5-5M5 20h14")],
  upload: [p("M12 15V4M7 9l5-5 5 5M5 20h14")],
  copy: [rect(8, 8, 12, 12, 2), p("M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8")],
  trash: [p("M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5")],
  pencil: [p("M4.5 19.5l1-4L16 5a2.1 2.1 0 0 1 3 3L8.5 18.5Z")],
  link: [p(link)],
  "link-off": [p(link), p("M4 4l16 16")],
  clock: [c(12, 12, 8.25), p("M12 7.5V12l3 2")],
  more: [dot(6, 12, 1.25), dot(12, 12, 1.25), dot(18, 12, 1.25)],
  search: [c(11, 11, 6.25), p("M20 20l-4.5-4.5")],
  box: [p("M12 3.75l7.5 4v8.5l-7.5 4-7.5-4v-8.5ZM4.5 7.75l7.5 4 7.5-4M12 11.75v8.5")],
  bolt: [p("M13 3.75L5.75 13.5H12l-1 6.75 7.25-9.75H12Z")],
} satisfies Record<string, Part[]>;

export type IconName = keyof typeof ICONS;
