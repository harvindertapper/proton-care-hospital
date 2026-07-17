"use client";

import { useState } from "react";
import { Search, Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";

type StatusData = {
  status: string;
  department_name: string;
  requested_date: string;
  requested_time: string;
  created_at: string;
};

export default function StatusClient() {
  const [requestId, setRequestId] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<StatusData | null>(null);

  async function checkStatus(e: React.FormEvent) {
    e.preventDefault();
    const id = requestId.trim();
    const phone = phoneLast4.trim();
    if (!id || !phone) return;
    
    if (!id.startsWith("PCH-")) {
      setError("Invalid format. ID should start with PCH- (e.g. PCH-2026-XXXXXX)");
      return;
    }

    if (!/^\d{4}$/.test(phone)) {
      setError("Verification failed. Please provide exactly 4 digits of your phone number.");
      return;
    }

    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch("/api/appointments/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, phoneLast4: phone })
      });
      const json = (await res.json()) as { error?: string; data?: StatusData };

      if (!res.ok) {
        throw new Error(json.error || "Failed to fetch status");
      }

      setData(json.data ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  function getStatusIcon(status: string) {
    const s = String(status || "").toUpperCase();
    switch (s) {
      case "CONFIRMED":
      case "APPROVED":
        return <CheckCircle2 size={32} color="#0d9488" />;
      case "CANCELLED":
      case "REJECTED":
        return <XCircle size={32} color="#be123c" />;
      case "CLOSED":
      case "COMPLETED":
        return <CheckCircle2 size={32} color="#0284c7" />;
      case "CONTACTED":
        return <Clock size={32} color="#d97706" />;
      case "NEW":
      case "PENDING":
      default:
        return <Clock size={32} color="#d97706" />;
    }
  }

  return (
    <div style={{ background: "white", padding: 42, borderRadius: 16, boxShadow: "var(--shadow-premium)", border: "1px solid var(--line)" }}>
      <h1 style={{ fontSize: 32, margin: "0 0 8px", color: "var(--navy)" }}>Track Appointment</h1>
      <p style={{ color: "var(--muted)", marginBottom: 32 }}>
        Enter your Request ID and the last 4 digits of your registered phone number to verify and check real-time status.
      </p>

      <form onSubmit={checkStatus} style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label htmlFor="requestId" style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
              Request ID
            </label>
            <input
              id="requestId"
              type="text"
              required
              placeholder="PCH-2026-XXXXXX"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value.toUpperCase())}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 16 }}
            />
          </div>
          <div style={{ width: 180, flexGrow: 1 }}>
            <label htmlFor="phoneLast4" style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
              Last 4 Digits of Phone
            </label>
            <input
              id="phoneLast4"
              type="text"
              required
              maxLength={4}
              placeholder="e.g. 5678"
              value={phoneLast4}
              onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, ""))}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 16 }}
            />
          </div>
        </div>
        <button type="submit" className="button primary" disabled={loading} style={{ width: "100%", padding: "14px", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : <><Search size={18} /> Check Status</>}
        </button>
      </form>

      {error && (
        <div style={{ padding: 16, background: "#ffe5e8", color: "#be123c", borderRadius: 8, display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <div style={{ marginTop: 24, padding: 32, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid var(--line)" }}>
            {getStatusIcon(data.status)}
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: 22, textTransform: "capitalize" }}>{data.status.toLowerCase()}</h3>
              <span style={{ color: "var(--muted)", fontSize: 14 }}>
                Requested on {new Date(data.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <strong style={{ display: "block", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Department</strong>
              <span style={{ fontSize: 18, color: "var(--ink)", fontWeight: 500 }}>{data.department_name}</span>
            </div>
            <div style={{ display: "flex", gap: 32 }}>
              <div>
                <strong style={{ display: "block", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Date</strong>
                <span style={{ fontSize: 16 }}>{data.requested_date}</span>
              </div>
              <div>
                <strong style={{ display: "block", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Time</strong>
                <span style={{ fontSize: 16 }}>{data.requested_time}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
            {(data.status === "APPROVED" || data.status === "CONFIRMED") && (
              <p style={{ margin: 0, color: "var(--green)", fontWeight: 500 }}>Your appointment is confirmed. Please arrive 15 minutes early at the reception.</p>
            )}
            {data.status === "CONTACTED" && (
              <p style={{ margin: 0, color: "var(--muted)", fontWeight: 500 }}>Our hospital team has reached out to you. Please check your calls or messages.</p>
            )}
            {(data.status === "PENDING" || data.status === "NEW") && (
              <p style={{ margin: 0, color: "var(--muted)" }}>Your request is currently under review. Our staff will confirm it shortly.</p>
            )}
            {(data.status === "REJECTED" || data.status === "CANCELLED") && (
              <p style={{ margin: 0, color: "var(--danger)" }}>We couldn&apos;t accommodate this slot. Please request a new appointment or call us.</p>
            )}
            {(data.status === "COMPLETED" || data.status === "CLOSED") && (
              <p style={{ margin: 0, color: "var(--blue)", fontWeight: 500 }}>This appointment has been completed. Thank you for visiting Protone Care Hospital.</p>
            )}
          </div>
        </div>
      )}
      
      <div style={{ marginTop: 32, textAlign: "center" }}>
        <Link href="/appointment" style={{ color: "var(--blue)", fontWeight: 600, textDecoration: "underline" }}>
          Request a new appointment
        </Link>
      </div>
    </div>
  );
}
