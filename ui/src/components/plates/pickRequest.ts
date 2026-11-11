// "Pick spool" from a price flag: ask the plate card to open its material rows and that row to open its picker.
import { reactive } from "vue";

export const pickRequest = reactive({ plate: -1, slot: -1, seq: 0 });
export function requestPick(plate: number, slot: number): void {
  pickRequest.plate = plate;
  pickRequest.slot = slot;
  pickRequest.seq += 1;
}
/** True once, for the row the request names. */
export function takePick(plate: number, slot: number): boolean {
  if (pickRequest.plate !== plate || pickRequest.slot !== slot) return false;
  pickRequest.plate = -1;
  pickRequest.slot = -1;
  return true;
}
