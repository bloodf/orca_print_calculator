// Friendly names for the settings a bad file can reset (the one-time notice). Keys without a field label show as written.
import { t } from "../i18n";

const LABEL: Record<string, string> = {
  energyPerKwh: "field.energy", failureBp: "field.failure", failureMode: "field.failureMode", failureIncludesMachine: "field.failureMachine",
  depreciationEnabled: "field.depreciation", maintenancePerHourMinor: "field.maintenance", fixedPerPrintHourMinor: "field.fixedPerHour",
  laborPerHourMinor: "field.laborRate", laborMinutes: "field.laborMinutes", setupMinutes: "field.setupMinutes", targetMarginBp: "field.margin",
  pretty: "field.pretty", minOrderMinor: "field.minOrder", shipping: "section.shipping", discountTiers: "batch.title",
  language: "header.language", currency: "currency.label",
};
export const settingLabel = (key: string): string => (LABEL[key] ? t(LABEL[key]!) : key);
