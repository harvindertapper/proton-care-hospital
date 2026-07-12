import {
  audit,
  checkRateLimit,
  getClientIp,
  json,
  parseYouTubeId,
  query,
  requireAdmin,
  run,
  verifyCsrf,
} from "@/app/lib/server";
import { departmentBySlug } from "@/app/lib/data";

type AdminSession = { email: string; role: "SUPER_ADMIN" | "STAFF" };

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

async function dashboardData() {
  const [
    appointments,
    timings,
    doctors,
    revisions,
    feedback,
    contacts,
    blogs,
    jobs,
    videos,
    audits,
  ] = await Promise.all([
    query("SELECT * FROM appointments ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM department_timings ORDER BY department_name"),
    query("SELECT * FROM doctor_profiles ORDER BY name"),
    query("SELECT * FROM content_revisions ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM blog_posts ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM career_jobs ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM patient_videos ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 120"),
  ]);

  return {
    appointments: appointments.results || [],
    timings: timings.results || [],
    doctors: doctors.results || [],
    revisions: revisions.results || [],
    feedback: feedback.results || [],
    contacts: contacts.results || [],
    blogs: blogs.results || [],
    jobs: jobs.results || [],
    videos: videos.results || [],
    audits: audits.results || [],
  };
}

async function createRevision(session: AdminSession, action: string, entityType: string, entityId: string, title: string, payload: Record<string, unknown>) {
  const id = crypto.randomUUID();
  await run(
    "INSERT INTO content_revisions (id, entity_type, entity_id, title, payload_json, proposed_by) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    entityType,
    entityId,
    title,
    JSON.stringify({ action, payload }),
    session.email,
  );
  await audit(session.email, "REVISION_CREATED", entityType, entityId, `${title} requires super admin review`);
  return { id, reviewRequired: true };
}

async function applyTiming(payload: Record<string, unknown>, actorEmail: string) {
  const departmentSlug = clean(payload.departmentSlug, 120);
  const department = departmentBySlug(departmentSlug);
  const startTime = clean(payload.startTime, 10);
  const endTime = clean(payload.endTime, 10);
  const days = clean(payload.days, 60) || "Mon-Sat";
  const slotGapMinutes = Number(payload.slotGapMinutes || 15);
  const isVisible = Number(payload.isVisible) === 0 ? 0 : 1;

  if (!department || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || slotGapMinutes < 15) {
    throw new Error("Invalid timing payload.");
  }

  await run(
    `INSERT INTO department_timings
      (id, department_slug, department_name, start_time, end_time, days, slot_gap_minutes, status, is_visible, approved_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(department_slug) DO UPDATE SET
        department_name = excluded.department_name,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        days = excluded.days,
        slot_gap_minutes = excluded.slot_gap_minutes,
        status = 'APPROVED',
        is_visible = excluded.is_visible,
        approved_by = excluded.approved_by,
        updated_at = CURRENT_TIMESTAMP`,
    `timing-${department.slug}`,
    department.slug,
    department.name,
    startTime,
    endTime,
    days,
    slotGapMinutes,
    isVisible,
    actorEmail,
  );
  await audit(actorEmail, "TIMING_APPROVED", "DepartmentTiming", department.slug, `${department.name} ${startTime}-${endTime}`);
}

async function applyDoctor(payload: Record<string, unknown>, actorEmail: string) {
  const name = clean(payload.name, 140);
  const slug = clean(payload.slug, 100) || slugify(name);
  const speciality = clean(payload.speciality, 140);
  const qualification = clean(payload.qualification, 120);
  const departmentSlug = clean(payload.departmentSlug, 120);
  const department = departmentBySlug(departmentSlug);
  const photoUrl = clean(payload.photoUrl, 500);
  const profileNote = clean(payload.profileNote, 1000);
  const isVisible = Number(payload.isVisible) === 0 ? 0 : 1;

  if (!name || !slug || !speciality || !department) throw new Error("Invalid doctor profile payload.");

  await run(
    `INSERT INTO doctor_profiles
      (id, slug, name, speciality, qualification, department_slug, photo_url, profile_note, consent_status, status, is_visible, approved_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED_SOURCE', 'APPROVED', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(slug) DO UPDATE SET
        name = excluded.name,
        speciality = excluded.speciality,
        qualification = excluded.qualification,
        department_slug = excluded.department_slug,
        photo_url = excluded.photo_url,
        profile_note = excluded.profile_note,
        status = 'APPROVED',
        is_visible = excluded.is_visible,
        approved_by = excluded.approved_by,
        updated_at = CURRENT_TIMESTAMP`,
    `doctor-${slug}`,
    slug,
    name,
    speciality,
    qualification,
    department.slug,
    photoUrl,
    profileNote,
    isVisible,
    actorEmail,
  );
  await audit(actorEmail, "DOCTOR_APPROVED", "DoctorProfile", slug, name);
}

async function applyBlog(payload: Record<string, unknown>, actorEmail: string) {
  const title = clean(payload.title, 180);
  const slug = clean(payload.slug, 100) || slugify(title);
  const excerpt = clean(payload.excerpt, 300);
  const body = clean(payload.body, 8000);
  if (!title || !slug || !excerpt || !body) throw new Error("Invalid blog payload.");
  await run(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, source_note)
      VALUES (?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')
      ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, status = 'APPROVED', is_visible = 1`,
    `blog-${slug}`,
    slug,
    title,
    excerpt,
    body,
  );
  await audit(actorEmail, "BLOG_APPROVED", "BlogPost", slug, title);
}

async function applyCareer(payload: Record<string, unknown>, actorEmail: string) {
  const title = clean(payload.title, 180);
  const slug = clean(payload.slug, 100) || slugify(title);
  const department = clean(payload.department, 140);
  const employmentType = clean(payload.employmentType, 80) || "Full-time";
  const description = clean(payload.description, 3000);
  if (!title || !slug || !description) throw new Error("Invalid career payload.");
  await run(
    `INSERT INTO career_jobs (id, slug, title, department, employment_type, description, status, is_visible)
      VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1)
      ON CONFLICT(slug) DO UPDATE SET title = excluded.title, department = excluded.department, employment_type = excluded.employment_type, description = excluded.description, status = 'APPROVED', is_visible = 1`,
    `job-${slug}`,
    slug,
    title,
    department,
    employmentType,
    description,
  );
  await audit(actorEmail, "CAREER_APPROVED", "CareerJob", slug, title);
}

async function applyVideo(payload: Record<string, unknown>, actorEmail: string) {
  const title = clean(payload.title, 180);
  const youtubeUrl = clean(payload.youtubeUrl, 500);
  const consentNote = clean(payload.consentNote, 1000);
  const youtubeId = parseYouTubeId(youtubeUrl);
  if (!title || !youtubeUrl || !youtubeId || consentNote.length < 5) throw new Error("Valid YouTube URL and consent note are required.");
  const id = `video-${youtubeId}`;
  await run(
    `INSERT INTO patient_videos (id, title, youtube_url, youtube_id, consent_note, status, is_visible)
      VALUES (?, ?, ?, ?, ?, 'APPROVED', 1)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, youtube_url = excluded.youtube_url, youtube_id = excluded.youtube_id, consent_note = excluded.consent_note, status = 'APPROVED', is_visible = 1`,
    id,
    title,
    youtubeUrl,
    youtubeId,
    consentNote,
  );
  await audit(actorEmail, "VIDEO_APPROVED", "PatientVideo", id, title);
}

async function applyFeedbackVisibility(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 120);
  const isVisible = Number(payload.isVisible) === 1 ? 1 : 0;
  if (!id) throw new Error("Feedback id is required.");
  await run("UPDATE feedback SET status = ?, is_visible = ? WHERE id = ?", isVisible ? "APPROVED" : "NEEDS_REVIEW", isVisible, id);
  await audit(actorEmail, "FEEDBACK_VISIBILITY", "Feedback", id, `visible=${isVisible}`);
}

async function applyBlogVisibility(payload: Record<string, unknown>, actorEmail: string) {
  const slug = clean(payload.slug, 120);
  const isVisible = Number(payload.isVisible) === 1 ? 1 : 0;
  if (!slug) throw new Error("Blog slug is required.");
  await run("UPDATE blog_posts SET is_visible = ?, status = ? WHERE slug = ?", isVisible, isVisible ? "APPROVED" : "HIDDEN", slug);
  await audit(actorEmail, "BLOG_VISIBILITY", "BlogPost", slug, `visible=${isVisible}`);
}

async function applyAppointmentStatus(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 120);
  const status = clean(payload.status, 40).toUpperCase();
  const notes = clean(payload.internalNotes, 1000);
  if (!id || !["NEW", "CONTACTED", "CONFIRMED", "CANCELLED", "CLOSED"].includes(status)) throw new Error("Invalid appointment status.");
  await run("UPDATE appointments SET status = ?, internal_notes = COALESCE(NULLIF(?, ''), internal_notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?", status, notes, id);
  await audit(actorEmail, "APPOINTMENT_STATUS", "Appointment", id, status);
}

async function applyAction(action: string, payload: Record<string, unknown>, actorEmail: string) {
  if (action === "timing.upsert") return applyTiming(payload, actorEmail);
  if (action === "doctor.save") return applyDoctor(payload, actorEmail);
  if (action === "blog.save") return applyBlog(payload, actorEmail);
  if (action === "career.save") return applyCareer(payload, actorEmail);
  if (action === "video.save") return applyVideo(payload, actorEmail);
  if (action === "feedback.visibility") return applyFeedbackVisibility(payload, actorEmail);
  if (action === "blog.visibility") return applyBlogVisibility(payload, actorEmail);
  if (action === "appointment.status") return applyAppointmentStatus(payload, actorEmail);
  throw new Error("Unknown admin action.");
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return json({ error: admin.error }, { status: admin.status });
  return json({ success: true, data: await dashboardData() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return json({ error: admin.error }, { status: admin.status });
  if (!verifyCsrf(request, admin.session)) return json({ error: "Invalid CSRF token." }, { status: 403 });

  const ip = getClientIp(request);
  const limit = await checkRateLimit("admin-mutation", `${admin.session.email}:${ip}`, 80, 15 * 60);
  if (!limit.ok) return json({ error: "Too many admin actions. Please wait and try again." }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { action?: string; payload?: Record<string, unknown>; [key: string]: unknown };
  const action = clean(body.action, 80);
  const payload = (body.payload || body) as Record<string, unknown>;

  try {
    if (action === "revision.review") {
      const superAdmin = await requireAdmin("SUPER_ADMIN");
      if (!superAdmin.ok) return json({ error: superAdmin.error }, { status: superAdmin.status });
      const revisionId = clean(body.revisionId, 120);
      const decision = clean(body.decision, 20).toUpperCase();
      const rows = await query<{ id: string; payload_json: string; entity_type: string; entity_id: string }>(
        "SELECT id, payload_json, entity_type, entity_id FROM content_revisions WHERE id = ? AND status = 'NEEDS_REVIEW' LIMIT 1",
        revisionId,
      );
      const revision = rows.results?.[0];
      if (!revision || !["APPROVED", "REJECTED"].includes(decision)) {
        return json({ error: "Invalid revision decision." }, { status: 400 });
      }
      if (decision === "APPROVED") {
        const parsed = JSON.parse(revision.payload_json) as { action: string; payload: Record<string, unknown> };
        await applyAction(parsed.action, parsed.payload, admin.session.email);
      }
      await run(
        "UPDATE content_revisions SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        decision,
        admin.session.email,
        clean(body.reviewNote, 400),
        revisionId,
      );
      await audit(admin.session.email, `REVISION_${decision}`, revision.entity_type, revision.entity_id);
      return json({ success: true });
    }

    if (action === "appointment.status") {
      await applyAppointmentStatus(payload, admin.session.email);
      return json({ success: true });
    }

    if (admin.session.role === "STAFF") {
      const title =
        clean(payload.title, 180) ||
        clean(payload.name, 180) ||
        clean(payload.departmentSlug, 180) ||
        clean(payload.id, 180) ||
        action;
      const entityType = action.split(".")[0] || "content";
      const entityId = clean(payload.slug, 120) || clean(payload.departmentSlug, 120) || clean(payload.id, 120) || crypto.randomUUID();
      return json({ success: true, revision: await createRevision(admin.session, action, entityType, entityId, title, payload) });
    }

    await applyAction(action, payload, admin.session.email);
    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Admin action failed." }, { status: 400 });
  }
}
