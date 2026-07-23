import {
  audit,
  checkRateLimit,
  getClientIp,
  json,
  MutationNotFoundError,
  query,
  requireAdmin,
  requireAppliedMutation,
  run,
  verifyCsrf,
  hashPassword,
  nextRequestId,
} from "@/app/lib/server";
import { resolveYouTubeId } from "@/app/lib/youtube";
import { executeRoleMutation, MutationConflictError } from "@/app/lib/mutation-result";
import {
  archiveDoctor,
  restoreDoctor,
  loadDoctor,
  createDoctor,
  updateDoctor,
  validateDoctorMediaRelation,
  ARCHIVED_SAVE_ERROR,
  ACTIVE_DOCTORS_ADMIN_SQL,
  ARCHIVED_DOCTORS_ADMIN_SQL,
  parseExpectedVersion,
  throwInvalidExpectedVersion,
  type DoctorRepo,
} from "@/app/lib/doctor-admin";
import {
  loadBlog,
  loadBlogById,
  validateBlogMediaRelation,
  createBlog,
  updateBlog,
  publishBlog,
  hideBlog,
  archiveBlog,
  type BlogRepo,
} from "@/app/lib/blog-admin";
import { departmentBySlug } from "@/app/lib/data";
import { validateStaffAccountInput } from "@/app/lib/adminAuth";
import { sendEmail, getStaffOnboardingTemplate } from "@/app/lib/resend";
import { clean, slugify } from "@/app/lib/utils";
import {
  applyAtomicReorder,
  SECTION_PUBLISHED_GUARD,
  ITEM_SECTION_GUARD,
  ITEM_MEDIA_GUARD,
  validateMediaForPublication,
} from "@/app/lib/gallery-v2";

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
    query(ACTIVE_DOCTORS_ADMIN_SQL),
    query(ARCHIVED_DOCTORS_ADMIN_SQL),
    query("SELECT * FROM content_revisions ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM blog_posts WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM career_jobs WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM patient_videos ORDER BY created_at DESC LIMIT 100"),
    query("SELECT * FROM media_assets WHERE storage_type = 'R2' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100"),
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
  const photoMediaId = typeof payload.photoMediaId === "string" && payload.photoMediaId.trim()
    ? clean(payload.photoMediaId, 120)
    : null;
  const profileNote = clean(payload.profileNote, 1000);
  const isVisible = Number(payload.isVisible) === 0 ? 0 : 1;
  const blockedDates = clean(payload.blockedDates, 2000);

  const expectedVersion = parseExpectedVersion(payload.expectedVersion);
  if (Number.isNaN(expectedVersion)) throwInvalidExpectedVersion();

  if (!name || !slug || !speciality || !department) throw new Error("Invalid doctor profile payload.");

  const repo: DoctorRepo = { query, run, audit };

  const mediaCheck = await validateDoctorMediaRelation(repo, photoMediaId, isVisible === 1);
  if (!mediaCheck.ok) throw new Error(mediaCheck.error);

  const current = await loadDoctor(repo, slug);

  if (!current) {
    if (expectedVersion > 0) {
      throw new MutationConflictError("Doctor profile was changed by another session. Refresh and try again.");
    }
    return createDoctor(repo, slug, {
      name, speciality, qualification, departmentSlug: department.slug,
      photoUrl, photoMediaId, profileNote, blockedDates, isVisible: isVisible === 1,
    }, actorEmail);
  }

  if (current.is_deleted === 1 || current.lifecycle_status === "ARCHIVED") {
    throw new Error(ARCHIVED_SAVE_ERROR);
  }

  if (expectedVersion < 1) {
    throw new Error("expectedVersion is required for existing Doctor profiles.");
  }

  return updateDoctor(repo, slug, expectedVersion, {
    name, speciality, qualification, departmentSlug: department.slug,
    photoUrl, photoMediaId, profileNote, blockedDates, isVisible: isVisible === 1,
  }, actorEmail);
}

async function applyBlog(payload: Record<string, unknown>, actorEmail: string) {
  const title = clean(payload.title, 180);
  const slug = clean(payload.slug, 100) || slugify(title);
  const excerpt = clean(payload.excerpt, 300);
  const body = clean(payload.body, 8000);
  if (!title || !slug || !excerpt || !body) throw new Error("Invalid blog payload.");

  const blogId = typeof payload.blogId === "string" ? clean(payload.blogId, 140) || "" : "";

  const coverMediaIdHasKey = Object.prototype.hasOwnProperty.call(payload, "coverMediaId");
  let coverMediaIdExplicitlyProvided = false;
  let coverMediaId: string | null = null;
  if (coverMediaIdHasKey) {
    coverMediaIdExplicitlyProvided = true;
    if (typeof payload.coverMediaId === "string" && payload.coverMediaId.trim()) {
      coverMediaId = clean(payload.coverMediaId, 140) || null;
    } else {
      coverMediaId = null;
    }
  }

  const blogRepo: BlogRepo = { query, run, audit };

  const expectedVersion = typeof payload.expectedVersion === "number"
    ? parseExpectedVersion(payload.expectedVersion, { minimum: 0 })
    : NaN;

  if (blogId) {
    const existing = await loadBlogById(blogRepo, blogId);
    if (!existing) throw new MutationNotFoundError("Blog post");
    if (existing.is_deleted) throw new MutationNotFoundError("Blog post");
    if (Number.isNaN(expectedVersion) || expectedVersion < 1) {
      throw new Error("expectedVersion is required for existing blog posts.");
    }
    if (existing.version !== expectedVersion) {
      throw new MutationConflictError("Blog post was modified by another session. Refresh and try again.");
    }

    if (coverMediaIdExplicitlyProvided && coverMediaId) {
      const existingVisible = existing.is_visible === 1;
      const mediaCheck = await validateBlogMediaRelation(blogRepo, coverMediaId, existingVisible);
      if (!mediaCheck.ok) throw new Error(mediaCheck.error);
    }

    return updateBlog(blogRepo, blogId, expectedVersion, {
      title, excerpt, body,
      coverMediaId: coverMediaId,
      coverMediaIdExplicitlyProvided,
    }, actorEmail);
  }

  const existingBySlug = await loadBlog(blogRepo, slug);
  if (existingBySlug) {
    throw new MutationConflictError("A blog with this slug already exists. Use blogId to update.");
  }

  if (!Number.isNaN(expectedVersion) && expectedVersion > 0) {
    throw new MutationConflictError("Blog post was created by another session. Refresh and try again.");
  }

  if (coverMediaIdExplicitlyProvided && coverMediaId) {
    const mediaCheck = await validateBlogMediaRelation(blogRepo, coverMediaId, false);
    if (!mediaCheck.ok) throw new Error(mediaCheck.error);
  }

  return createBlog(blogRepo, slug, {
    title, excerpt, body,
    coverMediaId: coverMediaId,
  }, actorEmail);
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
  const mode = clean(payload.mode, 10).toUpperCase();
  if (mode !== "CREATE" && mode !== "UPDATE") {
    throw new Error("mode must be 'CREATE' or 'UPDATE'.");
  }
  const title = clean(payload.title, 180);
  const youtubeUrl = clean(payload.youtubeUrl, 500);
  const consentNote = clean(payload.consentNote, 1000);
  const youtubeId = resolveYouTubeId({ youtubeUrl });
  if (!title || !youtubeUrl || !youtubeId || consentNote.length < 5) {
    throw new Error("Valid YouTube URL and consent note are required.");
  }

  if (mode === "CREATE") {
    const activeRow = await query(
      "SELECT id FROM patient_videos WHERE youtube_id = ? AND is_deleted = 0 LIMIT 1",
      youtubeId,
    );
    if (activeRow.results?.length) {
      throw new Error("This YouTube video already exists. Edit the existing entry instead.");
    }
    const archivedRow = await query(
      "SELECT id FROM patient_videos WHERE youtube_id = ? AND is_deleted = 1 LIMIT 1",
      youtubeId,
    );
    if (archivedRow.results?.length) {
      throw new Error("This YouTube video is archived. Restore the existing entry instead.");
    }
    const id = `video-${youtubeId}`;
    await run(
      `INSERT INTO patient_videos (id, title, youtube_url, youtube_id, consent_note, status, is_visible)
        VALUES (?, ?, ?, ?, ?, 'HIDDEN', 0)`,
      id,
      title,
      youtubeUrl,
      youtubeId,
      consentNote,
    );
    await audit(actorEmail, "VIDEO_CREATED", "PatientVideo", id, title);
  } else {
    const id = clean(payload.id as string, 120);
    if (!id) throw new Error("Video ID is required for updates.");
    const existing = await query(
      "SELECT id, is_deleted FROM patient_videos WHERE id = ? LIMIT 1",
      id,
    );
    if (!existing.results?.length) {
      throw new Error("Patient video was not found.");
    }
    const row = existing.results[0] as { id: string; is_deleted: number };
    if (row.is_deleted === 1) {
      throw new Error("Cannot edit an archived video. Restore it first.");
    }
    const conflict = await query(
      "SELECT id, is_deleted FROM patient_videos WHERE youtube_id = ? AND id <> ? LIMIT 1",
      youtubeId,
      id,
    );
    if (conflict.results?.length) {
      const c = conflict.results[0] as { id: string; is_deleted: number };
      if (c.is_deleted === 0) {
        throw new Error("Another active video already uses this YouTube URL.");
      }
      throw new Error("This YouTube video belongs to an archived entry. Restore or update that entry instead.");
    }
    const result = await run(
      "UPDATE patient_videos SET title = ?, youtube_url = ?, youtube_id = ?, consent_note = ? WHERE id = ? AND is_deleted = 0",
      title,
      youtubeUrl,
      youtubeId,
      consentNote,
      id,
    );
    requireAppliedMutation(result, true, "Patient video");
    await audit(actorEmail, "VIDEO_UPDATED", "PatientVideo", id, title);
  }
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
  const blogId = typeof payload.blogId === "string" ? clean(payload.blogId, 140) || "" : "";
  if (!blogId) throw new Error("Blog ID is required.");

  const expectedVersion = typeof payload.expectedVersion === "number"
    ? parseExpectedVersion(payload.expectedVersion, { minimum: 1 })
    : NaN;
  if (Number.isNaN(expectedVersion)) {
    throw new Error("expectedVersion is required for blog visibility changes.");
  }

  const targetAction = clean(payload.action, 40).toUpperCase();
  if (targetAction !== "publish" && targetAction !== "hide") {
    throw new Error("action must be 'publish' or 'hide'.");
  }

  const blogRepo: BlogRepo = { query, run, audit };

  if (targetAction === "publish") {
    return publishBlog(blogRepo, blogId, expectedVersion, actorEmail);
  }
  return hideBlog(blogRepo, blogId, expectedVersion, actorEmail);
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
  const targetAction = clean(payload.action, 40).toLowerCase();
  if (!id) throw new Error("Video id is required.");
  if (targetAction !== "publish" && targetAction !== "hide") {
    throw new Error("action must be 'publish' or 'hide'.");
  }

  const rows = await query<{
    id: string;
    title: string;
    youtube_url: string;
    youtube_id: string;
    consent_note: string;
    status: string;
    is_visible: number;
    is_deleted: number;
  }>(
    "SELECT id, title, youtube_url, youtube_id, consent_note, status, is_visible, is_deleted FROM patient_videos WHERE id = ? LIMIT 1",
    id,
  );
  if (!rows.results?.length) throw new Error("Patient video was not found.");
  const current = rows.results[0];

  if (current.is_deleted === 1) {
    throw new Error("Cannot change visibility of an archived video. Restore it first.");
  }

  if (targetAction === "publish") {
    if (current.status === "APPROVED" && current.is_visible === 1) {
      return { outcome: "NO_OP" as const };
    }
    if (!current.title || !current.title.trim()) {
      throw new Error("Cannot publish: video title is missing.");
    }
    if (!current.consent_note || current.consent_note.trim().length < 5) {
      throw new Error("Cannot publish: consent note is missing or too short.");
    }
    const resolvedId = resolveYouTubeId({ youtubeId: current.youtube_id, youtubeUrl: current.youtube_url });
    if (!resolvedId) {
      throw new Error("Cannot publish: stored YouTube URL or ID is invalid.");
    }
    const result = await run(
      "UPDATE patient_videos SET status = 'APPROVED', is_visible = 1 WHERE id = ? AND is_deleted = 0",
      id,
    );
    requireAppliedMutation(result, true, "Patient video");
    await audit(actorEmail, "VIDEO_PUBLISHED", "PatientVideo", id, current.status);
  } else {
    if (current.status === "HIDDEN" && current.is_visible === 0) {
      return { outcome: "NO_OP" as const };
    }
    const result = await run(
      "UPDATE patient_videos SET status = 'HIDDEN', is_visible = 0 WHERE id = ? AND is_deleted = 0",
      id,
    );
    requireAppliedMutation(result, true, "Patient video");
    await audit(actorEmail, "VIDEO_HIDDEN", "PatientVideo", id, current.status);
  }
  return { outcome: "APPLIED" as const };
}

async function applyVideoRestore(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 120);
  if (!id) throw new Error("Video ID is required.");
  const rows = await query<{
    id: string; youtube_url: string; youtube_id: string; is_deleted: number; status: string; is_visible: number;
  }>(
    "SELECT id, youtube_url, youtube_id, is_deleted, status, is_visible FROM patient_videos WHERE id = ? LIMIT 1",
    id,
  );
  if (!rows.results?.length) throw new Error("Patient video was not found.");
  const current = rows.results[0];
  if (current.is_deleted === 0) {
    return { outcome: "NO_OP" as const };
  }

  const resolvedId = resolveYouTubeId({ youtubeId: current.youtube_id, youtubeUrl: current.youtube_url });
  if (!resolvedId) {
    throw new Error("Cannot restore: stored YouTube URL or ID is invalid.");
  }

  const conflict = await query(
    "SELECT id FROM patient_videos WHERE youtube_id = ? AND id <> ? AND is_deleted = 0 LIMIT 1",
    resolvedId,
    id,
  );
  if (conflict.results?.length) {
    throw new Error("Cannot restore: this YouTube video is already used by another active entry.");
  }

  const result = await run(
    "UPDATE patient_videos SET is_deleted = 0, status = 'HIDDEN', is_visible = 0 WHERE id = ?",
    id,
  );
  requireAppliedMutation(result, true, "Patient video");
  await audit(actorEmail, "VIDEO_RESTORED", "PatientVideo", id);
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
  if (action === "video.restore") return applyVideoRestore(payload, actorEmail);
  if (action === "contact.status") return applyContactStatus(payload, actorEmail);
  if (action === "appointment.status") return applyAppointmentStatus(payload, actorEmail);
  if (action === "appointment.create") return applyCreateAppointment(payload, actorEmail);
  if (action === "closure.add") return applyAddClosure(payload, actorEmail);
  if (action === "closure.delete") return applyDeleteClosure(payload, actorEmail);
  if (action === "doctor.delete") return applyDeleteDoctor(payload, actorEmail);
  if (action === "doctor.restore") return applyRestoreDoctor(payload, actorEmail);
  if (action === "blog.archive") return applyArchiveBlog(payload, actorEmail);
  if (action === "blog.delete") return applyDeleteBlog(payload, actorEmail);
  if (action === "career.delete") return applyDeleteCareer(payload, actorEmail);
  if (action === "video.delete") return applyDeleteVideo(payload, actorEmail);
  if (action === "gallery_section.create") return applyGallerySectionCreate(payload, actorEmail);
  if (action === "gallery_section.update") return applyGallerySectionUpdate(payload, actorEmail);
  if (action === "gallery_section.delete") return applyGallerySectionDelete(payload, actorEmail);
  if (action === "gallery_item.create") return applyGalleryItemCreate(payload, actorEmail);
  if (action === "gallery_item.update") return applyGalleryItemUpdate(payload, actorEmail);
  if (action === "gallery_item.delete") return applyGalleryItemDelete(payload, actorEmail);
  if (action === "gallery_items.reorder") return applyGalleryItemsReorder(payload, actorEmail);
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

    const preCheck = validatePayload(action, payload);
    if (!preCheck.ok) {
      return json({ error: preCheck.error || "Invalid payload." }, { status: 400 });
    }

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
    if (error instanceof MutationConflictError) {
      return json({ success: false, outcome: "CONFLICT", error: error.message }, { status: 409 });
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
    if (obj.expectedVersion !== undefined && obj.expectedVersion !== null && Number.isNaN(parseExpectedVersion(obj.expectedVersion))) {
      return { ok: false, error: "expectedVersion must be a non-negative integer." };
    }
  } else if (action === "timing.upsert") {
    if (typeof obj.departmentSlug !== "string" || !obj.departmentSlug.trim()) return { ok: false, error: "Department slug is required." };
    if (typeof obj.startTime !== "string" || !obj.startTime.trim()) return { ok: false, error: "Start time is required." };
    if (typeof obj.endTime !== "string" || !obj.endTime.trim()) return { ok: false, error: "End time is required." };
    if (typeof obj.days !== "string" || !obj.days.trim()) return { ok: false, error: "Days parameter is required." };
  } else if (action === "blog.save") {
    if (typeof obj.title !== "string" || !obj.title.trim()) return { ok: false, error: "Blog title is required." };
    if (typeof obj.body !== "string" || !obj.body.trim()) return { ok: false, error: "Blog body is required." };
    if (typeof obj.slug !== "string" || !obj.slug.trim()) return { ok: false, error: "Blog slug is required." };
    if (obj.blogId !== undefined && obj.blogId !== null && obj.blogId !== "") {
      if (typeof obj.blogId !== "string" || obj.blogId.length > 140) return { ok: false, error: "blogId must be a string of at most 140 characters." };
    }
    if (obj.coverMediaId !== undefined && obj.coverMediaId !== null && obj.coverMediaId !== "") {
      if (typeof obj.coverMediaId !== "string" || obj.coverMediaId.length > 140) return { ok: false, error: "coverMediaId must be a string of at most 140 characters." };
    }
    if (obj.expectedVersion !== undefined) {
      if (typeof obj.expectedVersion !== "number" || Number.isNaN(parseExpectedVersion(obj.expectedVersion))) {
        return { ok: false, error: "expectedVersion must be a non-negative integer." };
      }
    }
  } else if (action === "blog.visibility") {
    if (typeof obj.blogId !== "string" || !obj.blogId.trim()) return { ok: false, error: "blogId is required." };
    if (typeof obj.expectedVersion !== "number" || Number.isNaN(parseExpectedVersion(obj.expectedVersion, { minimum: 1 }))) {
      return { ok: false, error: "expectedVersion must be a positive integer." };
    }
    if (typeof obj.action !== "string" || !["publish", "hide"].includes(clean(obj.action, 40).toLowerCase())) {
      return { ok: false, error: "action must be 'publish' or 'hide'." };
    }
  } else if (action === "blog.archive") {
    if (typeof obj.blogId !== "string" || !obj.blogId.trim()) return { ok: false, error: "blogId is required." };
    if (typeof obj.expectedVersion !== "number" || Number.isNaN(parseExpectedVersion(obj.expectedVersion, { minimum: 1 }))) {
      return { ok: false, error: "expectedVersion must be a positive integer." };
    }
  } else if (action === "career.save") {
    if (typeof obj.title !== "string" || !obj.title.trim()) return { ok: false, error: "Job title is required." };
    if (typeof obj.description !== "string" || !obj.description.trim()) return { ok: false, error: "Job description is required." };
    if (typeof obj.slug !== "string" || !obj.slug.trim()) return { ok: false, error: "Job slug is required." };
  } else if (action === "video.save") {
    if (typeof obj.mode !== "string" || !["CREATE", "UPDATE"].includes(clean(obj.mode, 10).toUpperCase())) {
      return { ok: false, error: "mode must be 'CREATE' or 'UPDATE'." };
    }
    if (typeof obj.title !== "string" || !obj.title.trim()) return { ok: false, error: "Video title is required." };
    if (typeof obj.youtubeUrl !== "string" || !obj.youtubeUrl.trim()) return { ok: false, error: "YouTube URL is required." };
    if (typeof obj.consentNote !== "string" || obj.consentNote.trim().length < 5) return { ok: false, error: "Consent note must be at least 5 characters." };
  } else if (action === "video.visibility") {
    if (typeof obj.id !== "string" || !obj.id.trim()) return { ok: false, error: "Video ID is required." };
    if (typeof obj.action !== "string" || !["publish", "hide"].includes(clean(obj.action, 40).toLowerCase())) {
      return { ok: false, error: "action must be 'publish' or 'hide'." };
    }
  } else if (action === "video.delete") {
    if (typeof obj.id !== "string" || !obj.id.trim()) return { ok: false, error: "Video ID is required." };
  } else if (action === "video.restore") {
    if (typeof obj.id !== "string" || !obj.id.trim()) return { ok: false, error: "Video ID is required." };
  } else if (action === "doctor.restore") {
    if (typeof obj.slug !== "string" || !obj.slug.trim()) return { ok: false, error: "Doctor slug is required." };
    if (Number.isNaN(parseExpectedVersion(obj.expectedVersion, { minimum: 1 }))) return { ok: false, error: "expectedVersion must be a positive integer." };
  } else if (action === "doctor.delete") {
    if (typeof obj.slug !== "string" || !obj.slug.trim()) return { ok: false, error: "Doctor slug is required." };
    if (Number.isNaN(parseExpectedVersion(obj.expectedVersion, { minimum: 1 }))) return { ok: false, error: "expectedVersion must be a positive integer." };
  } else if (action === "gallery_section.create") {
    if (typeof obj.name !== "string" || !obj.name.trim()) return { ok: false, error: "Section name is required." };
    if (obj.sortOrder !== undefined && (typeof obj.sortOrder !== "number" || !Number.isInteger(obj.sortOrder) || obj.sortOrder < 0)) return { ok: false, error: "sortOrder must be a non-negative integer." };
  } else if (action === "gallery_section.update") {
    if (typeof obj.id !== "string" || !obj.id.trim()) return { ok: false, error: "Section ID is required." };
    if (typeof obj.expectedVersion !== "number" || !Number.isInteger(obj.expectedVersion) || obj.expectedVersion < 1) return { ok: false, error: "expectedVersion must be a positive integer." };
    if (obj.sortOrder !== undefined && (typeof obj.sortOrder !== "number" || !Number.isInteger(obj.sortOrder) || obj.sortOrder < 0)) return { ok: false, error: "sortOrder must be a non-negative integer." };
  } else if (action === "gallery_section.delete") {
    if (typeof obj.id !== "string" || !obj.id.trim()) return { ok: false, error: "Section ID is required." };
    if (typeof obj.expectedVersion !== "number" || !Number.isInteger(obj.expectedVersion) || obj.expectedVersion < 1) return { ok: false, error: "expectedVersion must be a positive integer." };
  } else if (action === "gallery_item.create") {
    if (typeof obj.sectionId !== "string" || !obj.sectionId.trim()) return { ok: false, error: "sectionId is required." };
    if (typeof obj.mediaId !== "string" || !obj.mediaId.trim()) return { ok: false, error: "mediaId is required." };
    if (obj.sortOrder !== undefined && (typeof obj.sortOrder !== "number" || !Number.isInteger(obj.sortOrder) || obj.sortOrder < 0)) return { ok: false, error: "sortOrder must be a non-negative integer." };
  } else if (action === "gallery_item.update") {
    if (typeof obj.id !== "string" || !obj.id.trim()) return { ok: false, error: "Item ID is required." };
    if (typeof obj.expectedVersion !== "number" || !Number.isInteger(obj.expectedVersion) || obj.expectedVersion < 1) return { ok: false, error: "expectedVersion must be a positive integer." };
    if (obj.sectionId !== undefined) return { ok: false, error: "sectionId is immutable." };
    if (obj.mediaId !== undefined) return { ok: false, error: "mediaId is immutable." };
    if (obj.sortOrder !== undefined && (typeof obj.sortOrder !== "number" || !Number.isInteger(obj.sortOrder) || obj.sortOrder < 0)) return { ok: false, error: "sortOrder must be a non-negative integer." };
  } else if (action === "gallery_item.delete") {
    if (typeof obj.id !== "string" || !obj.id.trim()) return { ok: false, error: "Item ID is required." };
    if (typeof obj.expectedVersion !== "number" || !Number.isInteger(obj.expectedVersion) || obj.expectedVersion < 1) return { ok: false, error: "expectedVersion must be a positive integer." };
  } else if (action === "gallery_items.reorder") {
    if (typeof obj.sectionId !== "string" || !obj.sectionId.trim()) return { ok: false, error: "sectionId is required." };
    if (!Array.isArray(obj.itemOrder) || obj.itemOrder.length < 1 || obj.itemOrder.length > 100) {
      return { ok: false, error: "itemOrder length must be between 1 and 100." };
    }
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
  const expectedVersion = parseExpectedVersion(payload.expectedVersion, { minimum: 1 });
  if (Number.isNaN(expectedVersion)) throwInvalidExpectedVersion("expectedVersion must be a positive integer.");
  const repo: DoctorRepo = { query, run, audit };
  return archiveDoctor(repo, slug, expectedVersion, actorEmail);
}

async function applyRestoreDoctor(payload: Record<string, unknown>, actorEmail: string) {
  const slug = clean(payload.slug, 120);
  if (!slug) throw new Error("Doctor slug is required.");
  const expectedVersion = parseExpectedVersion(payload.expectedVersion, { minimum: 1 });
  if (Number.isNaN(expectedVersion)) throwInvalidExpectedVersion("expectedVersion must be a positive integer.");
  const repo: DoctorRepo = { query, run, audit };
  return restoreDoctor(repo, slug, expectedVersion, actorEmail);
}

async function applyDeleteBlog(payload: Record<string, unknown>, actorEmail: string) {
  const slug = clean(payload.slug, 120);
  if (!slug) throw new Error("Blog slug is required.");
  const existing = await query("SELECT id FROM blog_posts WHERE slug = ? AND is_deleted = 0 LIMIT 1", slug);
  const result = await run("UPDATE blog_posts SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE slug = ? AND is_deleted = 0", slug);
  requireAppliedMutation(result, Boolean(existing.results?.length), "Blog post");
  await audit(actorEmail, "BLOG_DELETED", "BlogPost", slug, `Soft deleted blog post with slug: ${slug}`);
  return { outcome: "APPLIED" as const };
}

async function applyArchiveBlog(payload: Record<string, unknown>, actorEmail: string) {
  const blogId = typeof payload.blogId === "string" ? clean(payload.blogId, 140) || "" : "";
  if (!blogId) throw new Error("Blog ID is required.");
  const expectedVersion = typeof payload.expectedVersion === "number"
    ? parseExpectedVersion(payload.expectedVersion, { minimum: 1 })
    : NaN;
  if (Number.isNaN(expectedVersion)) {
    throw new Error("expectedVersion is required for blog archive.");
  }
  const blogRepo: BlogRepo = { query, run, audit };
  return archiveBlog(blogRepo, blogId, expectedVersion, actorEmail);
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
  const result = await run("UPDATE patient_videos SET is_deleted = 1, is_visible = 0, status = 'HIDDEN' WHERE id = ? AND is_deleted = 0", id);
  requireAppliedMutation(result, Boolean(existing.results?.length), "Patient video");
  await audit(actorEmail, "VIDEO_ARCHIVED", "PatientVideo", id, `Archived video with ID: ${id}`);
  return { outcome: "APPLIED" as const };
}

/* ───────────────────────────────────────────────────────────────────────────
   Gallery v2 action handlers (revision.review integration)
   ─────────────────────────────────────────────────────────────────────────── */

async function applyGallerySectionCreate(payload: Record<string, unknown>, actorEmail: string) {
  const slug = clean(payload.slug, 100);
  const name = clean(payload.name, 200);
  const description = clean(payload.description, 1000);
  if (typeof payload.sortOrder !== "number" || !Number.isInteger(payload.sortOrder) || payload.sortOrder < 0) {
    throw new Error("sortOrder must be a non-negative integer.");
  }
  const sortOrder = payload.sortOrder;

  if (!slug || !name) throw new Error("Section slug and name are required.");

  const existing = await query("SELECT id FROM gallery_sections WHERE slug = ? AND deleted_at IS NULL LIMIT 1", slug);
  if (existing.results && existing.results.length > 0) {
    throw new Error(`A gallery section with slug "${slug}" already exists.`);
  }

  const sectionId = `gallery-section-${slug}`;
  await run(
    `INSERT INTO gallery_sections (id, slug, name, description, sort_order, lifecycle_status, version, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'DRAFT', 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    sectionId,
    slug,
    name,
    description,
    sortOrder,
    actorEmail,
    actorEmail,
  );
  await audit(actorEmail, "GALLERY_SECTION_CREATED", "GallerySection", sectionId, `Created gallery section: ${name}`);
  return { outcome: "APPLIED" as const };
}

async function applyGallerySectionUpdate(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 140);
  const expectedVersion = typeof payload.expectedVersion === "number" && Number.isInteger(payload.expectedVersion) && payload.expectedVersion >= 1
    ? payload.expectedVersion
    : 0;
  if (!id) throw new Error("Section ID is required.");
  if (!expectedVersion) throw new Error("expectedVersion is required and must be a positive integer.");

  const rows = await query<{ id: string; version: number; deleted_at: string | null }>(
    "SELECT id, version, deleted_at FROM gallery_sections WHERE id = ? LIMIT 1",
    id,
  );
  const current = rows.results?.[0];
  if (!current || current.deleted_at) throw new Error("Gallery section not found.");
  if (current.version !== expectedVersion) throw new Error("Version conflict. The section has been modified since you loaded it.");

  const updates: string[] = [];
  const binds: unknown[] = [];

  if (payload.name !== undefined) {
    const name = clean(payload.name, 200);
    if (!name) throw new Error("Section name cannot be empty.");
    updates.push("name = ?");
    binds.push(name);
  }
  if (payload.slug !== undefined) {
    const slug = clean(payload.slug, 100);
    if (!slug) throw new Error("Invalid slug.");
    const existing = await query("SELECT id FROM gallery_sections WHERE slug = ? AND id != ? AND deleted_at IS NULL LIMIT 1", slug, id);
    if (existing.results && existing.results.length > 0) throw new Error(`A section with slug "${slug}" already exists.`);
    updates.push("slug = ?");
    binds.push(slug);
  }
  if (payload.description !== undefined) {
    updates.push("description = ?");
    binds.push(clean(payload.description, 1000));
  }
  if (payload.sortOrder !== undefined) {
    if (typeof payload.sortOrder !== "number" || !Number.isInteger(payload.sortOrder) || payload.sortOrder < 0) {
      throw new Error("sortOrder must be a non-negative integer.");
    }
    updates.push("sort_order = ?");
    binds.push(payload.sortOrder);
  }

  const targetLifecycleStatus = payload.lifecycleStatus !== undefined ? clean(payload.lifecycleStatus, 40) : null;
  if (targetLifecycleStatus !== null) {
    updates.push("lifecycle_status = ?");
    binds.push(targetLifecycleStatus);
  }

  if (updates.length === 0) throw new Error("No editable fields provided.");

  updates.push("version = version + 1");
  updates.push("updated_by = ?");
  binds.push(actorEmail);
  updates.push("updated_at = CURRENT_TIMESTAMP");

  const whereClauses = ["id = ?", "version = ?", "deleted_at IS NULL"];
  const whereBinds: unknown[] = [id, expectedVersion];

  if (targetLifecycleStatus === "PUBLISHED") {
    whereClauses.push(SECTION_PUBLISHED_GUARD);
  }

  const result = await run(
    `UPDATE gallery_sections SET ${updates.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
    ...binds,
    ...whereBinds,
  );
  if (result.meta?.changes === 0) throw new Error("Version conflict. The section has been modified since you loaded it.");

  await audit(actorEmail, "GALLERY_SECTION_UPDATED", "GallerySection", id, `Updated gallery section via revision approval`);
  return { outcome: "APPLIED" as const };
}

async function applyGallerySectionDelete(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 140);
  const expectedVersion = typeof payload.expectedVersion === "number" && Number.isInteger(payload.expectedVersion) && payload.expectedVersion >= 1
    ? payload.expectedVersion
    : 0;
  if (!id) throw new Error("Section ID is required.");
  if (!expectedVersion) throw new Error("expectedVersion is required and must be a positive integer.");

  const rows = await query<{ id: string; version: number; deleted_at: string | null }>(
    "SELECT id, version, deleted_at FROM gallery_sections WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    id,
  );
  const current = rows.results?.[0];
  if (!current) throw new Error("Gallery section not found.");
  if (current.version !== expectedVersion) throw new Error("Version conflict. The section has been modified since you loaded it.");

  const result = await run(
    `UPDATE gallery_sections
     SET lifecycle_status = 'ARCHIVED', deleted_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND version = ? AND deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM gallery_items WHERE section_id = gallery_sections.id AND deleted_at IS NULL)`,
    actorEmail,
    id,
    expectedVersion,
  );
  if (result.meta?.changes === 0) {
    const activeCheck = await query("SELECT id FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL LIMIT 1", id);
    if (activeCheck.results && activeCheck.results.length > 0) {
      throw new Error("Cannot delete a section that still has active gallery items. Remove all items first.");
    }
    throw new Error("Version conflict. The section has been modified since you loaded it.");
  }

  await audit(actorEmail, "GALLERY_SECTION_DELETED", "GallerySection", id, `Deleted gallery section via revision approval`);
  return { outcome: "APPLIED" as const };
}

async function applyGalleryItemCreate(payload: Record<string, unknown>, actorEmail: string) {
  const sectionId = clean(payload.sectionId, 140);
  const mediaId = clean(payload.mediaId, 140);
  const slotKey = payload.slotKey !== undefined && payload.slotKey !== null
    ? clean(payload.slotKey, 150) || null
    : null;
  const titleOverride = clean(payload.titleOverride, 200);
  const altTextOverride = clean(payload.altTextOverride, 300);
  const captionOverride = clean(payload.captionOverride, 1000);
  if (typeof payload.sortOrder !== "number" || !Number.isInteger(payload.sortOrder) || payload.sortOrder < 0) {
    throw new Error("sortOrder must be a non-negative integer.");
  }
  const sortOrder = payload.sortOrder;

  if (!sectionId || !mediaId) throw new Error("sectionId and mediaId are required.");

  const sectionRows = await query("SELECT id FROM gallery_sections WHERE id = ? AND deleted_at IS NULL LIMIT 1", sectionId);
  if (!sectionRows.results || sectionRows.results.length === 0) {
    throw new Error("Gallery section not found.");
  }

  const mediaRows = await query("SELECT id, category FROM media_assets WHERE id = ? AND deleted_at IS NULL LIMIT 1", mediaId);
  if (!mediaRows.results || mediaRows.results.length === 0) {
    throw new Error("Media asset not found or has been deleted.");
  }
  const mediaCategory = (mediaRows.results[0] as { category?: string }).category;
  if (mediaCategory && mediaCategory !== "GALLERY") {
    throw new Error("Media asset category must be GALLERY for gallery items.");
  }

  const itemId = `gallery-item-${crypto.randomUUID().slice(0, 8)}`;
  await run(
    `INSERT INTO gallery_items (id, section_id, media_id, slot_key, title_override, alt_text_override, caption_override, sort_order, lifecycle_status, version, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    itemId,
    sectionId,
    mediaId,
    slotKey,
    titleOverride,
    altTextOverride,
    captionOverride,
    sortOrder,
    actorEmail,
    actorEmail,
  );
  await audit(actorEmail, "GALLERY_ITEM_CREATED", "GalleryItem", itemId, `Created gallery item in section ${sectionId}`);
  return { outcome: "APPLIED" as const };
}

async function applyGalleryItemUpdate(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 140);
  const expectedVersion = typeof payload.expectedVersion === "number" && Number.isInteger(payload.expectedVersion) && payload.expectedVersion >= 1
    ? payload.expectedVersion
    : 0;
  if (!id) throw new Error("Item ID is required.");
  if (!expectedVersion) throw new Error("expectedVersion is required and must be a positive integer.");
  if (payload.sectionId !== undefined) throw new Error("sectionId is immutable.");
  if (payload.mediaId !== undefined) throw new Error("mediaId is immutable.");

  const rows = await query<{
    id: string; version: number; deleted_at: string | null;
    media_id: string; storage_type: string; r2_key: string; public_path: string | null;
    display_r2_key: string | null; display_public_path: string | null;
    thumbnail_r2_key: string | null; thumbnail_public_path: string | null;
  }>(
    "SELECT gi.id, gi.version, gi.deleted_at, gi.media_id, m.storage_type, m.r2_key, m.public_path, m.display_r2_key, m.display_public_path, m.thumbnail_r2_key, m.thumbnail_public_path FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.id = ? AND gi.deleted_at IS NULL LIMIT 1",
    id,
  );
  const current = rows.results?.[0];
  if (!current || current.deleted_at) throw new Error("Gallery item not found.");
  if (current.version !== expectedVersion) throw new Error("Version conflict. The item has been modified since you loaded it.");

  const updates: string[] = [];
  const binds: unknown[] = [];

  if (payload.slotKey !== undefined) {
    const slotKey = payload.slotKey === null || payload.slotKey === "" ? null : clean(payload.slotKey, 150) || null;
    if (slotKey) {
      const existing = await query("SELECT id FROM gallery_items WHERE slot_key = ? AND id != ? AND deleted_at IS NULL LIMIT 1", slotKey, id);
      if (existing.results && existing.results.length > 0) throw new Error("This slot_key is already in use by another active item.");
    }
    updates.push("slot_key = ?");
    binds.push(slotKey);
  }
  if (payload.titleOverride !== undefined) {
    updates.push("title_override = ?");
    binds.push(clean(payload.titleOverride, 200));
  }
  if (payload.altTextOverride !== undefined) {
    updates.push("alt_text_override = ?");
    binds.push(clean(payload.altTextOverride, 300));
  }
  if (payload.captionOverride !== undefined) {
    updates.push("caption_override = ?");
    binds.push(clean(payload.captionOverride, 1000));
  }
  if (payload.sortOrder !== undefined) {
    if (typeof payload.sortOrder !== "number" || !Number.isInteger(payload.sortOrder) || payload.sortOrder < 0) {
      throw new Error("sortOrder must be a non-negative integer.");
    }
    updates.push("sort_order = ?");
    binds.push(payload.sortOrder);
  }

  const targetLifecycleStatus = payload.lifecycleStatus !== undefined ? clean(payload.lifecycleStatus, 40) : null;
  if (targetLifecycleStatus !== null) {
    updates.push("lifecycle_status = ?");
    binds.push(targetLifecycleStatus);
  }

  if (updates.length === 0) throw new Error("No editable fields provided.");

  updates.push("version = version + 1");
  updates.push("updated_by = ?");
  binds.push(actorEmail);
  updates.push("updated_at = CURRENT_TIMESTAMP");

  const whereClauses = ["id = ?", "version = ?", "deleted_at IS NULL"];
  const whereBinds: unknown[] = [id, expectedVersion];

  if (targetLifecycleStatus === "PUBLISHED") {
    validateMediaForPublication(current.media_id, {
      storage_type: current.storage_type,
      r2_key: current.r2_key,
      public_path: current.public_path,
      display_r2_key: current.display_r2_key,
      display_public_path: current.display_public_path,
      thumbnail_r2_key: current.thumbnail_r2_key,
      thumbnail_public_path: current.thumbnail_public_path,
    });
    whereClauses.push(ITEM_SECTION_GUARD);
    whereClauses.push(ITEM_MEDIA_GUARD);
  }

  const result = await run(
    `UPDATE gallery_items SET ${updates.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
    ...binds,
    ...whereBinds,
  );
  if (result.meta?.changes === 0) throw new Error("Version conflict. The item has been modified since you loaded it.");

  await audit(actorEmail, "GALLERY_ITEM_UPDATED", "GalleryItem", id, `Updated gallery item via revision approval`);
  return { outcome: "APPLIED" as const };
}

async function applyGalleryItemDelete(payload: Record<string, unknown>, actorEmail: string) {
  const id = clean(payload.id, 140);
  const expectedVersion = typeof payload.expectedVersion === "number" && Number.isInteger(payload.expectedVersion) && payload.expectedVersion >= 1
    ? payload.expectedVersion
    : 0;
  if (!id) throw new Error("Item ID is required.");
  if (!expectedVersion) throw new Error("expectedVersion is required and must be a positive integer.");

  const rows = await query<{ id: string; version: number; deleted_at: string | null }>(
    "SELECT id, version, deleted_at FROM gallery_items WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    id,
  );
  const current = rows.results?.[0];
  if (!current) throw new Error("Gallery item not found.");
  if (current.version !== expectedVersion) throw new Error("Version conflict. The item has been modified since you loaded it.");

  const result = await run(
    "UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ? AND deleted_at IS NULL",
    actorEmail,
    id,
    expectedVersion,
  );
  if (result.meta?.changes === 0) throw new Error("Version conflict. The item has been modified since you loaded it.");

  await audit(actorEmail, "GALLERY_ITEM_DELETED", "GalleryItem", id, `Deleted gallery item via revision approval`);
  return { outcome: "APPLIED" as const };
}

async function applyGalleryItemsReorder(payload: Record<string, unknown>, actorEmail: string) {
  const sectionId = clean(payload.sectionId, 140);
  if (!sectionId) throw new Error("sectionId is required.");

  const itemOrder = payload.itemOrder;
  if (!Array.isArray(itemOrder) || itemOrder.length === 0) {
    throw new Error("itemOrder must be a non-empty array.");
  }

  const sectionRows = await query("SELECT id FROM gallery_sections WHERE id = ? AND deleted_at IS NULL LIMIT 1", sectionId);
  if (!sectionRows.results || sectionRows.results.length === 0) {
    throw new Error("Gallery section not found.");
  }

  const activeItems = await query<{ id: string; version: number }>(
    "SELECT id, version FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL",
    sectionId,
  );
  const activeRows = activeItems.results ?? [];
  const activeIdSet = new Set(activeRows.map((r) => r.id));
  const activeVersionMap = new Map(activeRows.map((r) => [r.id, r.version]));

  const inputIds = new Set<string>();
  for (const entry of itemOrder) {
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id) throw new Error("Each itemOrder entry must have a string id.");
    if (inputIds.has(e.id)) throw new Error("itemOrder contains duplicate IDs.");
    inputIds.add(e.id);
    if (!activeIdSet.has(e.id)) throw new Error(`Item ${e.id} does not exist in this section or has been deleted.`);
  }

  if (activeIdSet.size !== inputIds.size) {
    throw new Error("itemOrder must include all active items in the section.");
  }

  const orderWithVersions = itemOrder.map((e: Record<string, unknown>) => {
    const itemId = e.id as string;
    const expectedVer = typeof e.version === "number" && Number.isInteger(e.version) && e.version >= 1 ? e.version : 0;
    const currentVersion = activeVersionMap.get(itemId);
    if (expectedVer !== currentVersion) {
      throw new MutationConflictError("Version conflict. The section has been modified since you loaded it.");
    }
    return { id: itemId, version: expectedVer };
  });

  const changes = await applyAtomicReorder(sectionId, orderWithVersions, actorEmail);
  if (changes !== itemOrder.length) {
    throw new MutationConflictError("Version conflict. The section has been modified since you loaded it.");
  }

  await audit(actorEmail, "GALLERY_ITEMS_REORDERED", "GallerySection", sectionId, `Reordered ${itemOrder.length} items via revision approval`);
  return { outcome: "APPLIED" as const };
}
