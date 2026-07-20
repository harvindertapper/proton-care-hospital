import {
  audit,
  checkRateLimit,
  getClientIp,
  json,
  parseYouTubeId,
  MutationNotFoundError,
  query,
  requireAdmin,
  requireAppliedMutation,
  run,
  verifyCsrf,
  hashPassword,
  nextRequestId,
} from "@/app/lib/server";
import { executeRoleMutation } from "@/app/lib/mutation-result";
import {
  archiveDoctor,
  restoreDoctor,
  type DoctorRepo,
} from "@/app/lib/doctor-admin";
import { departmentBySlug } from "@/app/lib/data";
import { validateStaffAccountInput } from "@/app/lib/adminAuth";
import { sendEmail, getStaffOnboardingTemplate } from "@/app/lib/resend";
import { clean, slugify } from "@/app/lib/utils";

type AdminSession = { email: string; role: "SUPER_ADMIN" | "STAFF" };

async function dashboardData(session: AdminSession) {
  const [
    appointments,
    timings,
    doctors,
    archivedDoctors,
    revisions,
    feedback,
    contacts,
    blogs,
    jobs,
    videos,
    media,
    audits,
    sessionsData,
    closures,
  ] = await Promise.all([
    query<Record<string, unknown>>("SELECT * FROM appointments ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM department_timings ORDER BY department_name"),
    query("SELECT * FROM doctor_profiles WHERE is_deleted = 0 ORDER BY name"),
    query("SELECT id, slug, name, speciality, department_slug, is_deleted FROM doctor_profiles WHERE is_deleted = 1 ORDER BY name"),
    query("SELECT * FROM content_revisions ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM blog_posts WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM career_jobs WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM patient_videos WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM media_assets ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 120"),
    query(
      "SELECT id, created_at, expires_at FROM sessions WHERE lower(email) = lower(?) AND revoked = 0 AND expires_at > ?",
      session.email,
      Date.now(),
    ),
    query("SELECT * FROM department_closures ORDER BY closed_date DESC LIMIT 200"),
  ]);

  let rawAppointments = appointments.results || [];
  if (session.role !== "SUPER_ADMIN") {
    const sensitiveSlugs = new Set(["psychiatry", "obstetrics-and-gynecology", "emergency-triage", "emergency-medicine"]);
    rawAppointments = rawAppointments.map((app) => ({
      ...app,
      concern:
        typeof app.department_slug === "string" && sensitiveSlugs.has(app.department_slug)
          ? "[REDACTED - SENSITIVE DEPT]"
          : app.concern,
    }));
  }

  let staffList: Record<string, unknown>[] = [];
  if (session.role === "SUPER_ADMIN") {
    const staffResult = await query(
      `SELECT id, email, name, role, is_active, must_change_password,
              CASE is_active WHEN 1 THEN 'Active' ELSE 'Inactive' END AS status,
              CASE must_change_password WHEN 1 THEN 'Password change required' ELSE 'Password set' END AS password_status,
              created_at
       FROM admin_users WHERE role = 'STAFF' ORDER BY name`,
    );
    staffList = staffResult.results || [];
  }

  return {
    appointments: rawAppointments,
    timings: timings.results || [],
    doctors: doctors.results || [],
    archivedDoctors: archivedDoctors.results || [],
    revisions: revisions.results || [],
    feedback: feedback.results || [],
    contacts: contacts.results || [],
    blogs: blogs.results || [],
    jobs: jobs.results || [],
    videos: videos.results || [],
    media: media.results || [],
    audits: audits.results || [],
    sessions: sessionsData.results || [],
    staff: staffList,
    closures: closures.results || [],
  };
}

async function createRevision(session: AdminSession, action: string, entityType: string, entityId: string, title: string, payload: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const result = await run(
    "INSERT INTO content_revisions (id, entity_type, entity_id, title, payload_json, proposed_by) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    entityType,
    entityId,
    title,
    JSON.stringify({ action, payload }),
    session.email,
  );
  requireAppliedMutation(result, true, "Content revision");
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
  const blockedDates = clean(payload.blockedDates, 2000);

  if (!name || !slug || !speciality || !department) throw new Error("Invalid doctor profile payload.");

  const existing = await query("SELECT id, is_deleted FROM doctor_profiles WHERE slug = ? LIMIT 1", slug);
  if (existing.results?.length && Number(existing.results[0].is_deleted) === 1) {
    throw new Error("Doctor profile is archived. Restore it before editing.");
  }
  const result = await run(
    `INSERT INTO doctor_profiles
      (id, slug, name, speciality, qualification, department_slug, photo_url, profile_note, consent_status, status, is_visible, approved_by, blocked_dates, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED_SOURCE', 'APPROVED', ?, ?, ?, CURRENT_TIMESTAMP)
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
        blocked_dates = excluded.blocked_dates,
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
    blockedDates,
  );
  requireAppliedMutation(result, Boolean(existing.results?.length) || Number(result.meta?.changes || 0) > 0, "Doctor profile");
  await audit(actorEmail, "DOCTOR_APPROVED", "DoctorProfile", slug, name);
  return { outcome: "APPLIED" as const };
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

async function applyFeedbackVisibility(
  payload: Record<string, unknown>,
  actorEmail: string,
) {
  const id = clean(payload.id, 120);
  const isVisible = Number(payload.isVisible) === 1 ? 1 : 0;

  if (!id) {
    throw new Error("Feedback id is required.");
  }

  const rows = await query<{
    public_consent: number;
  }>(
    "SELECT public_consent FROM feedback WHERE id = ? LIMIT 1",
    id,
  );

  const feedback = rows.results?.[0];

  if (!feedback) {
    throw new Error("Feedback was not found.");
  }

  if (
    isVisible === 1 &&
    Number(feedback.public_consent) !== 1
  ) {
    throw new Error(
      "This feedback cannot be published because explicit publication consent was not provided.",
    );
  }

  const result = await run(
    "UPDATE feedback SET status = ?, is_visible = ? WHERE id = ?",
    isVisible ? "APPROVED" : "NEEDS_REVIEW",
    isVisible,
    id,
  );
  requireAppliedMutation(result, true, "Feedback");

  await audit(
    actorEmail,
    "FEEDBACK_VISIBILITY",
    "Feedback",
    id,
    `visible=${isVisible}; publicConsent=${Number(
      feedback.public_consent,
    )}`,
  );
  return { outcome: "APPLIED" as const };
}

async function applyBlogVisibility(payload: Record<string, unknown>, actorEmail: string) {
  const slug = clean(payload.slug, 120);
  const isVisible = Number(payload.isVisible) === 1 ? 1 : 0;
  if (!slug) throw new Error("Blog slug is required.");
  const existing = await query("SELECT id FROM blog_posts WHERE slug = ? AND is_deleted = 0 LIMIT 1", slug);
  const result = await run("UPDATE blog_posts SET is_visible = ?, status = ? WHERE slug = ? AND is_deleted = 0", isVisible, isVisible ? "APPROVED" : "HIDDEN", slug);
  requireAppliedMutation(result, Boolean(existing.results?.length), "Blog post");
  await audit(actorEmail, "BLOG_VISIBILITY", "BlogPost", slug, `visible=${isVisible}`);
  return { outcome: "APPLIED" as const };
}

async function applyCareerVisibility(payload: Record<string, unknown>, actorEmail: string) {
  const slug = clean(payload.slug, 120);
  const isVisible = Number(payload.isVisible) === 1 ? 1 : 0;
  if (!slug) throw new Error("Career slug is required.");
  const existing = await query("SELECT id FROM career_jobs WHERE slug = ? AND is_deleted = 0 LIMIT 1", slug);
  const result = await run("UPDATE career_jobs SET is_visible = ?, status = ? WHERE slug = ? AND is_deleted = 0", isVisible, isVisible ? "APPROVED" : "HIDDEN", slug);
  requireAppliedMutation(result, Boolean(existing.results?.length), "Career job");
  await audit(actorEmail, "CAREER_VISIBILITY", "CareerJob", slug, `visible=${isVisible}`);
  return { outcome: "APPLIED" as const };
}

async function applyVideoVisibility(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 120);
  const isVisible = Number(payload.isVisible) === 1 ? 1 : 0;
  if (!id) throw new Error("Video id is required.");
  const existing = await query("SELECT id FROM patient_videos WHERE id = ? AND is_deleted = 0 LIMIT 1", id);
  const result = await run("UPDATE patient_videos SET is_visible = ?, status = ? WHERE id = ? AND is_deleted = 0", isVisible, isVisible ? "APPROVED" : "HIDDEN", id);
  requireAppliedMutation(result, Boolean(existing.results?.length), "Patient video");
  await audit(actorEmail, "VIDEO_VISIBILITY", "PatientVideo", id, `visible=${isVisible}`);
  return { outcome: "APPLIED" as const };
}

async function applyContactStatus(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 120);
  const status = clean(payload.status, 40).toUpperCase();
  if (!id || !["NEW", "CONTACTED", "CLOSED"].includes(status)) throw new Error("Invalid contact status.");
  await run("UPDATE contact_messages SET status = ? WHERE id = ?", status, id);
  await audit(actorEmail, "CONTACT_STATUS", "ContactMessage", id, status);
}

async function applyAppointmentStatus(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 120);
  const statusInput = clean(payload.status, 40).toUpperCase();
  const notes = clean(payload.internalNotes, 1000);
  const requestedDate = clean(payload.requestedDate, 20);
  const requestedTime = clean(payload.requestedTime, 20);

  // Map legacy status strings to canonical DB values
  let status = statusInput;
  if (status === "APPROVED") status = "CONFIRMED";
  if (status === "REJECTED") status = "CANCELLED";
  if (status === "COMPLETED") status = "CLOSED";
  if (status === "PENDING") status = "NEW";

  if (!id || !["NEW", "CONTACTED", "CONFIRMED", "CANCELLED", "CLOSED"].includes(status)) throw new Error("Invalid appointment status.");

  // Fetch current details to check if rescheduling occurred
  const current = await query<{ requested_date: string; requested_time: string; schedule_version: number }>(
    "SELECT requested_date, requested_time, schedule_version FROM appointments WHERE id = ? LIMIT 1",
    id
  );
  const currentApp = current.results?.[0];

  if (!currentApp) throw new MutationNotFoundError("Appointment");
  let newDate = currentApp?.requested_date || "";
  let newTime = currentApp?.requested_time || "";
  let scheduleVersion = currentApp?.schedule_version || 1;

  let rescheduled = false;
  if (requestedDate && requestedDate !== currentApp?.requested_date) {
    newDate = requestedDate;
    rescheduled = true;
  }
  if (requestedTime && requestedTime !== currentApp?.requested_time) {
    newTime = requestedTime;
    rescheduled = true;
  }

  if (rescheduled) {
    scheduleVersion += 1;
  }
  const result = await run(
    "UPDATE appointments SET status = ?, internal_notes = COALESCE(NULLIF(?, ''), internal_notes), requested_date = ?, requested_time = ?, schedule_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    status,
    notes,
    newDate,
    newTime,
    scheduleVersion,
    id
  );
  requireAppliedMutation(result, true, "Appointment");
  await audit(actorEmail, "APPOINTMENT_STATUS", "Appointment", id, `${status}; rescheduled=${rescheduled}; version=${scheduleVersion}`);

  // Mock Resend Email dispatch logic
  if (rescheduled) {
    console.log(`[RESEND EMAIL DISPATCH] Rescheduling notification sent for appointment ${id}. Version ${scheduleVersion}. New slot: ${newDate} at ${newTime}`);
  }
  return { outcome: "APPLIED" as const };
}

async function applyAction(action: string, payload: Record<string, unknown>, actorEmail: string) {
  if (action === "timing.upsert") return applyTiming(payload, actorEmail);
  if (action === "doctor.save") return applyDoctor(payload, actorEmail);
  if (action === "blog.save") return applyBlog(payload, actorEmail);
  if (action === "career.save") return applyCareer(payload, actorEmail);
  if (action === "video.save") return applyVideo(payload, actorEmail);
  if (action === "feedback.visibility") return applyFeedbackVisibility(payload, actorEmail);
  if (action === "blog.visibility") return applyBlogVisibility(payload, actorEmail);
  if (action === "career.visibility") return applyCareerVisibility(payload, actorEmail);
  if (action === "video.visibility") return applyVideoVisibility(payload, actorEmail);
  if (action === "contact.status") return applyContactStatus(payload, actorEmail);
  if (action === "appointment.status") return applyAppointmentStatus(payload, actorEmail);
  if (action === "appointment.create") return applyCreateAppointment(payload, actorEmail);
  if (action === "closure.add") return applyAddClosure(payload, actorEmail);
  if (action === "closure.delete") return applyDeleteClosure(payload, actorEmail);
  if (action === "doctor.delete") return applyDeleteDoctor(payload, actorEmail);
  if (action === "doctor.restore") return applyRestoreDoctor(payload, actorEmail);
  if (action === "blog.delete") return applyDeleteBlog(payload, actorEmail);
  if (action === "career.delete") return applyDeleteCareer(payload, actorEmail);
  if (action === "video.delete") return applyDeleteVideo(payload, actorEmail);
  throw new Error(`Unsupported admin action: ${action}`);
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return json({ error: admin.error, ...(admin.code ? { code: admin.code } : {}) }, { status: admin.status });
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    if (action === "REFRESH") {
      return json({ success: true, data: await dashboardData(admin.session) });
    }
    return json({ success: true, data: await dashboardData(admin.session) });
  } catch (error) {
    console.error("Dashboard GET data error:", error);
    return json({ error: "Failed to load dashboard data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return json({ error: admin.error, ...(admin.code ? { code: admin.code } : {}) }, { status: admin.status });
  if (!verifyCsrf(request, admin.session)) return json({ error: "Invalid CSRF token." }, { status: 403 });

  const ip = getClientIp(request);
  const limit = await checkRateLimit("admin-mutation", `${admin.session.email}:${ip}`, 80, 15 * 60);
  if (!limit.ok) return json({ error: "Too many admin actions. Please wait and try again." }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { action?: string; payload?: Record<string, unknown>; revisionId?: string; decision?: string; reviewNote?: string; modifiedPayload?: Record<string, unknown>; [key: string]: unknown };
  const action = clean(body.action, 80);
  const payload = (body.payload || body) as Record<string, unknown>;

  try {
    if (action === "revision.review") {
      const superAdmin = await requireAdmin({ role: "SUPER_ADMIN" });
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
        const finalPayload = body.modifiedPayload ? body.modifiedPayload : parsed.payload;

        const valResult = validatePayload(parsed.action, finalPayload);
        if (!valResult.ok) {
          return json({ error: valResult.error || "Invalid payload structure." }, { status: 400 });
        }

        await applyAction(parsed.action, finalPayload, admin.session.email);

        if (body.modifiedPayload) {
          await run(
            "UPDATE content_revisions SET payload_json = ? WHERE id = ?",
            JSON.stringify({ action: parsed.action, payload: finalPayload }),
            revisionId
          );
        }
      }
      const reviewResult = await run(
        "UPDATE content_revisions SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'NEEDS_REVIEW'",
        decision,
        admin.session.email,
        clean(body.reviewNote, 400),
        revisionId,
      );
      requireAppliedMutation(reviewResult, true, "Content revision");
      await audit(admin.session.email, `REVISION_${decision}`, revision.entity_type, revision.entity_id);
      return json({ success: true, outcome: "APPLIED" });
    }

    if (action === "appointment.status") {
      const result = await applyAppointmentStatus(payload, admin.session.email);
      return json({ success: true, ...result });
    }

    if (action === "REVOKE_SESSION") {
      const id = clean(payload.id, 200);
      if (!id) throw new Error("Session ID required");
      await run("UPDATE sessions SET revoked = 1 WHERE id = ? AND email = ?", id, admin.session.email);
      await audit(admin.session.email, "SESSION_REVOKED", "Admin", admin.session.email, "Revoked specific session");
      return json({ success: true });
    }

    if (action === "REVOKE_ALL_SESSIONS") {
      const currentSessionId = admin.session.sessionId;
      if (!currentSessionId) throw new Error("Could not identify current session ID");
      await run("UPDATE sessions SET revoked = 1 WHERE email = ? AND id != ?", admin.session.email, currentSessionId);
      await audit(admin.session.email, "ALL_SESSIONS_REVOKED", "Admin", admin.session.email, "Revoked all other sessions");
      return json({ success: true });
    }

    if (action === "staff.add") {
      const superAdmin = await requireAdmin({ role: "SUPER_ADMIN" });
      if (!superAdmin.ok) return json({ error: superAdmin.error }, { status: superAdmin.status });

      const validation = validateStaffAccountInput(payload);
      if (!validation.ok) throw new Error(validation.error);
      const staff = validation.account;

      const existing = await query("SELECT id FROM admin_users WHERE lower(email) = lower(?) LIMIT 1", staff.email);
      if (existing.results?.length) {
        throw new Error("A staff member with this email already exists.");
      }

      const pHash = await hashPassword(staff.password);
      await run(
        `INSERT INTO admin_users
          (id, email, name, role, password_hash, is_active, must_change_password)
         VALUES (?, ?, ?, 'STAFF', ?, 1, 1)`,
        crypto.randomUUID(),
        staff.email,
        staff.name,
        pHash,
      );

      // Send onboarding credentials email to the new staff member
      await sendEmail({
        to: staff.email,
        subject: "Welcome to Protone Care Hospital - Your Staff Account Details",
        html: getStaffOnboardingTemplate(staff.name, staff.email, staff.password),
      });

      await audit(admin.session.email, "STAFF_CREATED", "AdminUser", staff.email, "Created active staff account requiring password change and sent onboarding email");
      return json({ success: true });
    }

    if (action === "staff.setActive") {
      const superAdmin = await requireAdmin({ role: "SUPER_ADMIN" });
      if (!superAdmin.ok) return json({ error: superAdmin.error }, { status: superAdmin.status });

      const staffId = clean(payload.id, 120);
      const active = payload.active;
      if (!staffId) throw new Error("Staff ID required.");
      if (typeof active !== "boolean") throw new Error("Active state is required.");

      const rows = await query<{ email: string; role: string; is_active: number }>(
        "SELECT email, role, is_active FROM admin_users WHERE id = ? LIMIT 1",
        staffId,
      );
      const staff = rows.results?.[0];
      if (!staff) throw new Error("Staff member not found.");
      if (staff.role !== "STAFF") throw new Error("Only staff accounts can be activated or deactivated.");
      if ((staff.is_active === 1) === active) return json({ success: true });

      await run(
        "UPDATE admin_users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'STAFF'",
        active ? 1 : 0,
        staffId,
      );
      if (!active) {
        await run("UPDATE sessions SET revoked = 1 WHERE lower(email) = lower(?)", staff.email);
      }
      await audit(
        admin.session.email,
        active ? "STAFF_REACTIVATED" : "STAFF_DEACTIVATED",
        "AdminUser",
        staff.email,
        active ? "Reactivated staff account" : "Deactivated staff account and revoked sessions",
      );
      return json({ success: true });
    }

    if (action === "staff.resetPassword") {
      const superAdmin = await requireAdmin({ role: "SUPER_ADMIN" });
      if (!superAdmin.ok) return json({ error: superAdmin.error }, { status: superAdmin.status });

      const staffId = clean(payload.id, 120);
      const newPassword = clean(payload.newPassword, 120);
      if (!staffId || !newPassword) throw new Error("Staff ID and new temporary password are required.");

      const pHash = await hashPassword(newPassword);
      await run(
        "UPDATE admin_users SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'STAFF'",
        pHash,
        staffId
      );
      await audit(admin.session.email, "STAFF_PASSWORD_RESET", "AdminUser", staffId, "Reset staff password to temporary password");
      return json({ success: true });
    }

    if (action === "account.changeEmail") {
      const otpInput = clean(payload.otp, 6);
      if (!otpInput) {
        throw new Error("Verification code is required.");
      }

      const otpRes = await query<{
        id: string;
        otp_hash: string;
        meta_json: string;
        attempts: number;
        expires_at: number;
      }>(
        `SELECT id, otp_hash, meta_json, attempts, expires_at 
         FROM admin_email_otps 
         WHERE lower(email) = lower(?) AND purpose = 'change_email'
         ORDER BY created_at DESC LIMIT 1`,
        admin.session.email
      );
      const challenge = otpRes.results?.[0];

      if (!challenge) {
        throw new Error("No active verification code request found. Please request a new code.");
      }

      const now = Math.floor(Date.now() / 1000);
      if (challenge.expires_at < now) {
        await run("DELETE FROM admin_email_otps WHERE id = ?", challenge.id);
        throw new Error("Verification code has expired. Please request a new one.");
      }

      if (challenge.attempts >= 3) {
        await run("DELETE FROM admin_email_otps WHERE id = ?", challenge.id);
        throw new Error("Too many incorrect attempts. Please request a new code.");
      }

      const msgBuffer = new TextEncoder().encode(otpInput);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      const inputHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (inputHash !== challenge.otp_hash) {
        await run("UPDATE admin_email_otps SET attempts = attempts + 1 WHERE id = ?", challenge.id);
        throw new Error("Invalid verification code.");
      }

      const meta = JSON.parse(challenge.meta_json || "{}") as { newEmail?: string };
      const newEmail = (meta.newEmail || "").trim().toLowerCase();

      if (!newEmail) {
        throw new Error("Target email address not found in verification challenge.");
      }

      const checkEmail = await query("SELECT id FROM admin_users WHERE lower(email) = lower(?) LIMIT 1", newEmail);
      if (checkEmail.results?.length) {
        throw new Error("Email address is already in use by another account.");
      }

      await run(
        "UPDATE admin_users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE lower(email) = lower(?)",
        newEmail,
        admin.session.email,
      );

      await run("UPDATE sessions SET revoked = 1 WHERE lower(email) = lower(?)", admin.session.email);
      await run("DELETE FROM admin_email_otps WHERE id = ?", challenge.id);

      await audit(
        admin.session.email,
        "ADMIN_EMAIL_CHANGED",
        "AdminUser",
        admin.session.email,
        `Email updated to ${newEmail}. All sessions revoked.`,
      );
      return json({ success: true, loginRequired: true });
    }

    const title =
      clean(payload.title, 180) ||
      clean(payload.name, 180) ||
      clean(payload.departmentSlug, 180) ||
      clean(payload.id, 180) ||
      action;
    const entityType = action.split(".")[0] || "content";
    const entityId = clean(payload.slug, 120) || clean(payload.departmentSlug, 120) || clean(payload.id, 120) || crypto.randomUUID();
    const result = await executeRoleMutation({
      isStaff: admin.session.role === "STAFF",
      createRevision: () => createRevision(admin.session, action, entityType, entityId, title, payload),
      applyMutation: () => applyAction(action, payload, admin.session.email),
    });
    return json({ success: true, ...result });
  } catch (error) {
    console.error("Admin action failed:", error);
    const msg = error instanceof Error ? error.message : "Admin action failed.";
    const isInternal = msg.includes("D1") || msg.includes("SQLITE") || msg.includes("prepare") || msg.includes("bind");
    if (error instanceof MutationNotFoundError) {
      return json({ success: false, outcome: "NOT_FOUND", error: msg }, { status: 404 });
    }
    return json(
      {
        success: false,
        outcome: "FAILED",
        error: isInternal ? "An internal database error occurred." : msg,
      },
      { status: isInternal ? 500 : 400 },
    );
  }
}

function validatePayload(action: string, payload: unknown): { ok: boolean; error?: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Payload must be a valid JSON object." };
  }
  const obj = payload as Record<string, unknown>;

  if (action === "doctor.save") {
    if (typeof obj.name !== "string" || !obj.name.trim()) return { ok: false, error: "Doctor name is required." };
    if (typeof obj.speciality !== "string" || !obj.speciality.trim()) return { ok: false, error: "Speciality is required." };
    if (typeof obj.departmentSlug !== "string" || !obj.departmentSlug.trim()) return { ok: false, error: "Department slug is required." };
    if (typeof obj.slug !== "string" || !obj.slug.trim()) return { ok: false, error: "Doctor slug is required." };
  } else if (action === "timing.upsert") {
    if (typeof obj.departmentSlug !== "string" || !obj.departmentSlug.trim()) return { ok: false, error: "Department slug is required." };
    if (typeof obj.startTime !== "string" || !obj.startTime.trim()) return { ok: false, error: "Start time is required." };
    if (typeof obj.endTime !== "string" || !obj.endTime.trim()) return { ok: false, error: "End time is required." };
    if (typeof obj.days !== "string" || !obj.days.trim()) return { ok: false, error: "Days parameter is required." };
  } else if (action === "blog.save") {
    if (typeof obj.title !== "string" || !obj.title.trim()) return { ok: false, error: "Blog title is required." };
    if (typeof obj.body !== "string" || !obj.body.trim()) return { ok: false, error: "Blog body is required." };
    if (typeof obj.slug !== "string" || !obj.slug.trim()) return { ok: false, error: "Blog slug is required." };
  } else if (action === "career.save") {
    if (typeof obj.title !== "string" || !obj.title.trim()) return { ok: false, error: "Job title is required." };
    if (typeof obj.description !== "string" || !obj.description.trim()) return { ok: false, error: "Job description is required." };
    if (typeof obj.slug !== "string" || !obj.slug.trim()) return { ok: false, error: "Job slug is required." };
  } else if (action === "video.save") {
    if (typeof obj.title !== "string" || !obj.title.trim()) return { ok: false, error: "Video title is required." };
    if (typeof obj.youtubeUrl !== "string" || !obj.youtubeUrl.trim()) return { ok: false, error: "YouTube URL is required." };
  } else if (action === "doctor.restore") {
    if (typeof obj.slug !== "string" || !obj.slug.trim()) return { ok: false, error: "Doctor slug is required." };
  }
  return { ok: true };
}

async function applyCreateAppointment(payload: Record<string, unknown>, actorEmail: string) {
  const patientName = clean(payload.patientName, 120);
  const phone = clean(payload.phone, 20);
  const email = clean(payload.email, 160).toLowerCase();
  const departmentSlug = clean(payload.departmentSlug, 120);
  const requestedDate = clean(payload.requestedDate, 20);
  const requestedTime = clean(payload.requestedTime, 20);
  const concern = clean(payload.concern, 1200) || "Walk-in appointment registration by staff.";
  const status = clean(payload.status, 40) || "CONFIRMED";

  if (!patientName || !phone || !departmentSlug || !requestedDate || !requestedTime) {
    throw new Error("Missing required appointment registration fields.");
  }

  const department = departmentBySlug(departmentSlug);
  if (!department) throw new Error("Selected department not found.");

  const id = crypto.randomUUID();
  const requestId = await nextRequestId();

  await run(
    `INSERT INTO appointments
      (id, request_id, patient_name, phone, email, department_slug, department_name, requested_date, requested_time, concern, consent, otp_verified, status, ip_address, user_agent, schedule_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 'admin-panel', 'admin-console', 1)`,
    id,
    requestId,
    patientName,
    phone,
    email,
    department.slug,
    department.name,
    requestedDate,
    requestedTime,
    concern,
    status
  );

  await audit(actorEmail, "APPOINTMENT_CREATED", "Appointment", id, `Walk-in ${requestId} ${status}`);
}

async function applyAddClosure(payload: Record<string, unknown>, actorEmail: string) {
  const departmentSlug = clean(payload.departmentSlug, 120);
  const closedDate = clean(payload.closedDate, 20);
  const reason = clean(payload.reason, 300);

  if (!departmentSlug || !closedDate) {
    throw new Error("Department slug and closed date are required.");
  }

  const department = departmentBySlug(departmentSlug);
  if (!department) throw new Error("Department not found.");

  const id = crypto.randomUUID();
  await run(
    "INSERT INTO department_closures (id, department_slug, closed_date, reason) VALUES (?, ?, ?, ?)",
    id,
    department.slug,
    closedDate,
    reason
  );
  await audit(actorEmail, "CLOSURE_ADDED", "DepartmentClosure", id, `${department.slug} on ${closedDate}`);
}

async function applyDeleteClosure(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 120);
  if (!id) throw new Error("Closure ID is required.");

  await run("DELETE FROM department_closures WHERE id = ?", id);
  await audit(actorEmail, "CLOSURE_DELETED", "DepartmentClosure", id, `Deleted closure`);
}

async function applyDeleteDoctor(payload: Record<string, unknown>, actorEmail: string) {
  const slug = clean(payload.slug, 120);
  if (!slug) throw new Error("Doctor slug is required.");
  const repo: DoctorRepo = { query, run, audit };
  return archiveDoctor(repo, slug, actorEmail);
}

async function applyRestoreDoctor(payload: Record<string, unknown>, actorEmail: string) {
  const slug = clean(payload.slug, 120);
  if (!slug) throw new Error("Doctor slug is required.");
  const repo: DoctorRepo = { query, run, audit };
  return restoreDoctor(repo, slug, actorEmail);
}

async function applyDeleteBlog(payload: Record<string, unknown>, actorEmail: string) {
  const slug = clean(payload.slug, 120);
  if (!slug) throw new Error("Blog slug is required.");
  const existing = await query("SELECT id FROM blog_posts WHERE slug = ? AND is_deleted = 0 LIMIT 1", slug);
  const result = await run("UPDATE blog_posts SET is_deleted = 1 WHERE slug = ? AND is_deleted = 0", slug);
  requireAppliedMutation(result, Boolean(existing.results?.length), "Blog post");
  await audit(actorEmail, "BLOG_DELETED", "BlogPost", slug, `Soft deleted blog post with slug: ${slug}`);
  return { outcome: "APPLIED" as const };
}

async function applyDeleteCareer(payload: Record<string, unknown>, actorEmail: string) {
  const slug = clean(payload.slug, 120);
  if (!slug) throw new Error("Career job slug is required.");
  const existing = await query("SELECT id FROM career_jobs WHERE slug = ? AND is_deleted = 0 LIMIT 1", slug);
  const result = await run("UPDATE career_jobs SET is_deleted = 1 WHERE slug = ? AND is_deleted = 0", slug);
  requireAppliedMutation(result, Boolean(existing.results?.length), "Career job");
  await audit(actorEmail, "CAREER_DELETED", "CareerJob", slug, `Soft deleted job listing with slug: ${slug}`);
  return { outcome: "APPLIED" as const };
}

async function applyDeleteVideo(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 120);
  if (!id) throw new Error("Video ID is required.");
  const existing = await query("SELECT id FROM patient_videos WHERE id = ? AND is_deleted = 0 LIMIT 1", id);
  const result = await run("UPDATE patient_videos SET is_deleted = 1 WHERE id = ? AND is_deleted = 0", id);
  requireAppliedMutation(result, Boolean(existing.results?.length), "Patient video");
  await audit(actorEmail, "VIDEO_DELETED", "PatientVideo", id, `Soft deleted video with ID: ${id}`);
  return { outcome: "APPLIED" as const };
}
