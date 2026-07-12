import { departmentBySlug, generateSlots } from "@/app/lib/data";
import { json, query } from "@/app/lib/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const departmentSlug = searchParams.get("departmentSlug") || "";
  const department = departmentBySlug(departmentSlug);

  if (!department) {
    return json({ error: "Department not found." }, { status: 404 });
  }

  try {
    const rows = await query<{ start_time: string; end_time: string; days: string; slot_gap_minutes: number }>(
      "SELECT start_time, end_time, days, slot_gap_minutes FROM department_timings WHERE department_slug = ? AND status = 'APPROVED' AND is_visible = 1 LIMIT 1",
      department.slug,
    );
    const timing = rows.results?.[0];
    if (timing) {
      return json({
        departmentName: department.name,
        timing,
        slots: generateSlots(timing.start_time, timing.end_time, timing.slot_gap_minutes || 15),
      });
    }
  } catch {
    // Fall through to source data when D1 is unavailable during preview/build.
  }

  if (!department.timing) {
    return json({ departmentName: department.name, slots: [], error: "Please call the hospital desk to confirm timing for this department." });
  }

  return json({
    departmentName: department.name,
    timing: {
      startTime: department.timing.start,
      endTime: department.timing.end,
      days: department.timing.days,
      slotGapMinutes: 15,
    },
    slots: generateSlots(department.timing.start, department.timing.end, 15),
  });
}
