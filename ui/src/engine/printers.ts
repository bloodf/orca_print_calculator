export type PrinterManufacturer = "Bambu Lab" | "Creality" | "Sovol" | "Snapmaker" | "Prusa";
export type PrinterPreset = {
  id: string;
  manufacturer: PrinterManufacturer;
  model: string;
  watts: number;
  estimated: boolean;
  sourceUrl: string;
};

const SOURCES = {
  bambu: "https://bambulab.com/pt-br/support/documentation",
  creality: "https://www.creality.com/",
  sovol: "https://www.sovol3d.com/collections/3d-printers",
  snapmaker: "https://snapmaker.com/collections/3d-printers",
  prusa: "https://help.prusa3d.com/article/faq-frequently-asked-questions_1932",
} as const;

const preset = (id: string, manufacturer: PrinterManufacturer, model: string, watts: number, sourceUrl: string, estimated = true): PrinterPreset => ({ id, manufacturer, model, watts, sourceUrl, estimated });
const bambu = (id: string, model: string, watts: number) => preset(id, "Bambu Lab", model, watts, SOURCES.bambu);
const creality = (id: string, model: string, watts: number) => preset(id, "Creality", model, watts, SOURCES.creality);
const sovol = (id: string, model: string, watts: number) => preset(id, "Sovol", model, watts, SOURCES.sovol);
const snapmaker = (id: string, model: string, watts: number) => preset(id, "Snapmaker", model, watts, SOURCES.snapmaker);
const prusa = (id: string, model: string, watts: number, estimated = true) => preset(id, "Prusa", model, watts, SOURCES.prusa, estimated);

// Typical PLA printing draw, not PSU/nameplate maximum. All values remain editable in the calculator.
export const PRINTER_PRESETS: PrinterPreset[] = [
  bambu("bambu-x1-carbon", "X1 Carbon", 120),
  bambu("bambu-x1e", "X1E", 140),
  bambu("bambu-p1s", "P1S", 100),
  bambu("bambu-p1p", "P1P", 90),
  bambu("bambu-p2s", "P2S", 110),
  bambu("bambu-a1", "A1", 80),
  bambu("bambu-a1-mini", "A1 mini", 60),
  bambu("bambu-h2d", "H2D", 180),
  bambu("bambu-h2d-pro", "H2D Pro", 200),
  bambu("bambu-h2s", "H2S", 160),
  bambu("bambu-h2c", "H2C", 200),

  creality("creality-k1", "K1", 140),
  creality("creality-k1c", "K1C", 150),
  creality("creality-k1-max", "K1 Max", 180),
  creality("creality-k1-se", "K1 SE", 120),
  creality("creality-k1m", "K1M", 150),
  creality("creality-k2", "K2", 180),
  creality("creality-k2-pro", "K2 Pro", 210),
  creality("creality-k2-plus", "K2 Plus", 250),
  creality("creality-ender-3-v3", "Ender-3 V3", 120),
  creality("creality-ender-3-v3-se", "Ender-3 V3 SE", 100),
  creality("creality-ender-3-v3-ke", "Ender-3 V3 KE", 110),
  creality("creality-ender-3-v3-corexz", "Ender-3 V3 CoreXZ", 140),
  creality("creality-ender-3-v3-plus", "Ender-3 V3 Plus", 170),
  creality("creality-hi", "Creality Hi", 130),
  creality("creality-ender-5-max", "Ender-5 Max", 250),

  sovol("sovol-sv01", "SV01", 100),
  sovol("sovol-sv01-pro", "SV01 Pro", 110),
  sovol("sovol-sv02", "SV02", 120),
  sovol("sovol-sv03", "SV03", 120),
  sovol("sovol-sv04", "SV04 IDEX", 180),
  sovol("sovol-sv05", "SV05", 100),
  sovol("sovol-sv06", "SV06", 100),
  sovol("sovol-sv06-plus", "SV06 Plus", 140),
  sovol("sovol-sv06-ace", "SV06 ACE", 120),
  sovol("sovol-sv06-plus-ace", "SV06 Plus ACE", 160),

  snapmaker("snapmaker-original", "Snapmaker Original", 60),
  snapmaker("snapmaker-2-a150", "2.0 A150", 80),
  snapmaker("snapmaker-2-a250", "2.0 A250", 100),
  snapmaker("snapmaker-2-a350", "2.0 A350", 140),
  snapmaker("snapmaker-2-a250t", "2.0 A250T", 100),
  snapmaker("snapmaker-2-a350t", "2.0 A350T", 140),
  snapmaker("snapmaker-f250", "F250", 100),
  snapmaker("snapmaker-f350", "F350", 140),
  snapmaker("snapmaker-artisan", "Artisan", 180),
  snapmaker("snapmaker-j1", "J1", 160),
  snapmaker("snapmaker-j1s", "J1S", 160),

  prusa("prusa-i3-mk2s", "Original Prusa i3 MK2/S", 70),
  prusa("prusa-i3-mk3", "Original Prusa i3 MK3", 80, false),
  prusa("prusa-i3-mk3s", "Original Prusa i3 MK3S", 80, false),
  prusa("prusa-i3-mk3s-plus", "Original Prusa i3 MK3S+", 80, false),
  prusa("prusa-mk35", "Original Prusa MK3.5", 90),
  prusa("prusa-mk35s", "Original Prusa MK3.5S", 90),
  prusa("prusa-mk39", "Original Prusa MK3.9", 100),
  prusa("prusa-mk39s", "Original Prusa MK3.9S", 100),
  prusa("prusa-mk4", "Original Prusa MK4", 100),
  prusa("prusa-mk4s", "Original Prusa MK4S", 100),
  prusa("prusa-core-one", "Original Prusa CORE One", 120),
  prusa("prusa-core-one-l", "Original Prusa CORE One L", 160),
  prusa("prusa-mini", "Original Prusa MINI", 60),
  prusa("prusa-mini-plus", "Original Prusa MINI+", 60),
  prusa("prusa-xl-single", "Original Prusa XL, 1 tool", 140),
  prusa("prusa-xl-dual", "Original Prusa XL, 2 tools", 160),
  prusa("prusa-xl-five", "Original Prusa XL, 5 tools", 180),
];

export const PRINTER_MANUFACTURERS: PrinterManufacturer[] = ["Bambu Lab", "Creality", "Sovol", "Snapmaker", "Prusa"];
export const printerPresetById = (id: string | undefined) => PRINTER_PRESETS.find((preset) => preset.id === id);
