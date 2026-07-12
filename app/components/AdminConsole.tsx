"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  CheckCircle2,
  Clock3,
  FileText,
  LogOut,
  Newspaper,
  ShieldCheck,
  Stethoscope,
  UserCog,
  Video,
  XCircle,
} from "lucide-react";
import type { Department, Doctor } from "@/app/lib/data";

type AdminSession = { email: string; role: "SUPER_ADMIN" | "STAFF"; csrf: string };

type AdminData = {
  appointments: Record<string, string | number | null>[];
  timings: Record<string, string | number | null>[];
  doctors: Record<string, string | number | null>[];
  revisions: Record<string, string | number | null>[];
  feedback: Record<string, string | number | null>[];
  contacts: Record<string, string | number | null>[];
  blogs: Record<string, string | number | null>[];
  jobs: Record<string, string | number | null>[];
  videos: Record<string, string | number | null>[];
  audits: Record<string, string | number | null>[];
};

const tabs = [
  "Dashboard",
  "Appointments",
  "Department Timings",
  "Doctors",
  "Approvals",
  "Blogs",
  "Careers",
  "Reviews",
  "Videos",
  "Messages",
  "Audit Logs",
];

async function postAdmin(csrf: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/admin/data", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error || "Admin action failed."));
  return data;
}

function cell(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error || "Login failed."));
      window.location.href = "/admin";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-login-card" onSubmit={submit}>
      <div>
        <span className="admin-mark"><ShieldCheck size={24} aria-hidden="true" /></span>
        <h1>Admin Sign In</h1>
        <p>Protected hospital operations console</p>
      </div>
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required />
      </label>
      <label>
        Password
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
      </label>
      <button className="button primary full" type="submit" disabled={busy}>Sign in</button>
      {message ? <p className="admin-error">{message}</p> : null}
    </form>
  );
}

export function AdminConsole({
  session,
  data,
  departments,
  staticDoctors,
}: {
  session: AdminSession;
  data: AdminData;
  departments: Department[];
  staticDoctors: Doctor[];
}) {
  const [active, setActive] = useState("Dashboard");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const stats = useMemo(
    () => [
      { label: "New appointments", value: data.appointments.filter((item) => item.status === "NEW").length, icon: Clock3 },
      { label: "Pending approvals", value: data.revisions.filter((item) => item.status === "NEEDS_REVIEW").length, icon: ShieldCheck },
      { label: "Visible doctors", value: data.doctors.filter((item) => Number(item.is_visible) === 1).length, icon: Stethoscope },
      { label: "Unread messages", value: data.contacts.filter((item) => item.status === "NEW").length, icon: FileText },
    ],
    [data],
  );

  async function mutate(payload: Record<string, unknown>, successText: string) {
    setBusy(true);
    setNotice("");
    try {
      await postAdmin(session.csrf, payload);
      setNotice(successText);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST", headers: { "x-csrf-token": session.csrf } });
    window.location.href = "/admin/login";
  }

  return (
    <section className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <ShieldCheck size={24} aria-hidden="true" />
          <strong>Protone Admin</strong>
          <span>{session.role.replace("_", " ")}</span>
        </div>
        <nav>
          {tabs.map((tab) => (
            <button className={active === tab ? "active" : ""} onClick={() => setActive(tab)} key={tab}>
              {tab}
            </button>
          ))}
        </nav>
        <button className="admin-logout" onClick={logout}>
          <LogOut size={17} aria-hidden="true" /> Sign out
        </button>
      </aside>

      <div className="admin-workspace">
        <header className="admin-top">
          <div>
            <span>{session.email}</span>
            <h1>{active}</h1>
          </div>
          <p>{session.role === "STAFF" ? "Staff edits are submitted to the super admin approval queue." : "Super admin changes can publish approved content."}</p>
        </header>
        {notice ? <div className="admin-notice">{notice} Refresh to see latest persisted rows.</div> : null}

        {active === "Dashboard" ? (
          <div className="admin-grid stats">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <article className="admin-stat" key={stat.label}>
                  <Icon size={22} aria-hidden="true" />
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </article>
              );
            })}
          </div>
        ) : null}

        {active === "Appointments" ? (
          <DataTable
            rows={data.appointments}
            columns={["request_id", "patient_name", "phone", "department_name", "requested_date", "requested_time", "status", "created_at"]}
            actions={(row) => (
              <div className="table-actions">
                <button disabled={busy} onClick={() => mutate({ action: "appointment.status", id: row.id, status: "CONTACTED" }, "Appointment marked contacted.")}>
                  Contacted
                </button>
                <button disabled={busy} onClick={() => mutate({ action: "appointment.status", id: row.id, status: "CONFIRMED" }, "Appointment marked confirmed by staff.")}>
                  Confirmed
                </button>
              </div>
            )}
          />
        ) : null}

        {active === "Department Timings" ? (
          <TimingManager rows={data.timings} departments={departments} busy={busy} onSave={(payload) => mutate({ action: "timing.upsert", payload }, "Timing saved or sent for approval.")} />
        ) : null}

        {active === "Doctors" ? (
          <DoctorManager rows={data.doctors} departments={departments} staticDoctors={staticDoctors} busy={busy} onSave={(payload) => mutate({ action: "doctor.save", payload }, "Doctor profile saved or sent for approval.")} />
        ) : null}

        {active === "Approvals" ? (
          <DataTable
            rows={data.revisions}
            columns={["entity_type", "title", "proposed_by", "status", "created_at"]}
            actions={(row) => (
              <div className="table-actions">
                <button disabled={busy || session.role !== "SUPER_ADMIN"} onClick={() => mutate({ action: "revision.review", revisionId: row.id, decision: "APPROVED" }, "Revision approved and public data updated.")}>
                  <CheckCircle2 size={15} aria-hidden="true" /> Approve
                </button>
                <button disabled={busy || session.role !== "SUPER_ADMIN"} onClick={() => mutate({ action: "revision.review", revisionId: row.id, decision: "REJECTED" }, "Revision rejected.")}>
                  <XCircle size={15} aria-hidden="true" /> Reject
                </button>
              </div>
            )}
          />
        ) : null}

        {active === "Blogs" ? <BlogForm busy={busy} onSave={(payload) => mutate({ action: "blog.save", payload }, "Blog saved or sent for approval.")} rows={data.blogs} /> : null}
        {active === "Careers" ? <CareerForm busy={busy} onSave={(payload) => mutate({ action: "career.save", payload }, "Job saved or sent for approval.")} rows={data.jobs} /> : null}
        {active === "Videos" ? <VideoForm busy={busy} onSave={(payload) => mutate({ action: "video.save", payload }, "Patient video saved or sent for approval.")} rows={data.videos} /> : null}

        {active === "Reviews" ? (
          <DataTable
            rows={data.feedback}
            columns={["patient_name", "rating", "message", "status", "is_visible", "created_at"]}
            actions={(row) => (
              <button disabled={busy} onClick={() => mutate({ action: "feedback.visibility", id: row.id, isVisible: 1 }, "Feedback approved for public display.")}>
                Approve Display
              </button>
            )}
          />
        ) : null}

        {active === "Messages" ? <DataTable rows={data.contacts} columns={["name", "phone", "email", "subject", "message", "status", "created_at"]} /> : null}
        {active === "Audit Logs" ? <DataTable rows={data.audits} columns={["actor_email", "action", "entity_type", "entity_id", "details", "created_at"]} /> : null}
      </div>
    </section>
  );
}

function DataTable({
  rows,
  columns,
  actions,
}: {
  rows: Record<string, string | number | null>[];
  columns: string[];
  actions?: (row: Record<string, string | number | null>) => ReactNode;
}) {
  if (!rows.length) return <div className="admin-empty">No rows yet.</div>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column.replaceAll("_", " ")}</th>
            ))}
            {actions ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id || index)}>
              {columns.map((column) => (
                <td key={column}>{cell(row[column])}</td>
              ))}
              {actions ? <td>{actions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimingManager({
  rows,
  departments,
  busy,
  onSave,
}: {
  rows: Record<string, string | number | null>[];
  departments: Department[];
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const first = rows[0];
  const [form, setForm] = useState({
    departmentSlug: String(first?.department_slug || departments[0]?.slug || ""),
    startTime: String(first?.start_time || "09:00"),
    endTime: String(first?.end_time || "18:00"),
    days: String(first?.days || "Mon-Sat"),
    slotGapMinutes: "15",
    isVisible: "1",
  });

  function choose(slug: string) {
    const row = rows.find((item) => item.department_slug === slug);
    setForm({
      departmentSlug: slug,
      startTime: String(row?.start_time || "09:00"),
      endTime: String(row?.end_time || "18:00"),
      days: String(row?.days || "Mon-Sat"),
      slotGapMinutes: String(row?.slot_gap_minutes || "15"),
      isVisible: String(row?.is_visible ?? "1"),
    });
  }

  return (
    <div className="admin-panel-grid">
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <label>
          Department
          <select value={form.departmentSlug} onChange={(event) => choose(event.target.value)}>
            {departments.map((item) => (
              <option key={item.slug} value={item.slug}>{item.name}</option>
            ))}
          </select>
        </label>
        <div className="two-fields">
          <label>Start<input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
          <label>End<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
        </div>
        <label>Days<input value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })} /></label>
        <label>Slot gap<input type="number" min="15" step="15" value={form.slotGapMinutes} onChange={(event) => setForm({ ...form, slotGapMinutes: event.target.value })} /></label>
        <label className="checkbox-field">
          <input type="checkbox" checked={form.isVisible === "1"} onChange={(event) => setForm({ ...form, isVisible: event.target.checked ? "1" : "0" })} />
          <span>Show department in appointment timing list</span>
        </label>
        <button className="button primary" disabled={busy}>Save Timing</button>
      </form>
      <DataTable rows={rows} columns={["department_name", "days", "start_time", "end_time", "slot_gap_minutes", "status", "is_visible"]} />
    </div>
  );
}

function DoctorManager({
  rows,
  departments,
  staticDoctors,
  busy,
  onSave,
}: {
  rows: Record<string, string | number | null>[];
  departments: Department[];
  staticDoctors: Doctor[];
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const source = rows.length ? rows : staticDoctors.map((item) => ({
    slug: item.slug,
    name: item.name,
    speciality: item.speciality,
    qualification: item.qualification || "",
    department_slug: item.departmentSlug,
    photo_url: item.photo || "",
    profile_note: "",
    is_visible: 1,
  }));
  const first = source[0];
  const [form, setForm] = useState({
    slug: String(first?.slug || ""),
    name: String(first?.name || ""),
    speciality: String(first?.speciality || ""),
    qualification: String(first?.qualification || ""),
    departmentSlug: String(first?.department_slug || departments[0]?.slug || ""),
    photoUrl: String(first?.photo_url || ""),
    profileNote: String(first?.profile_note || ""),
    isVisible: String(first?.is_visible ?? "1"),
  });

  function choose(slug: string) {
    const row = source.find((item) => item.slug === slug);
    if (!row) return;
    setForm({
      slug: String(row.slug || ""),
      name: String(row.name || ""),
      speciality: String(row.speciality || ""),
      qualification: String(row.qualification || ""),
      departmentSlug: String(row.department_slug || departments[0]?.slug || ""),
      photoUrl: String(row.photo_url || ""),
      profileNote: String(row.profile_note || ""),
      isVisible: String(row.is_visible ?? "1"),
    });
  }

  return (
    <div className="admin-panel-grid">
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <label>
          Existing doctor
          <select value={form.slug} onChange={(event) => choose(event.target.value)}>
            {source.map((item) => (
              <option value={String(item.slug)} key={String(item.slug)}>{String(item.name)}</option>
            ))}
          </select>
        </label>
        <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value, slug: form.slug || slugify(event.target.value) })} /></label>
        <label>Speciality<input value={form.speciality} onChange={(event) => setForm({ ...form, speciality: event.target.value })} /></label>
        <label>Qualification<input value={form.qualification} onChange={(event) => setForm({ ...form, qualification: event.target.value })} /></label>
        <label>
          Department
          <select value={form.departmentSlug} onChange={(event) => setForm({ ...form, departmentSlug: event.target.value })}>
            {departments.map((item) => (
              <option key={item.slug} value={item.slug}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>Photo URL or uploaded media URL<input value={form.photoUrl} onChange={(event) => setForm({ ...form, photoUrl: event.target.value })} /></label>
        <label>Profile note<textarea rows={3} value={form.profileNote} onChange={(event) => setForm({ ...form, profileNote: event.target.value })} /></label>
        <label className="checkbox-field">
          <input type="checkbox" checked={form.isVisible === "1"} onChange={(event) => setForm({ ...form, isVisible: event.target.checked ? "1" : "0" })} />
          <span>Visible on public doctors page after approval</span>
        </label>
        <button className="button primary" disabled={busy}><UserCog size={17} aria-hidden="true" /> Save Doctor</button>
      </form>
      <DataTable rows={rows} columns={["name", "speciality", "qualification", "department_slug", "status", "is_visible"]} />
    </div>
  );
}

function BlogForm({ busy, onSave, rows }: { busy: boolean; onSave: (payload: Record<string, unknown>) => void; rows: AdminData["blogs"] }) {
  const [form, setForm] = useState({ title: "", slug: "", excerpt: "", body: "" });
  return (
    <div className="admin-panel-grid">
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, slug: form.slug || slugify(form.title) }); }}>
        <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value, slug: slugify(event.target.value) })} /></label>
        <label>Slug<input value={form.slug} onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })} /></label>
        <label>Excerpt<textarea rows={3} value={form.excerpt} onChange={(event) => setForm({ ...form, excerpt: event.target.value })} /></label>
        <label>Body<textarea rows={7} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
        <button className="button primary" disabled={busy}><Newspaper size={17} aria-hidden="true" /> Save Blog</button>
      </form>
      <DataTable rows={rows} columns={["title", "status", "is_visible", "created_at"]} />
    </div>
  );
}

function CareerForm({ busy, onSave, rows }: { busy: boolean; onSave: (payload: Record<string, unknown>) => void; rows: AdminData["jobs"] }) {
  const [form, setForm] = useState({ title: "", slug: "", department: "", employmentType: "Full-time", description: "" });
  return (
    <div className="admin-panel-grid">
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, slug: form.slug || slugify(form.title) }); }}>
        <label>Job title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value, slug: slugify(event.target.value) })} /></label>
        <label>Department<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
        <label>Employment type<input value={form.employmentType} onChange={(event) => setForm({ ...form, employmentType: event.target.value })} /></label>
        <label>Description<textarea rows={6} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <button className="button primary" disabled={busy}><FileText size={17} aria-hidden="true" /> Save Job</button>
      </form>
      <DataTable rows={rows} columns={["title", "department", "employment_type", "status", "is_visible", "created_at"]} />
    </div>
  );
}

function VideoForm({ busy, onSave, rows }: { busy: boolean; onSave: (payload: Record<string, unknown>) => void; rows: AdminData["videos"] }) {
  const [form, setForm] = useState({ title: "", youtubeUrl: "", consentNote: "" });
  return (
    <div className="admin-panel-grid">
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <label>Video title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>YouTube URL<input value={form.youtubeUrl} onChange={(event) => setForm({ ...form, youtubeUrl: event.target.value })} /></label>
        <label>Consent/source note<textarea rows={4} value={form.consentNote} onChange={(event) => setForm({ ...form, consentNote: event.target.value })} /></label>
        <button className="button primary" disabled={busy}><Video size={17} aria-hidden="true" /> Save Video</button>
      </form>
      <DataTable rows={rows} columns={["title", "youtube_url", "status", "is_visible", "created_at"]} />
    </div>
  );
}
