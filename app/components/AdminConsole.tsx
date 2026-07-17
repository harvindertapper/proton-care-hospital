"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Clock3,
  Eye,
  EyeOff,
  FileText,
  LogOut,
  Newspaper,
  ShieldCheck,
  Stethoscope,
  Upload,
  UserCog,
  Video,
} from "lucide-react";
import type { Department, Doctor } from "@/app/lib/data";
import { slugify } from "@/app/lib/utils";

type AdminSession = {
  email: string;
  role: "SUPER_ADMIN" | "STAFF";
  csrf: string;
  sessionId: string;
  mustChangePassword: boolean;
};

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
  media: Record<string, string | number | null>[];
  audits: Record<string, string | number | null>[];
  sessions: Record<string, string | number | null>[];
  staff: Record<string, string | number | null>[];
  closures: Record<string, string | number | null>[];
};

const tabs = [
  "Dashboard",
  "Appointments",
  "Department Timings",
  "Doctors",
  "Media",
  "Approvals",
  "Blogs",
  "Careers",
  "Reviews",
  "Videos",
  "Messages",
  "Security",
  "Staff Management",
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

async function uploadAdminMedia(csrf: string, formData: FormData) {
  const response = await fetch("/api/admin/media", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: formData,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error || "Media upload failed."));
  return data;
}

async function deleteAdminMedia(csrf: string, id: string) {
  const response = await fetch(`/api/admin/media?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf },
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error || "Media deletion failed."));
  return data;
}

function cell(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Forgot Password Wizard States
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<"request" | "verify">("request");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const text = await response.text().catch(() => "");
      if (!response.ok) {
        console.error(`Login failed with status ${response.status}. Response: ${text}`);
        let errMsg = `Login failed (Status ${response.status}).`;
        try {
          const data = JSON.parse(text);
          if (data.error) errMsg = data.error;
        } catch {}
        throw new Error(errMsg);
      }
      const data = JSON.parse(text) as Record<string, unknown>;
      window.location.href = data.passwordChangeRequired ? "/admin/change-password" : "/admin";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitForgotRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request", email }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error || "Failed to send reset code."));
      setInfoMessage(String(data.message || "Verification code sent to your email."));
      setForgotStep("verify");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitForgotVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify", email, otp, newPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error || "Reset failed."));
      setInfoMessage(String(data.message || "Password updated. Please login."));
      setForgotMode(false);
      setForgotStep("request");
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  if (forgotMode) {
    if (forgotStep === "request") {
      return (
        <form className="admin-login-card" onSubmit={submitForgotRequest}>
          <div>
            <button type="button" className="admin-back-btn" onClick={() => setForgotMode(false)}>
              ← Back to Login
            </button>
            <h1>Reset Password</h1>
            <p>Enter your email to receive a reset verification code</p>
          </div>
          <label>
            Email Address
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
          </label>
          <button className="button primary full" type="submit" disabled={busy}>
            Send Verification Code
          </button>
          {message ? <p className="admin-error">{message}</p> : null}
        </form>
      );
    }

    return (
      <form className="admin-login-card" onSubmit={submitForgotVerify}>
        <div>
          <button type="button" className="admin-back-btn" onClick={() => setForgotStep("request")}>
            ← Change Email
          </button>
          <h1>Reset Password</h1>
          <p>Verify code and set your new password</p>
        </div>
        {infoMessage ? <div className="admin-info-alert">{infoMessage}</div> : null}
        <label>
          Verification Code
          <input value={otp} onChange={(event) => setOtp(event.target.value)} type="text" placeholder="6-digit code" required maxLength={6} />
        </label>
        <label>
          New Password (min 15 chars)
          <div className="password-input-container">
            <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type={showNewPassword ? "text" : "password"} required minLength={15} maxLength={128} />
            <button type="button" className="password-toggle-btn" onClick={() => setShowNewPassword(!showNewPassword)}>
              {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        <label>
          Confirm New Password
          <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showNewPassword ? "text" : "password"} required minLength={15} maxLength={128} />
        </label>
        <button className="button primary full" type="submit" disabled={busy}>
          Reset Password
        </button>
        {message ? <p className="admin-error">{message}</p> : null}
      </form>
    );
  }

  return (
    <form className="admin-login-card" onSubmit={submitLogin}>
      <div>
        <span className="admin-mark"><ShieldCheck size={24} aria-hidden="true" /></span>
        <h1>Admin Sign In</h1>
        <p>Protected hospital operations console</p>
      </div>
      {infoMessage ? <div className="admin-info-alert">{infoMessage}</div> : null}
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required />
      </label>
      <label>
        Password
        <div className="password-input-container">
          <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" required />
          <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>
      <button type="button" className="forgot-password-link" onClick={() => {
        setForgotMode(true);
        setForgotStep("request");
        setMessage("");
        setInfoMessage("");
      }}>
        Forgot Password?
      </button>
      <button className="button primary full" type="submit" disabled={busy}>Sign in</button>
      {message ? <p className="admin-error">{message}</p> : null}
    </form>
  );
}

export function AdminErStatusForm({
  csrf,
  onMessage,
}: {
  csrf: string;
  onMessage?: (message: string) => void;
}) {
  const [form, setForm] = useState({ status: "Open", waitTime: "Under 10 mins" });
  const [message, setMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/er-status")
      .then((res) => res.json())
      .then((data: unknown) => {
        const d = data as { status?: string; waitTime?: string } | null;
        if (d && typeof d.status === "string") {
          setForm({ status: d.status, waitTime: d.waitTime || "" });
        }
      })
      .catch((err) => console.error("Failed to load initial ER status:", err));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/er-status", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify(form),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error || "Failed to update ER status."));
      setInfoMessage("Emergency room status updated successfully.");
      onMessage?.("Emergency room status updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update ER status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <label>
        ER Operational Status
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ width: "100%" }}>
          <option value="Open">Open & Operational</option>
          <option value="Busy">High Patient Load (Busy)</option>
          <option value="Diverting">Diverting to Alternative Facilities</option>
          <option value="Closed">Temporarily Closed</option>
        </select>
      </label>
      <label>
        Estimated Waiting Time
        <input type="text" value={form.waitTime} onChange={(e) => setForm({ ...form, waitTime: e.target.value })} placeholder="e.g. Under 10 mins, 45 mins" required style={{ width: "100%" }} />
      </label>
      <button className="button primary" disabled={busy} type="submit">Update ER Status</button>
      {message && <p style={{ color: "red", fontSize: 13, margin: "10px 0 0 0" }}>{message}</p>}
      {infoMessage && <p style={{ color: "green", fontSize: 13, margin: "10px 0 0 0" }}>{infoMessage}</p>}
    </form>
  );
}

export function AdminPasswordChangeForm({
  csrf,
  mandatory = false,
  onMessage,
}: {
  csrf: string;
  mandatory?: boolean;
  onMessage?: (message: string) => void;
}) {
  const [form, setForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "", otp: "" });
  const [message, setMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function showMessage(value: string) {
    setMessage(value);
    onMessage?.(value);
  }

  async function sendOtp() {
    setBusy(true);
    showMessage("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/admin/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ purpose: "change_password" }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error || "Failed to send code."));
      setInfoMessage("Verification code sent to your email.");
      setOtpSent(true);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Failed to send code.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      showMessage("New passwords do not match.");
      return;
    }
    if (form.newPassword.length < 15 || form.newPassword.length > 128) {
      showMessage("New password must be between 15 and 128 characters.");
      return;
    }
    if (!form.otp) {
      showMessage("Please request and enter a verification code.");
      return;
    }
    setBusy(true);
    showMessage("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ oldPassword: form.oldPassword, newPassword: form.newPassword, otp: form.otp }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error || "Failed to change password."));
      showMessage("Password changed. All sessions were revoked; please sign in again.");
      window.setTimeout(() => { window.location.href = "/admin/login"; }, 1200);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Password change failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420 }}>
      {mandatory ? <p>You must replace the temporary password before using the admin console.</p> : null}
      {infoMessage ? <div className="admin-info-alert">{infoMessage}</div> : null}
      <label>
        Current Password
        <div className="password-input-container">
          <input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={form.oldPassword} onChange={(event) => setForm({ ...form, oldPassword: event.target.value })} />
          <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>
      <label>
        New Password (min 15 chars)
        <input type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={15} maxLength={128} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} />
      </label>
      <label>
        Confirm New Password
        <input type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={15} maxLength={128} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
      </label>
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 8 }}>
          <label style={{ flex: 1, margin: 0 }}>
            Verification Code
            <input type="text" placeholder="6-digit code" required maxLength={6} value={form.otp} onChange={(event) => setForm({ ...form, otp: event.target.value })} />
          </label>
          <button type="button" className="button secondary" style={{ height: "42px" }} disabled={busy} onClick={sendOtp}>
            {otpSent ? "Resend Code" : "Send Code"}
          </button>
        </div>
      </div>
      <button type="submit" className="button primary" disabled={busy}>Update Password</button>
      {mandatory ? (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            await fetch("/api/admin/logout", { method: "POST", headers: { "x-csrf-token": csrf } });
            window.location.href = "/admin/login";
          }}
        >
          Sign out
        </button>
      ) : null}
      {message ? <p className={message.startsWith("Password changed") ? "admin-success" : "admin-error"}>{message}</p> : null}
    </form>
  );
}

export function AdminEmailChangeForm({
  csrf,
  onMessage,
}: {
  csrf: string;
  onMessage?: (message: string) => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  function showMessage(value: string) {
    setMessage(value);
    onMessage?.(value);
  }

  async function sendOtp() {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
      showMessage("Please enter a valid new email address.");
      return;
    }
    setBusy(true);
    showMessage("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/admin/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ purpose: "change_email", newEmail }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error || "Failed to send verification code."));
      setInfoMessage("Verification code sent to your current email address.");
      setOtpSent(true);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Failed to send code.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otp) {
      showMessage("Verification code is required.");
      return;
    }
    setBusy(true);
    showMessage("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/admin/data", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ action: "account.changeEmail", otp }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error || "Failed to update email."));
      showMessage("Email address changed successfully. Please sign in again.");
      window.setTimeout(() => { window.location.href = "/admin/login"; }, 1200);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Email change failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420 }}>
      {infoMessage ? <div className="admin-info-alert">{infoMessage}</div> : null}
      <label>
        New Email Address
        <input type="email" placeholder="newemail@domain.com" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} disabled={otpSent} />
      </label>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 8 }}>
        <label style={{ flex: 1, margin: 0 }}>
          Verification Code (sent to current email)
          <input type="text" placeholder="6-digit code" required maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value)} />
        </label>
        <button type="button" className="button secondary" style={{ height: "42px" }} disabled={busy} onClick={sendOtp}>
          {otpSent ? "Resend Code" : "Send Code"}
        </button>
      </div>
      {otpSent ? (
        <button type="button" className="admin-back-btn" style={{ marginTop: -8 }} onClick={() => {
          setOtpSent(false);
          setOtp("");
          setInfoMessage("");
          setMessage("");
        }}>
          ← Change Email Address
        </button>
      ) : null}
      <button type="submit" className="button primary" disabled={busy || !otpSent}>Update Email Address</button>
      {message ? <p className={message.startsWith("Email address changed") ? "admin-success" : "admin-error"}>{message}</p> : null}
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
  const [adminData, setAdminData] = useState(data);
  const [active, setActive] = useState("Dashboard");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Record<string, string | number | null> | null>(null);
  const [editForm, setEditForm] = useState({ requestedDate: "", requestedTime: "", internalNotes: "", status: "" });
  const [appointmentsView, setAppointmentsView] = useState<"LIST" | "DAY">("LIST");
  const [appointmentsDate, setAppointmentsDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [appointmentsDept, setAppointmentsDept] = useState("ALL");
  const [selectedRevision, setSelectedRevision] = useState<Record<string, string | number | null> | null>(null);
  const [revisionEditPayload, setRevisionEditPayload] = useState("");
  const [revisionError, setRevisionError] = useState("");
  const [staffForm, setStaffForm] = useState({ email: "", name: "", password: "", confirmPassword: "" });

  const [apptSearch, setApptSearch] = useState("");
  const [apptDeptFilter, setApptDeptFilter] = useState("ALL");
  const [apptStatusFilter, setApptStatusFilter] = useState("ALL");
  const [apptDateFilter, setApptDateFilter] = useState("");
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInForm, setWalkInForm] = useState({
    patientName: "",
    phone: "",
    email: "",
    departmentSlug: departments[0]?.slug || "",
    requestedDate: new Date().toISOString().split("T")[0],
    requestedTime: "09:00",
    concern: "",
    status: "CONFIRMED"
  });

  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyForm, setReplyForm] = useState({
    contactId: "",
    recipientEmail: "",
    subject: "Reply from Protone Care Hospital",
    replyText: "",
  });

  const [closureForm, setClosureForm] = useState({
    departmentSlug: departments[0]?.slug || "",
    closedDate: new Date().toISOString().split("T")[0],
    reason: ""
  });

  const [auditSearch, setAuditSearch] = useState("");

  function openTriage(row: Record<string, string | number | null>) {
    setSelectedAppointment(row);
    setEditForm({
      requestedDate: String(row.requested_date || ""),
      requestedTime: String(row.requested_time || ""),
      internalNotes: String(row.internal_notes || ""),
      status: String(row.status || ""),
    });
  }

  async function refreshData(silent = false) {
    if (!silent) setBusy(true);
    try {
      const response = await fetch("/api/admin/data?action=REFRESH");
      const resJson = (await response.json()) as { success?: boolean; data?: AdminData };
      if (resJson.success && resJson.data) {
        setAdminData(resJson.data);
      }
    } catch (err) {
      console.error("Failed to refresh data", err);
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      refreshData(true);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const filteredAppointments = useMemo(() => {
    return adminData.appointments.filter((app) => {
      const q = apptSearch.toLowerCase().trim();
      const nameMatch = String(app.patient_name || "").toLowerCase().includes(q);
      const phoneMatch = String(app.phone || "").toLowerCase().includes(q);
      const idMatch = String(app.request_id || "").toLowerCase().includes(q);
      const queryMatch = q ? (nameMatch || phoneMatch || idMatch) : true;

      const deptMatch = apptDeptFilter === "ALL" ? true : String(app.department_name) === apptDeptFilter;
      
      const s = String(app.status || "").toUpperCase();
      let matchesStatus = true;
      if (apptStatusFilter !== "ALL") {
        if (apptStatusFilter === "PENDING") {
          matchesStatus = (s === "PENDING" || s === "NEW");
        } else if (apptStatusFilter === "CONFIRMED") {
          matchesStatus = (s === "CONFIRMED" || s === "APPROVED");
        } else if (apptStatusFilter === "CANCELLED") {
          matchesStatus = (s === "CANCELLED" || s === "REJECTED");
        } else if (apptStatusFilter === "CLOSED") {
          matchesStatus = (s === "CLOSED" || s === "COMPLETED");
        } else {
          matchesStatus = (s === apptStatusFilter);
        }
      }

      const dateMatch = apptDateFilter ? String(app.requested_date) === apptDateFilter : true;

      return queryMatch && deptMatch && matchesStatus && dateMatch;
    });
  }, [adminData.appointments, apptSearch, apptDeptFilter, apptStatusFilter, apptDateFilter]);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const todayAppointments = adminData.appointments.filter((a) => a.requested_date === todayStr);
    
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let completedCount = 0;
    adminData.appointments.forEach((a) => {
      const s = String(a.status || "").toUpperCase();
      if (s === "PENDING" || s === "NEW" || s === "CONTACTED") pendingCount++;
      else if (s === "APPROVED" || s === "CONFIRMED") approvedCount++;
      else if (s === "REJECTED" || s === "CANCELLED") rejectedCount++;
      else if (s === "COMPLETED" || s === "CLOSED") completedCount++;
    });
    
    const totalAppointments = adminData.appointments.length;
    const pendingPct = totalAppointments ? Math.round((pendingCount / totalAppointments) * 100) : 0;
    const approvedPct = totalAppointments ? Math.round((approvedCount / totalAppointments) * 100) : 0;
    const rejectedPct = totalAppointments ? Math.round((rejectedCount / totalAppointments) * 100) : 0;
    const completedPct = totalAppointments ? Math.round((completedCount / totalAppointments) * 100) : 0;
    
    return {
      cards: [
        { label: "Today's Appointments", value: todayAppointments.length, icon: Clock3 },
        { label: "Pending Appointments", value: pendingCount, icon: ShieldCheck },
        { label: "Total Doctors", value: adminData.doctors.length, icon: Stethoscope },
        { label: "Unread Messages", value: adminData.contacts.filter((item) => item.status === "NEW").length, icon: FileText },
      ],
      breakdown: { pendingCount, approvedCount, rejectedCount, completedCount, pendingPct, approvedPct, rejectedPct, completedPct, totalAppointments },
      recentAudits: adminData.audits.slice(0, 10)
    };
  }, [adminData]);

  async function mutate(payload: Record<string, unknown>, successText: string) {
    setBusy(true);
    setNotice("");
    try {
      await postAdmin(session.csrf, payload);
      setNotice(successText);
      await refreshData(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadMedia(formData: FormData) {
    setBusy(true);
    setNotice("");
    try {
      const uploadRes = await uploadAdminMedia(session.csrf, formData);
      setNotice("Media uploaded successfully.");
      await refreshData(true);
      return String(uploadRes.url || "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Media upload failed.");
      return "";
    } finally {
      setBusy(false);
    }
  }

  async function deleteMedia(id: string) {
    if (!window.confirm("Are you sure you want to permanently delete this media asset?")) return;
    setBusy(true);
    setNotice("");
    try {
      await deleteAdminMedia(session.csrf, id);
      setNotice("Media deleted successfully.");
      await refreshData(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Media deletion failed.");
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
          {tabs.filter(tab => {
            if (tab === "Staff Management") return session.role === "SUPER_ADMIN";
            return true;
          }).map((tab) => (
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
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {/* Stat Cards */}
            <div className="admin-grid stats">
              {stats.cards.map((stat) => {
                const Icon = stat.icon;
                return (
                  <article className="admin-stat" key={stat.label} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 24, background: "white", borderRadius: 12, border: "1px solid var(--border)", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted)" }}>
                      <Icon size={20} aria-hidden="true" />
                      <span style={{ fontSize: 14, fontWeight: 500, textTransform: "uppercase" }}>{stat.label}</span>
                    </div>
                    <strong style={{ fontSize: 32, color: "var(--navy)", lineHeight: 1 }}>{stat.value}</strong>
                  </article>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
              {/* Status Breakdown (Simple Bar Chart instead of heavy SVG for now) */}
              <div style={{ padding: 24, background: "white", borderRadius: 12, border: "1px solid var(--border)" }}>
                <h3 style={{ margin: "0 0 20px 0", fontSize: 18 }}>Appointment Status</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 14 }}>
                      <span>Pending ({stats.breakdown.pendingCount})</span>
                      <strong>{stats.breakdown.pendingPct}%</strong>
                    </div>
                    <div style={{ height: 8, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#d97706", width: `${stats.breakdown.pendingPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 14 }}>
                      <span>Approved ({stats.breakdown.approvedCount})</span>
                      <strong>{stats.breakdown.approvedPct}%</strong>
                    </div>
                    <div style={{ height: 8, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#0d9488", width: `${stats.breakdown.approvedPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 14 }}>
                      <span>Rejected ({stats.breakdown.rejectedCount})</span>
                      <strong>{stats.breakdown.rejectedPct}%</strong>
                    </div>
                    <div style={{ height: 8, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#be123c", width: `${stats.breakdown.rejectedPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 14 }}>
                      <span>Completed ({stats.breakdown.completedCount})</span>
                      <strong>{stats.breakdown.completedPct}%</strong>
                    </div>
                    <div style={{ height: 8, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#0284c7", width: `${stats.breakdown.completedPct}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div style={{ padding: 24, background: "white", borderRadius: 12, border: "1px solid var(--border)" }}>
                <h3 style={{ margin: "0 0 20px 0", fontSize: 18 }}>Recent Activity</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {stats.recentAudits.length ? stats.recentAudits.map((audit) => (
                    <div key={audit.id} style={{ display: "flex", gap: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                      <div style={{ padding: 8, background: "var(--soft)", borderRadius: 8, height: "fit-content" }}>
                        <ShieldCheck size={16} color="var(--muted)" />
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px 0", fontSize: 14 }}>
                          <strong>{String(audit.actor_email || audit.admin_email || "system")}</strong>{" "}
                          {String(audit.action || "activity").toLowerCase().replace(/_/g, " ")} on {String(audit.entity_type || audit.table_name || "record")}
                        </p>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                          {new Date(String(audit.created_at)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )) : (
                    <div className="admin-empty">No recent activity found.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {active === "Appointments" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "white", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <select value={appointmentsView} onChange={(e) => setAppointmentsView(e.target.value === "DAY" ? "DAY" : "LIST")} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <option value="LIST">List View</option>
                    <option value="DAY">Day View</option>
                  </select>
                  <button className="button primary" onClick={() => {
                    setWalkInForm({
                      patientName: "",
                      phone: "",
                      email: "",
                      departmentSlug: departments[0]?.slug || "",
                      requestedDate: new Date().toISOString().split("T")[0],
                      requestedTime: "09:00",
                      concern: "",
                      status: "CONFIRMED"
                    });
                    setShowWalkInModal(true);
                  }}>
                    Book Walk-In
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {session.role === "SUPER_ADMIN" ? (
                    <a href="/api/admin/export-csv" className="button secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Export CSV
                    </a>
                  ) : null}
                </div>
              </div>

              {appointmentsView === "LIST" ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 12 }}>
                  <input type="text" placeholder="Search by name, phone, or ID..." value={apptSearch} onChange={(e) => setApptSearch(e.target.value)} style={{ flex: 2, minWidth: 200, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)" }} />
                  <select value={apptDeptFilter} onChange={(e) => setApptDeptFilter(e.target.value)} style={{ flex: 1, minWidth: 150, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <option value="ALL">All Departments</option>
                    {departments.map(d => <option key={d.slug} value={d.name}>{d.name}</option>)}
                  </select>
                  <select value={apptStatusFilter} onChange={(e) => setApptStatusFilter(e.target.value)} style={{ flex: 1, minWidth: 150, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">Pending / New</option>
                    <option value="CONTACTED">Contacted</option>
                    <option value="CONFIRMED">Confirmed / Approved</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="CLOSED">Completed / Closed</option>
                  </select>
                  <input type="date" value={apptDateFilter} onChange={(e) => setApptDateFilter(e.target.value)} style={{ flex: 1, minWidth: 150, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)" }} />
                  { (apptSearch || apptDeptFilter !== "ALL" || apptStatusFilter !== "ALL" || apptDateFilter) && (
                    <button className="button subtle" onClick={() => {
                      setApptSearch("");
                      setApptDeptFilter("ALL");
                      setApptStatusFilter("ALL");
                      setApptDateFilter("");
                    }}>Clear Filters</button>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 12, alignItems: "center", borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 12 }}>
                  <input type="date" value={appointmentsDate} onChange={(e) => setAppointmentsDate(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)" }} />
                  <select value={appointmentsDept} onChange={(e) => setAppointmentsDept(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <option value="ALL">All Departments</option>
                    {departments.map(d => <option key={d.slug} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {appointmentsView === "LIST" ? (
              <DataTable
                rows={filteredAppointments}
                columns={["request_id", "patient_name", "phone", "department_name", "requested_date", "requested_time", "status", "created_at"]}
                actions={(row) => (
                  <div className="table-actions">
                    <button disabled={busy} onClick={() => mutate({ action: "appointment.status", id: row.id, status: "CONTACTED" }, "Appointment marked contacted.")}>
                      Contacted
                    </button>
                    <button disabled={busy} onClick={() => mutate({ action: "appointment.status", id: row.id, status: "CONFIRMED" }, "Appointment marked confirmed by staff.")}>
                      Confirmed
                    </button>
                    <button disabled={busy} onClick={() => mutate({ action: "appointment.status", id: row.id, status: "CANCELLED" }, "Appointment marked cancelled.")}>
                      Cancelled
                    </button>
                    <button disabled={busy} onClick={() => mutate({ action: "appointment.status", id: row.id, status: "CLOSED" }, "Appointment marked completed.")}>
                      Completed
                    </button>
                  </div>
                )}
                onRowClick={openTriage}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {adminData.appointments
                  .filter(a => a.requested_date === appointmentsDate)
                  .filter(a => appointmentsDept === "ALL" || a.department_name === appointmentsDept)
                  .sort((a, b) => String(a.requested_time || "").localeCompare(String(b.requested_time || "")))
                  .map(app => (
                    <div key={String(app.id)} style={{ display: "flex", alignItems: "flex-start", gap: 24, padding: 24, background: "white", borderRadius: 12, border: "1px solid var(--border)", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                      <div style={{ width: 100, flexShrink: 0, textAlign: "right" }}>
                        <strong style={{ fontSize: 18, color: "var(--navy)" }}>{app.requested_time}</strong>
                        <div style={{ marginTop: 4 }}>
                          <span style={{ 
                            padding: "4px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: app.status === "CONFIRMED" || app.status === "APPROVED" ? "#ccfbf1" : app.status === "NEW" || app.status === "PENDING" || app.status === "CONTACTED" ? "#fef3c7" : app.status === "CANCELLED" || app.status === "REJECTED" ? "#ffe4e6" : "#f3f4f6",
                            color: app.status === "CONFIRMED" || app.status === "APPROVED" ? "#0f766e" : app.status === "NEW" || app.status === "PENDING" || app.status === "CONTACTED" ? "#b45309" : app.status === "CANCELLED" || app.status === "REJECTED" ? "#be123c" : "#374151"
                          }}>
                            {app.status}
                          </span>
                        </div>
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: "0 0 8px 0", fontSize: 18 }}>{app.patient_name}</h4>
                        <div style={{ display: "flex", gap: 16, fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>
                          <span>{app.phone}</span>
                          <span>|</span>
                          <span>{app.department_name}</span>
                          <span>|</span>
                          <span>ID: {app.request_id}</span>
                        </div>
                        {app.concern && (
                          <p style={{ margin: "0 0 16px 0", fontSize: 14, padding: 12, background: "var(--soft)", borderRadius: 8 }}>
                            {String(app.concern)}
                          </p>
                        )}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="button secondary" onClick={() => openTriage(app)}>Triage / Edit</button>
                          <button className="button secondary" disabled={busy} onClick={() => mutate({ action: "appointment.status", id: app.id, status: "CONTACTED" }, "Appointment marked contacted.")}>Contacted</button>
                          <button className="button secondary" disabled={busy} onClick={() => mutate({ action: "appointment.status", id: app.id, status: "CONFIRMED" }, "Appointment confirmed.")}>Confirm</button>
                          <button className="button secondary" disabled={busy} onClick={() => mutate({ action: "appointment.status", id: app.id, status: "CANCELLED" }, "Appointment cancelled.")}>Cancel</button>
                          <button className="button secondary" disabled={busy} onClick={() => mutate({ action: "appointment.status", id: app.id, status: "CLOSED" }, "Appointment marked completed.")}>Completed</button>
                        </div>
                      </div>
                    </div>
                ))}
                
                {adminData.appointments.filter(a => a.requested_date === appointmentsDate && (appointmentsDept === "ALL" || a.department_name === appointmentsDept)).length === 0 && (
                  <div className="admin-empty">No appointments scheduled for {appointmentsDate} {appointmentsDept !== "ALL" ? `in ${appointmentsDept}` : ""}.</div>
                )}
              </div>
            )}
          </div>
        ) : null}

        {active === "Department Timings" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <div>
              <h2 style={{ margin: "0 0 16px 0", fontSize: 20 }}>Department Weekly Timings</h2>
              <TimingManager rows={adminData.timings} departments={departments} busy={busy} onSave={(payload) => mutate({ action: "timing.upsert", payload }, "Timing saved or sent for approval.")} />
            </div>

            <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "16px 0" }} />

            <div style={{ background: "white", padding: 24, borderRadius: 12, border: "1px solid var(--border)" }}>
              <h2 style={{ margin: "0 0 20px 0", fontSize: 20 }}>Department Holiday Closures</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
                <form className="admin-form" onSubmit={(e) => {
                  e.preventDefault();
                  mutate({ action: "closure.add", departmentSlug: closureForm.departmentSlug, closedDate: closureForm.closedDate, reason: closureForm.reason }, "Holiday closure added.");
                  setClosureForm(curr => ({ ...curr, reason: "" }));
                }}>
                  <label>
                    Department
                    <select value={closureForm.departmentSlug} onChange={(e) => setClosureForm({ ...closureForm, departmentSlug: e.target.value })}>
                      {departments.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Date
                    <input type="date" value={closureForm.closedDate} onChange={(e) => setClosureForm({ ...closureForm, closedDate: e.target.value })} required />
                  </label>
                  <label>
                    Reason / Occasion (e.g. Diwali, Independence Day)
                    <input type="text" placeholder="e.g. Diwali Holiday" value={closureForm.reason} onChange={(e) => setClosureForm({ ...closureForm, reason: e.target.value })} />
                  </label>
                  <button className="button primary" type="submit" disabled={busy}>Add Closure</button>
                </form>

                <div>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 16 }}>Registered Closures</h3>
                  <DataTable
                    rows={adminData.closures || []}
                    columns={["department_slug", "closed_date", "reason"]}
                    actions={(row) => (
                      <div className="table-actions">
                        <button className="button secondary small" disabled={busy} onClick={() => mutate({ action: "closure.delete", id: row.id }, "Closure deleted.")}>
                          Delete
                        </button>
                      </div>
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {active === "Doctors" ? (
          <DoctorManager
            rows={adminData.doctors}
            departments={departments}
            staticDoctors={staticDoctors}
            busy={busy}
            onSave={(payload) => mutate({ action: "doctor.save", payload }, "Doctor profile saved or sent for approval.")}
            onDelete={(slug) => mutate({ action: "doctor.delete", slug }, "Doctor deleted successfully.")}
            onUpload={uploadMedia}
          />
        ) : null}

        {active === "Media" ? <MediaManager busy={busy} rows={adminData.media} onUpload={uploadMedia} onDelete={deleteMedia} /> : null}

        {active === "Approvals" ? (
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <DataTable
                rows={adminData.revisions}
                columns={["entity_type", "title", "proposed_by", "status", "created_at"]}
                actions={(row) => (
                  <div className="table-actions">
                    <button disabled={busy || session.role !== "SUPER_ADMIN" || row.status !== "NEEDS_REVIEW"} onClick={() => mutate({ action: "revision.review", revisionId: row.id, decision: "APPROVED" }, "Revision approved.")}>
                      Approve
                    </button>
                    <button disabled={busy || session.role !== "SUPER_ADMIN" || row.status !== "NEEDS_REVIEW"} onClick={() => mutate({ action: "revision.review", revisionId: row.id, decision: "REJECTED" }, "Revision rejected.")}>
                      Reject
                    </button>
                  </div>
                )}
                onRowClick={(row) => {
                  setSelectedRevision(row);
                  try {
                    const parsed = JSON.parse(String(row.payload_json || "{}"));
                    setRevisionEditPayload(JSON.stringify(parsed.payload || {}, null, 2));
                    setRevisionError("");
                  } catch {
                    setRevisionEditPayload(String(row.payload_json || ""));
                  }
                }}
              />
            </div>
            {selectedRevision && (
              <div style={{ width: 400, background: "white", padding: 24, borderRadius: 12, border: "1px solid var(--border)", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Review Change</h3>
                  <button className="button secondary small" onClick={() => setSelectedRevision(null)}>Close</button>
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  <span><strong>Entity:</strong> {selectedRevision.entity_type} ({selectedRevision.entity_id})</span>
                  <span><strong>Title:</strong> {selectedRevision.title}</span>
                  <span><strong>Proposed By:</strong> {selectedRevision.proposed_by}</span>
                  <span><strong>Status:</strong> {selectedRevision.status}</span>
                </div>
                {selectedRevision.status === "NEEDS_REVIEW" && session.role === "SUPER_ADMIN" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <span style={{ fontWeight: 500, fontSize: 13, color: "var(--muted)" }}>Parsed Changes:</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 6, maxHeight: 180, overflowY: "auto", marginTop: 4, marginBottom: 12 }}>
                        {(() => {
                          try {
                            const parsed = JSON.parse(revisionEditPayload);
                            const action = parsed.action || "";
                            const payloadObj = parsed.payload || parsed;
                            return (
                              <>
                                <div style={{ fontSize: 12, borderBottom: "1px solid var(--border)", paddingBottom: 4, marginBottom: 4 }}>
                                  <strong>Action:</strong> <code style={{ background: "#eaeaea", padding: "2px 4px", borderRadius: 4 }}>{String(action)}</code>
                                </div>
                                {Object.entries(payloadObj).map(([key, val]) => (
                                  <div key={key} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", gap: 8, paddingBottom: 4 }}>
                                    <span style={{ fontWeight: 600, color: "var(--muted)" }}>{key}:</span>
                                    <span style={{ color: "#334155", textAlign: "right", wordBreak: "break-all" }}>{String(val)}</span>
                                  </div>
                                ))}
                              </>
                            );
                          } catch {
                            return <span style={{ color: "red", fontSize: 12 }}>Could not parse payload for diff preview.</span>;
                          }
                        })()}
                      </div>
                    </div>

                    <label style={{ fontWeight: 500, fontSize: 14 }}>
                      Edit Raw Payload JSON
                      <textarea
                        rows={8}
                        value={revisionEditPayload}
                        onChange={(e) => {
                          setRevisionEditPayload(e.target.value);
                          try {
                            JSON.parse(e.target.value);
                            setRevisionError("");
                          } catch {
                            setRevisionError("Invalid JSON structure");
                          }
                        }}
                        style={{ width: "100%", fontFamily: "monospace", fontSize: 12, padding: 8, border: `1px solid ${revisionError ? "red" : "var(--border)"}`, borderRadius: 6, marginTop: 4 }}
                      />
                    </label>
                    {revisionError && <span style={{ color: "red", fontSize: 12 }}>{revisionError}</span>}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        className="button primary"
                        disabled={busy || !!revisionError}
                        onClick={async () => {
                          try {
                            const parsedOriginal = JSON.parse(String(selectedRevision.payload_json || "{}"));
                            const parsedPayload = JSON.parse(revisionEditPayload);
                            const valResult = validatePayload(parsedOriginal.action || "", parsedPayload);
                            if (!valResult.ok) {
                              setRevisionError(valResult.error || "Invalid payload structure");
                              return;
                            }
                            await mutate({
                              action: "revision.review",
                              revisionId: selectedRevision.id,
                              decision: "APPROVED",
                              modifiedPayload: parsedPayload,
                            }, "Revision approved with changes.");
                            setSelectedRevision(null);
                          } catch {
                            setRevisionError("Failed to parse JSON for submission");
                          }
                        }}
                        style={{ flex: 1 }}
                      >
                        Approve with Changes
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={async () => {
                          await mutate({
                            action: "revision.review",
                            revisionId: selectedRevision.id,
                            decision: "REJECTED",
                          }, "Revision rejected.");
                          setSelectedRevision(null);
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h4 style={{ margin: "0 0 6px 0", fontSize: 14 }}>Payload JSON</h4>
                    <pre style={{ background: "var(--soft)", padding: 12, borderRadius: 6, fontSize: 11, overflowX: "auto", margin: 0 }}>
                      {revisionEditPayload}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        {active === "Blogs" ? (
          <BlogForm
            busy={busy}
            onSave={(payload) => mutate({ action: "blog.save", payload }, "Blog saved or sent for approval.")}
            onVisibility={(slug, isVisible) => mutate({ action: "blog.visibility", payload: { slug, isVisible } }, isVisible ? "Blog shown publicly." : "Blog hidden from public site.")}
            onDelete={(slug) => mutate({ action: "blog.delete", slug }, "Blog deleted successfully.")}
            rows={adminData.blogs}
          />
        ) : null}
        {active === "Careers" ? (
          <CareerForm
            busy={busy}
            onSave={(payload) => mutate({ action: "career.save", payload }, "Job saved or sent for approval.")}
            onVisibility={(slug, isVisible) => mutate({ action: "career.visibility", payload: { slug, isVisible } }, isVisible ? "Job shown publicly." : "Job hidden from public site.")}
            onDelete={(slug) => mutate({ action: "career.delete", slug }, "Job listing deleted successfully.")}
            rows={adminData.jobs}
          />
        ) : null}
        {active === "Videos" ? (
          <VideoForm
            busy={busy}
            onSave={(payload) => mutate({ action: "video.save", payload }, "Patient video saved or sent for approval.")}
            onVisibility={(id, isVisible) => mutate({ action: "video.visibility", payload: { id, isVisible } }, isVisible ? "Video shown publicly." : "Video hidden from public site.")}
            onDelete={(id) => mutate({ action: "video.delete", id }, "Video deleted successfully.")}
            rows={adminData.videos}
          />
        ) : null}

        {active === "Reviews" ? (
          <DataTable
            rows={adminData.feedback}
            columns={["patient_name", "rating", "message", "status", "is_visible", "created_at"]}
            actions={(row) => (
              <div className="table-actions">
                <button disabled={busy} onClick={() => mutate({ action: "feedback.visibility", id: row.id, isVisible: 1 }, "Feedback approved for public display.")}>
                  Approve Display
                </button>
                <button disabled={busy} onClick={() => mutate({ action: "feedback.visibility", id: row.id, isVisible: 0 }, "Feedback hidden from public display.")}>
                  <EyeOff size={15} aria-hidden="true" /> Hide
                </button>
              </div>
            )}
          />
        ) : null}

        {active === "Messages" ? (
          <DataTable
            rows={adminData.contacts}
            columns={["name", "phone", "email", "subject", "message", "status", "created_at"]}
            actions={(row) => (
              <div className="table-actions">
                <button disabled={busy} onClick={() => {
                  setReplyForm({
                    contactId: String(row.id),
                    recipientEmail: String(row.email),
                    subject: `Re: ${String(row.subject || "Your inquiry to Protone Care Hospital")}`,
                    replyText: "",
                  });
                  setShowReplyModal(true);
                }}>
                  Reply Email
                </button>
                <button disabled={busy} onClick={() => mutate({ action: "contact.status", id: row.id, status: "CONTACTED" }, "Message marked contacted.")}>Contacted</button>
                <button disabled={busy} onClick={() => mutate({ action: "contact.status", id: row.id, status: "CLOSED" }, "Message closed.")}>Closed</button>
              </div>
            )}
          />
        ) : null}
        {active === "Security" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <div style={{ background: "white", padding: 32, borderRadius: 12, border: "1px solid var(--border)" }}>
              <h3 style={{ margin: "0 0 20px 0", fontSize: 20 }}>Emergency Room Status</h3>
              <AdminErStatusForm csrf={session.csrf} onMessage={setNotice} />
            </div>

            <div style={{ background: "white", padding: 32, borderRadius: 12, border: "1px solid var(--border)" }}>
              <h3 style={{ margin: "0 0 20px 0", fontSize: 20 }}>Change Password</h3>
              <AdminPasswordChangeForm csrf={session.csrf} onMessage={setNotice} />
            </div>

            <div style={{ background: "white", padding: 32, borderRadius: 12, border: "1px solid var(--border)" }}>
              <h3 style={{ margin: "0 0 20px 0", fontSize: 20 }}>Change Email Address</h3>
              <AdminEmailChangeForm csrf={session.csrf} onMessage={setNotice} />
            </div>

            <div style={{ background: "white", padding: 32, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 20 }}>Active Sessions</h3>
                <button 
                  className="button secondary" 
                  disabled={busy || adminData.sessions.length <= 1}
                  onClick={() => {
                    if (window.confirm("Revoke all other sessions?")) {
                      mutate({ action: "REVOKE_ALL_SESSIONS" }, "All other sessions revoked.");
                    }
                  }}
                >
                  Revoke All Others
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {adminData.sessions.map((sess) => (
                  <div key={sess.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, background: "var(--soft)", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div>
                      <p style={{ margin: "0 0 4px 0", fontWeight: 500 }}>
                        Session {sess.id === session.sessionId ? "(Current Session)" : ""}
                      </p>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>
                        Created: {new Date(String(sess.created_at)).toLocaleString()} | Expires: {new Date(Number(sess.expires_at)).toLocaleString()}
                      </span>
                    </div>
                    {sess.id !== session.sessionId && (
                      <button 
                        className="button secondary" 
                        disabled={busy}
                        onClick={() => mutate({ action: "REVOKE_SESSION", id: sess.id }, "Session revoked.")}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {active === "Staff Management" && session.role === "SUPER_ADMIN" ? (
          <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
            <div style={{ flex: 1, background: "white", padding: 32, borderRadius: 12, border: "1px solid var(--border)" }}>
              <h3 style={{ margin: "0 0 20px 0", fontSize: 20 }}>Staff Directory</h3>
              <DataTable
                rows={adminData.staff}
                columns={["name", "email", "status", "password_status", "created_at"]}
                actions={(row) => (
                  <div className="table-actions">
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => {
                        const isActive = row.is_active === 1 || row.is_active === "1";
                        if (window.confirm(`${isActive ? "Deactivate" : "Reactivate"} staff member ${row.name}?`)) {
                          mutate(
                            { action: "staff.setActive", id: row.id, active: !isActive },
                            `Staff member ${isActive ? "deactivated" : "reactivated"}.`,
                          );
                        }
                      }}
                    >
                      {row.is_active === 1 || row.is_active === "1" ? "Deactivate" : "Reactivate"}
                    </button>
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => {
                        const tempPass = window.prompt(`Enter a new temporary password for ${row.name}:`);
                        if (tempPass && tempPass.trim().length >= 15) {
                          mutate(
                            { action: "staff.resetPassword", id: row.id, newPassword: tempPass.trim() },
                            `Temporary password set for ${row.name}. They will be prompted to change it at login.`
                          );
                        } else if (tempPass) {
                          alert("Security Policy Error: Temporary password must be at least 15 characters long.");
                        }
                      }}
                    >
                      Reset Password
                    </button>
                  </div>
                )}
              />
            </div>

            <div style={{ width: 350, background: "white", padding: 32, borderRadius: 12, border: "1px solid var(--border)", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
              <h3 style={{ margin: "0 0 20px 0", fontSize: 20 }}>Add New Staff</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (staffForm.password !== staffForm.confirmPassword) {
                    setNotice("Temporary passwords do not match.");
                    return;
                  }
                  mutate({
                    action: "staff.add",
                    email: staffForm.email,
                    name: staffForm.name,
                    password: staffForm.password
                  }, "New staff account created.");
                  setStaffForm({ email: "", name: "", password: "", confirmPassword: "" });
                }}
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                <label>
                  Full Name
                  <input type="text" required value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, marginTop: 4 }} />
                </label>
                <label>
                  Email Address
                  <input type="email" required value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, marginTop: 4 }} />
                </label>
                <label>
                  Temporary Password
                  <input type="password" required minLength={15} maxLength={128} value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, marginTop: 4 }} />
                </label>
                <label>
                  Confirm Temporary Password
                  <input type="password" required minLength={15} maxLength={128} value={staffForm.confirmPassword} onChange={(e) => setStaffForm({ ...staffForm, confirmPassword: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, marginTop: 4 }} />
                </label>
                <button type="submit" className="button primary full" disabled={busy || staffForm.password !== staffForm.confirmPassword} style={{ marginTop: 8 }}>
                  Create Staff Account
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {active === "Audit Logs" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <div style={{ background: "white", padding: 16, borderRadius: 12, border: "1px solid var(--border)", display: "flex", gap: 12 }}>
              <input 
                type="text" 
                placeholder="Filter logs by actor email, action, entity type, ID..." 
                value={auditSearch} 
                onChange={(e) => setAuditSearch(e.target.value)} 
                style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)" }} 
              />
              {auditSearch && (
                <button className="button subtle" onClick={() => setAuditSearch("")}>Clear</button>
              )}
            </div>
            <DataTable 
              rows={adminData.audits.filter(log => {
                const q = auditSearch.toLowerCase().trim();
                if (!q) return true;
                return (
                  String(log.actor_email || "").toLowerCase().includes(q) ||
                  String(log.action || "").toLowerCase().includes(q) ||
                  String(log.entity_type || "").toLowerCase().includes(q) ||
                  String(log.entity_id || "").toLowerCase().includes(q) ||
                  String(log.details || "").toLowerCase().includes(q)
                );
              })} 
              columns={["actor_email", "action", "entity_type", "entity_id", "details", "created_at"]} 
            />
          </div>
        ) : null}
      </div>

      {selectedAppointment ? (
        <div className="admin-drawer-overlay" onClick={() => setSelectedAppointment(null)} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "end", zIndex: 1000 }}>
          <div className="admin-drawer" onClick={(e) => e.stopPropagation()} style={{ width: "min(450px, 100%)", background: "#fff", height: "100dvh", maxHeight: "100dvh", padding: 24, overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Triage & Reschedule</h2>
              <button className="button subtle" onClick={() => setSelectedAppointment(null)}>Close</button>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 15, borderBottom: "1px solid var(--border)" }}>
              <strong>Request ID: {selectedAppointment.request_id}</strong>
              <span>Patient: {selectedAppointment.patient_name}</span>
              <span>Phone: {selectedAppointment.phone}</span>
              <span>Email: {selectedAppointment.email}</span>
              <span>Dept: {selectedAppointment.department_name}</span>
              <span>Created: {selectedAppointment.created_at}</span>
            </div>

            <div>
              <h4 style={{ margin: "0 0 6px 0" }}>Patient Concern / Reason for Visit</h4>
              <p style={{ padding: 12, background: "#f3f4f6", borderRadius: 6, margin: 0, fontSize: 14 }}>
                {String(selectedAppointment.concern || "")}
              </p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <a href={`tel:${selectedAppointment.phone}`} className="button secondary" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none" }}>
                Call Patient
              </a>
              <a href={`https://wa.me/91${selectedAppointment.phone}?text=${encodeURIComponent(`Hello ${selectedAppointment.patient_name}, this is Protone Care Hospital. We received your appointment request for ${selectedAppointment.department_name} on ${selectedAppointment.requested_date} at ${selectedAppointment.requested_time}. Please confirm if this works for you.`)}`} target="_blank" rel="noopener noreferrer" className="button secondary" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none" }}>
                WhatsApp Msg
              </a>
            </div>

            <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "10px 0" }} />

            <form onSubmit={(e) => {
              e.preventDefault();
              mutate({
                action: "appointment.status",
                id: selectedAppointment.id,
                status: editForm.status,
                requestedDate: editForm.requestedDate,
                requestedTime: editForm.requestedTime,
                internalNotes: editForm.internalNotes,
              }, "Appointment details updated.");
              setSelectedAppointment(null);
            }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label>
                Appointment Status
                <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, marginTop: 4 }}>
                  <option value="NEW">New / Pending Review</option>
                  <option value="CONTACTED">Patient Contacted</option>
                  <option value="CONFIRMED">Confirmed / Approved</option>
                  <option value="CANCELLED">Cancelled / Rejected</option>
                  <option value="CLOSED">Completed / Closed</option>
                </select>
              </label>

              <label>
                Reschedule Date
                <input type="date" value={editForm.requestedDate} onChange={(e) => setEditForm({ ...editForm, requestedDate: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, marginTop: 4 }} />
              </label>

              <label>
                Reschedule Time Slot
                <input type="text" value={editForm.requestedTime} onChange={(e) => setEditForm({ ...editForm, requestedTime: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, marginTop: 4 }} />
              </label>

              <label>
                Internal Notes
                <textarea rows={3} value={editForm.internalNotes} onChange={(e) => setEditForm({ ...editForm, internalNotes: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, marginTop: 4 }} />
              </label>

              <button className="button primary full" type="submit" disabled={busy}>
                Save & Reschedule
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showWalkInModal && (
        <div className="admin-drawer-overlay" onClick={() => setShowWalkInModal(false)} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="admin-drawer" onClick={(e) => e.stopPropagation()} style={{ width: "min(500px, 90%)", background: "#fff", padding: 24, borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", gap: 18, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Book Walk-In Appointment</h2>
              <button className="button subtle" onClick={() => setShowWalkInModal(false)}>Close</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              await mutate({
                action: "appointment.create",
                patientName: walkInForm.patientName,
                phone: walkInForm.phone,
                email: walkInForm.email,
                departmentSlug: walkInForm.departmentSlug,
                requestedDate: walkInForm.requestedDate,
                requestedTime: walkInForm.requestedTime,
                concern: walkInForm.concern,
                status: walkInForm.status
              }, "Walk-in appointment booked successfully.");
              setShowWalkInModal(false);
            }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label>
                Patient Full Name *
                <input type="text" value={walkInForm.patientName} onChange={(e) => setWalkInForm({ ...walkInForm, patientName: e.target.value })} required style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  Phone Number *
                  <input type="text" placeholder="e.g. 9876543210" value={walkInForm.phone} onChange={(e) => setWalkInForm({ ...walkInForm, phone: e.target.value })} required style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }} />
                </label>
                <label>
                  Email Address
                  <input type="email" placeholder="Optional" value={walkInForm.email} onChange={(e) => setWalkInForm({ ...walkInForm, email: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }} />
                </label>
              </div>
              <label>
                Department *
                <select value={walkInForm.departmentSlug} onChange={(e) => setWalkInForm({ ...walkInForm, departmentSlug: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}>
                  {departments.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
                </select>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  Booking Date *
                  <input type="date" value={walkInForm.requestedDate} onChange={(e) => setWalkInForm({ ...walkInForm, requestedDate: e.target.value })} required style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }} />
                </label>
                <label>
                  Time Slot *
                  <input type="text" placeholder="e.g. 10:30 AM" value={walkInForm.requestedTime} onChange={(e) => setWalkInForm({ ...walkInForm, requestedTime: e.target.value })} required style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }} />
                </label>
              </div>
              <label>
                Patient Concern / Notes
                <textarea rows={3} placeholder="Reason for walk-in consultation..." value={walkInForm.concern} onChange={(e) => setWalkInForm({ ...walkInForm, concern: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }} />
              </label>
              <label>
                Initial Status
                <select value={walkInForm.status} onChange={(e) => setWalkInForm({ ...walkInForm, status: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}>
                  <option value="CONFIRMED">Confirmed / Scheduled</option>
                  <option value="CONTACTED">Contacted / Pending Confirmation</option>
                </select>
              </label>
              <button className="button primary full" type="submit" disabled={busy} style={{ marginTop: 8 }}>
                Create Appointment
              </button>
            </form>
          </div>
        </div>
      )}

      {showReplyModal && (
        <div className="admin-drawer-overlay" onClick={() => setShowReplyModal(false)} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="admin-drawer" onClick={(e) => e.stopPropagation()} style={{ width: "min(550px, 90%)", background: "#fff", padding: 24, borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Send Email Response</h2>
              <button className="button subtle" onClick={() => setShowReplyModal(false)}>Close</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setNotice("");
              try {
                const response = await fetch("/api/admin/reply-email", {
                  method: "POST",
                  headers: { "content-type": "application/json", "x-csrf-token": session.csrf },
                  body: JSON.stringify(replyForm),
                });
                const data = (await response.json()) as { error?: string };
                if (!response.ok) throw new Error(data.error || "Failed to send reply email.");
                setNotice("Reply email sent successfully and message status updated.");
                setShowReplyModal(false);
                await refreshData(true);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Failed to send reply email.");
              } finally {
                setBusy(false);
              }
            }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label>
                To
                <input type="text" value={replyForm.recipientEmail} readOnly style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "#f3f4f6" }} />
              </label>
              <label>
                Subject
                <input type="text" value={replyForm.subject} onChange={(e) => setReplyForm({ ...replyForm, subject: e.target.value })} required style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }} />
              </label>
              <label>
                Email Message Body
                <textarea rows={8} placeholder="Type your response to the patient here..." value={replyForm.replyText} onChange={(e) => setReplyForm({ ...replyForm, replyText: e.target.value })} required style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }} />
              </label>
              <button className="button primary full" type="submit" disabled={busy}>
                Send Email Reply
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function DataTable({
  rows,
  columns,
  actions,
  onRowClick,
}: {
  rows: Record<string, string | number | null>[];
  columns: string[];
  actions?: (row: Record<string, string | number | null>) => ReactNode;
  onRowClick?: (row: Record<string, string | number | null>) => void;
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
            <tr key={String(row.id || index)} onClick={() => onRowClick?.(row)} style={{ cursor: onRowClick ? "pointer" : "default" }}>
              {columns.map((column) => {
                const val = row[column];
                if (column === "status" && typeof val === "string") {
                  const lower = val.toLowerCase();
                  return (
                    <td key={column}>
                      <span className="admin-badge" style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        backgroundColor: lower === "approved" || lower === "confirmed" ? "#d1fae5" : lower === "needs_review" || lower === "new" || lower === "pending" || lower === "contacted" ? "#fef3c7" : "#fee2e2",
                        color: lower === "approved" || lower === "confirmed" ? "#065f46" : lower === "needs_review" || lower === "new" || lower === "pending" || lower === "contacted" ? "#92400e" : "#991b1b"
                      }}>
                        {val.replace("_", " ")}
                      </span>
                    </td>
                  );
                }
                return <td key={column}>{cell(val)}</td>;
              })}
              {actions ? <td onClick={(event) => event.stopPropagation()}>{actions(row)}</td> : null}
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

function ImageCropUploader({
  onUpload,
  onComplete,
}: {
  onUpload: (formData: FormData) => Promise<string>;
  onComplete: (url: string) => void;
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotation, setRotation] = useState(0); // in degrees: 0, 90, 180, 270
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // When a file is selected
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setZoom(1);
        setOffsetX(0);
        setOffsetY(0);
        setRotation(0);
        setMessage("");
      };
      reader.readAsDataURL(file);
    }
  }

  // Draw image on canvas in real-time
  useEffect(() => {
    if (!imageSrc) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      // Move center of canvas to origin for rotation & zoom
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      // Draw the image centered
      // We want to scale the image to fill the canvas as base
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;

      ctx.drawImage(img, -iw / 2 + offsetX, -ih / 2 + offsetY, iw, ih);
      ctx.restore();
    };
  }, [imageSrc, zoom, offsetX, offsetY, rotation]);

  async function handleCropAndUpload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setUploading(true);
    setMessage("Optimizing & uploading...");
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error("Could not crop image.");
        }
        const file = new File([blob], "doctor-profile.webp", { type: "image/webp" });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", "doctor-upload");

        const url = await onUpload(formData);
        onComplete(url);
        setImageSrc(null); // Reset
        setMessage("Uploaded successfully!");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, "image/webp", 0.85);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ marginTop: 12, padding: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: "600", color: "#1e293b", marginBottom: 8 }}>
        📷 Crop & Upload Doctor Photo (R2 Gateway)
      </span>
      <input type="file" accept="image/*" onChange={onFileChange} ref={fileInputRef} style={{ fontSize: 12 }} />
      {imageSrc && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {/* Canvas for Preview */}
          <canvas
            ref={canvasRef}
            width={200}
            height={200}
            style={{ border: "2px solid #cbd5e1", borderRadius: "50%", background: "#f1f5f9", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
          />

          {/* Controls */}
          <div style={{ width: "105%", spaceY: 8 }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "#475569" }}>
              Zoom: {zoom.toFixed(1)}x
              <input
                type="range"
                min="1"
                max="4"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                style={{ width: "65%" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "#475569", marginTop: 6 }}>
              Move Horiz:
              <input
                type="range"
                min="-100"
                max="100"
                value={offsetX}
                onChange={(e) => setOffsetX(parseInt(e.target.value))}
                style={{ width: "65%" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "#475569", marginTop: 6 }}>
              Move Vert:
              <input
                type="range"
                min="-100"
                max="100"
                value={offsetY}
                onChange={(e) => setOffsetY(parseInt(e.target.value))}
                style={{ width: "65%" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
              <button
                type="button"
                className="button subtle small"
                onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                style={{ fontSize: 11, padding: "4px 8px" }}
              >
                Rotate Left
              </button>
              <button
                type="button"
                className="button subtle small"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                style={{ fontSize: 11, padding: "4px 8px" }}
              >
                Rotate Right
              </button>
            </div>
          </div>

          <button
            type="button"
            className="button primary small"
            onClick={handleCropAndUpload}
            disabled={uploading}
            style={{ width: "100%", marginTop: 8 }}
          >
            {uploading ? "Uploading to R2..." : "Crop & Set Photo"}
          </button>
        </div>
      )}
      {message && <div style={{ fontSize: 11, color: "#0d9488", marginTop: 6 }}>{message}</div>}
    </div>
  );
}

function DoctorManager({
  rows,
  departments,
  staticDoctors,
  busy,
  onSave,
  onDelete,
  onUpload,
}: {
  rows: Record<string, string | number | null>[];
  departments: Department[];
  staticDoctors: Doctor[];
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onDelete?: (slug: string) => void;
  onUpload?: (formData: FormData) => Promise<string>;
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
    blocked_dates: "",
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
    blockedDates: String(first?.blocked_dates || ""),
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
      blockedDates: String(row.blocked_dates || ""),
    });
  }

  return (
    <div className="admin-panel-grid">
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        {source.some(d => d.slug === form.slug && form.slug) && (
          <div style={{ background: "#e0f2fe", color: "#0369a1", padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span>✏️ Editing doctor profile: <strong>{form.name}</strong></span>
            <button type="button" className="button subtle small" style={{ padding: "4px 8px" }} onClick={() => setForm({
              slug: "",
              name: "",
              speciality: "",
              qualification: "",
              departmentSlug: departments[0]?.slug || "",
              photoUrl: "",
              profileNote: "",
              isVisible: "1",
              blockedDates: ""
            })}>
              Create New
            </button>
          </div>
        )}
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
        {onUpload && (
          <ImageCropUploader onUpload={onUpload} onComplete={(url) => setForm({ ...form, photoUrl: url })} />
        )}
        <label>Profile note<textarea rows={3} value={form.profileNote} onChange={(event) => setForm({ ...form, profileNote: event.target.value })} /></label>
        <label>Blocked Dates / Leaves (comma-separated, e.g. 2026-07-20,2026-07-21)<input placeholder="e.g. 2026-07-20,2026-07-21" value={form.blockedDates} onChange={(event) => setForm({ ...form, blockedDates: event.target.value })} /></label>
        <label className="checkbox-field">
          <input type="checkbox" checked={form.isVisible === "1"} onChange={(event) => setForm({ ...form, isVisible: event.target.checked ? "1" : "0" })} />
          <span>Visible on public doctors page after approval</span>
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="button primary" style={{ flex: 1 }} disabled={busy}><UserCog size={17} aria-hidden="true" /> Save Doctor</button>
          {form.slug && (
            <button
              type="button"
              className="button danger"
              style={{ background: "#e11d48", color: "white" }}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete ${form.name}?`)) {
                  onDelete?.(form.slug);
                }
              }}
            >
              Delete Doctor
            </button>
          )}
        </div>
      </form>
      <DataTable 
        rows={rows} 
        columns={["name", "speciality", "qualification", "department_slug", "status", "is_visible", "blocked_dates"]} 
        onRowClick={(row) => choose(String(row.slug))}
      />
    </div>
  );
}

function BlogForm({
  busy,
  onSave,
  onVisibility,
  onDelete,
  rows,
}: {
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onVisibility?: (slug: string, isVisible: number) => void;
  onDelete?: (slug: string) => void;
  rows: AdminData["blogs"];
}) {
  const [form, setForm] = useState({ title: "", slug: "", excerpt: "", body: "" });
  return (
    <div className="admin-panel-grid">
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, slug: form.slug || slugify(form.title) }); }}>
        {rows.some(b => b.slug === form.slug && form.slug) && (
          <div style={{ background: "#e0f2fe", color: "#0369a1", padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span>✏️ Editing blog post: <strong>{form.title}</strong></span>
            <button type="button" className="button subtle small" style={{ padding: "4px 8px" }} onClick={() => setForm({ title: "", slug: "", excerpt: "", body: "" })}>
              Create New
            </button>
          </div>
        )}
        <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value, slug: slugify(event.target.value) })} /></label>
        <label>Slug<input value={form.slug} onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })} /></label>
        <label>Excerpt<textarea rows={3} value={form.excerpt} onChange={(event) => setForm({ ...form, excerpt: event.target.value })} /></label>
        <label>Body<textarea rows={7} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="button primary" style={{ flex: 1 }} disabled={busy}><Newspaper size={17} aria-hidden="true" /> Save Blog</button>
          {form.slug && (
            <button
              type="button"
              className="button danger"
              style={{ background: "#e11d48", color: "white" }}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete the blog "${form.title}"?`)) {
                  onDelete?.(form.slug);
                }
              }}
            >
              Delete Blog
            </button>
          )}
        </div>
      </form>
      <DataTable
        rows={rows}
        columns={["title", "status", "is_visible", "created_at"]}
        onRowClick={(row) => setForm({
          title: String(row.title || ""),
          slug: String(row.slug || ""),
          excerpt: String(row.excerpt || ""),
          body: String(row.body || ""),
        })}
        actions={onVisibility ? (row) => (
          <div className="table-actions">
            <button
              disabled={busy || row.status !== "APPROVED"}
              onClick={() => onVisibility(String(row.slug), row.is_visible ? 0 : 1)}
            >
              {row.is_visible ? "Hide" : "Show"}
            </button>
          </div>
        ) : undefined}
      />
    </div>
  );
}

function CareerForm({
  busy,
  onSave,
  onVisibility,
  onDelete,
  rows,
}: {
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onVisibility?: (slug: string, isVisible: number) => void;
  onDelete?: (slug: string) => void;
  rows: AdminData["jobs"];
}) {
  const [form, setForm] = useState({ title: "", slug: "", department: "", employmentType: "Full-time", description: "" });
  return (
    <div className="admin-panel-grid">
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, slug: form.slug || slugify(form.title) }); }}>
        {rows.some(j => j.slug === form.slug && form.slug) && (
          <div style={{ background: "#e0f2fe", color: "#0369a1", padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span>✏️ Editing job listing: <strong>{form.title}</strong></span>
            <button type="button" className="button subtle small" style={{ padding: "4px 8px" }} onClick={() => setForm({ title: "", slug: "", department: "", employmentType: "Full-time", description: "" })}>
              Create New
            </button>
          </div>
        )}
        <label>Job title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value, slug: slugify(event.target.value) })} /></label>
        <label>Department<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
        <label>Employment type<input value={form.employmentType} onChange={(event) => setForm({ ...form, employmentType: event.target.value })} /></label>
        <label>Description<textarea rows={6} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="button primary" style={{ flex: 1 }} disabled={busy}><FileText size={17} aria-hidden="true" /> Save Job</button>
          {form.slug && (
            <button
              type="button"
              className="button danger"
              style={{ background: "#e11d48", color: "white" }}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete the job listing "${form.title}"?`)) {
                  onDelete?.(form.slug);
                }
              }}
            >
              Delete Job
            </button>
          )}
        </div>
      </form>
      <DataTable
        rows={rows}
        columns={["title", "department", "employment_type", "status", "is_visible", "created_at"]}
        onRowClick={(row) => setForm({
          title: String(row.title || ""),
          slug: String(row.slug || ""),
          department: String(row.department || ""),
          employmentType: String(row.employment_type || "Full-time"),
          description: String(row.description || ""),
        })}
        actions={onVisibility ? (row) => (
          <div className="table-actions">
            <button
              disabled={busy || row.status !== "APPROVED"}
              onClick={() => onVisibility(String(row.slug), row.is_visible ? 0 : 1)}
            >
              {row.is_visible ? "Hide" : "Show"}
            </button>
          </div>
        ) : undefined}
      />
    </div>
  );
}

function VideoForm({
  busy,
  onSave,
  onVisibility,
  onDelete,
  rows,
}: {
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onVisibility?: (id: string, isVisible: number) => void;
  onDelete?: (id: string) => void;
  rows: AdminData["videos"];
}) {
  const [form, setForm] = useState({ id: "", title: "", youtubeUrl: "", consentNote: "" });
  return (
    <div className="admin-panel-grid">
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        {form.id && (
          <div style={{ background: "#e0f2fe", color: "#0369a1", padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span>✏️ Editing video entry: <strong>{form.title}</strong></span>
            <button type="button" className="button subtle small" style={{ padding: "4px 8px" }} onClick={() => setForm({ id: "", title: "", youtubeUrl: "", consentNote: "" })}>
              Create New
            </button>
          </div>
        )}
        <label>Video title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>YouTube URL<input value={form.youtubeUrl} onChange={(event) => setForm({ ...form, youtubeUrl: event.target.value })} /></label>
        <label>Consent/source note<textarea rows={4} value={form.consentNote} onChange={(event) => setForm({ ...form, consentNote: event.target.value })} /></label>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="button primary" style={{ flex: 1 }} disabled={busy}><Video size={17} aria-hidden="true" /> Save Video</button>
          {form.id && (
            <button
              type="button"
              className="button danger"
              style={{ background: "#e11d48", color: "white" }}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete the video "${form.title}"?`)) {
                  onDelete?.(form.id);
                }
              }}
            >
              Delete Video
            </button>
          )}
        </div>
      </form>
      <DataTable
        rows={rows}
        columns={["title", "youtube_url", "status", "is_visible", "created_at"]}
        onRowClick={(row) => setForm({
          id: String(row.id || ""),
          title: String(row.title || ""),
          youtubeUrl: String(row.youtube_url || ""),
          consentNote: String(row.consent_note || ""),
        })}
        actions={onVisibility ? (row) => (
          <div className="table-actions">
            <button
              disabled={busy || row.status !== "APPROVED"}
              onClick={() => onVisibility(String(row.id), row.is_visible ? 0 : 1)}
            >
              {row.is_visible ? "Hide" : "Show"}
            </button>
          </div>
        ) : undefined}
      />
    </div>
  );
}

function MediaManager({
  busy,
  rows,
  onUpload,
  onDelete,
}: {
  busy: boolean;
  rows: Record<string, string | number | null>[];
  onUpload: (formData: FormData) => Promise<string>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("gallery");
  const [consentNote, setConsentNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const [selectedPurposeFilter, setSelectedPurposeFilter] = useState("ALL");

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMessage("Please select a file to upload.");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", purpose);
      formData.append("consentNote", consentNote);
      await onUpload(formData);
      setMessage("Media uploaded successfully!");
      setFile(null);
      setConsentNote("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="admin-panel-grid">
      <form className="admin-form" onSubmit={handleUpload}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: "600" }}>Upload New Media (R2 Gateway)</h3>
        <label>
          File
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} required style={{ marginTop: 4, width: "100%" }} />
        </label>
        <label>
          Purpose
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ marginTop: 4, width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}>
            <option value="gallery">Gallery (Public Photos Grid)</option>
            <option value="doctor-photo">Doctor Photo</option>
            <option value="admin-upload">General Admin Upload</option>
          </select>
        </label>
        <label>
          Consent Note / Metadata
          <textarea rows={3} value={consentNote} onChange={(e) => setConsentNote(e.target.value)} placeholder="Explain consent status or asset details" style={{ marginTop: 4, width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }} />
        </label>
        <button className="button primary full" type="submit" disabled={busy || uploading} style={{ marginTop: 8 }}>
          <Upload size={17} aria-hidden="true" /> {uploading ? "Uploading..." : "Upload Asset"}
        </button>
        {message ? (
          <p style={{ fontSize: "13px", fontWeight: "600", marginTop: 8, color: message.includes("successfully") ? "green" : "red" }}>
            {message}
          </p>
        ) : null}
      </form>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>R2 Uploaded Assets Directory</h3>
          <select value={selectedPurposeFilter} onChange={(e) => setSelectedPurposeFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13 }}>
            <option value="ALL">All Purposes</option>
            <option value="gallery">Gallery Only</option>
            <option value="doctor-photo">Doctor Photos Only</option>
            <option value="admin-upload">General Admin Uploads Only</option>
          </select>
        </div>
        <DataTable
          rows={rows.filter(r => selectedPurposeFilter === "ALL" || r.purpose === selectedPurposeFilter)}
          columns={["file_name", "r2_key", "purpose", "size_bytes", "status", "created_at"]}
          actions={(row) => (
            <div className="table-actions">
              <a href={`/api/media/${row.r2_key}`} target="_blank" rel="noopener noreferrer" className="button subtle small" style={{ display: "inline-flex", textDecoration: "none", alignItems: "center" }}>
                Open Preview
              </a>
              <button
                type="button"
                className="button subtle small"
                onClick={() => {
                  const url = `${window.location.origin}/api/media/${row.r2_key}`;
                  navigator.clipboard.writeText(url);
                  alert("Copied media URL to clipboard!");
                }}
              >
                Copy Link
              </button>
              <button 
                className="button secondary small"
                disabled={busy}
                onClick={() => onDelete(String(row.id))}
              >
                Delete
              </button>
            </div>
          )}
        />
      </div>
    </div>
  );
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
  }
  return { ok: true };
}
