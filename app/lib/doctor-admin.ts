import type { DoctorManagerRow } from "./doctor-admin-types.ts";

export function resolveDoctorManagerRows(
  rows: DoctorManagerRow[] | null | undefined,
): DoctorManagerRow[] {
  return rows && rows.length ? rows : [];
}
