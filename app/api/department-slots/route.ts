import { departmentBySlug, generateSlots } from "@/app/lib/data";
import { json, query } from "@/app/lib/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const departmentSlug = searchParams.get("departmentSlug") || "";
  const date = searchParams.get("date") || "";
  const department = departmentBySlug(departmentSlug);

  if (!department) {
    return json({ error: "Department not found." }, { status: 404 });
  }

  if (date) {
    try {
      const closures = await query<{ reason: string }>(
        "SELECT reason FROM department_closures WHERE department_slug = ? AND closed_date = ? LIMIT 1",
        department.slug,
        date
      );
      if (closures.results?.length) {
        const closure = closures.results[0];
        return json({
          error: `Department is closed on this date${closure.reason ? `: ${closure.reason}` : ""}.`,
          slots: [],
        });
      }

      const docs = await query<{ name: string; blocked_dates: string }>(
        "SELECT name, blocked_dates FROM doctor_profiles WHERE department_slug = ? AND is_visible = 1 AND status = 'APPROVED'",
        department.slug
      );
      if (docs.results?.length) {
        const allBlocked = docs.results.every((doc) => {
          const leaves = (doc.blocked_dates || "").split(",").map((d) => d.trim());
          return leaves.includes(date);
        });
        if (allBlocked) {
          return json({
            error: "All doctors in this department are on leave on this date.",
            slots: [],
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch slots checks:", err);
    }
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
