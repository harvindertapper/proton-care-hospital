"use client";

import { useEffect, useMemo, useState, useCallback, useRef, type FormEvent } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
        retry?: "auto" | "never";
        "retry-interval"?: number;
        theme?: "auto" | "light" | "dark";
      }) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}
import { AlertCircle, CheckCircle2, LockKeyhole, MessageCircle, PhoneCall, Send, Sunrise, Sun, Trash2 } from "lucide-react";
import type { Department } from "@/app/lib/data";
import { consentText, emergencyNotice, hospital } from "@/app/lib/data";

// Draft persistence: localStorage (encrypted via cryptoStorage), 30-minute TTL.
// We do NOT auto-populate on mount — instead a banner offers Restore / Start fresh.
const DRAFT_TTL_MS = 30 * 60 * 1000;

type SlotsResponse = {
  departmentName?: string;
  timing?: { startTime: string; endTime: string; days: string; slotGapMinutes: number };
  slots?: string[];
  error?: string;
};

function todayIso() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function FieldMessage({ message, success }: { message: string; success?: boolean }) {
  if (!message) return null;
  return (
    <div className={success ? "form-message success" : "form-message"}>
      {success ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
      <span>{message}</span>
    </div>
  );
}

/** Non-intrusive banner shown when a non-expired draft is found on mount. */
function DraftBanner({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 14px",
        marginBottom: "14px",
        background: "var(--soft, #f1f5f9)",
        border: "1px solid var(--border, #e2e8f0)",
        borderRadius: "8px",
        fontSize: "13px",
        color: "var(--text, #1e293b)",
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: 1, minWidth: "160px" }}>We found an unsaved draft.</span>
      <button
        type="button"
        className="button primary"
        style={{ padding: "4px 12px", fontSize: "13px" }}
        onClick={onRestore}
      >
        Restore
      </button>
      <button
        type="button"
        className="button subtle"
        style={{ padding: "4px 12px", fontSize: "13px" }}
        onClick={onDiscard}
      >
        Start fresh
      </button>
    </div>
  );
}

function TurnstileBox({
  siteKey,
  onToken,
}: {
  siteKey?: string;
  onToken: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const autoRetryRef = useRef(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const renderWidget = useCallback(() => {
    if (!siteKey || !window.turnstile || !containerRef.current) return;
    if (widgetIdRef.current !== null) {
      try { window.turnstile.remove(widgetIdRef.current); } catch {}
      widgetIdRef.current = null;
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      retry: "never",
      callback: (token: string) => {
        autoRetryRef.current = 0;
        setStatus("ready");
        onToken(token);
      },
      "expired-callback": () => {
        onToken("");
        if (widgetIdRef.current !== null && window.turnstile) {
          try { window.turnstile.reset(widgetIdRef.current); } catch {}
        }
      },
      "error-callback": () => {
        onToken("");
        if (autoRetryRef.current < 2 && widgetIdRef.current !== null && window.turnstile) {
          autoRetryRef.current += 1;
          try { window.turnstile.reset(widgetIdRef.current); } catch {}
        } else {
          setStatus("error");
        }
      },
    });
  }, [siteKey, onToken]);

  useEffect(() => {
    if (!siteKey) {
      onToken("preview-turnstile");
      return;
    }
    let cancelled = false;
    const SCRIPT_SELECTOR = "script[data-pch-turnstile]";
    if (!document.querySelector(SCRIPT_SELECTOR)) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.pchTurnstile = "true";
      document.head.appendChild(script);
    }
    const start = Date.now();
    const timer = window.setInterval(() => {
      if (cancelled) return;
      if (window.turnstile && containerRef.current && widgetIdRef.current === null) {
        window.clearInterval(timer);
        renderWidget();
      } else if (Date.now() - start > 15000) {
        window.clearInterval(timer);
        if (widgetIdRef.current === null) setStatus("error");
      }
    }, 100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (widgetIdRef.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, onToken, renderWidget]);

  const manualRetry = useCallback(() => {
    autoRetryRef.current = 0;
    setStatus("ready");
    renderWidget();
  }, [renderWidget]);

  if (!siteKey) {
    return (
      <div className="turnstile-preview">
        <LockKeyhole size={18} aria-hidden="true" />
        Security verification active.
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="cf-turnstile-container" />
      {status === "error" ? (
        <p role="status" aria-live="polite" style={{ fontSize: "12px", marginTop: "6px" }}>
          Verification failed to load.{" "}
          <button
            type="button"
            className="button subtle"
            style={{ padding: "2px 10px", fontSize: "12px" }}
            onClick={manualRetry}
          >
            Retry
          </button>
        </p>
      ) : null}
    </div>
  );
}

async function postJson(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error || "Request failed. Please try again."));
  return data;
}

// ---------------------------------------------------------------------------
// AppointmentForm
// ---------------------------------------------------------------------------

export function AppointmentForm({
  departments,
  initialDepartment,
  turnstileSiteKey,
}: {
  departments: Department[];
  initialDepartment?: string;
  turnstileSiteKey?: string;
}) {
  const selectableDepartments = departments.filter((d) => d.slug !== "emergency-medicine");

  type AppointmentFormState = {
    patientName: string;
    phone: string;
    email: string;
    requestedDate: string;
    requestedTime: string;
    concern: string;
    consent: boolean;
    company: string;
  };

  const emptyForm: AppointmentFormState = {
    patientName: "",
    phone: "",
    email: "",
    requestedDate: todayIso(),
    requestedTime: "",
    concern: "",
    consent: false,
    company: "",
  };

  const [step, setStep] = useState(1);
  const [departmentSlug, setDepartmentSlug] = useState(initialDepartment || selectableDepartments[0]?.slug || "");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotError, setSlotError] = useState("");
  const [form, setForm] = useState<AppointmentFormState>(emptyForm);
  const [pendingDraft, setPendingDraft] = useState<{ form: AppointmentFormState; dept: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const department = useMemo(
    () => selectableDepartments.find((item) => item.slug === departmentSlug),
    [departmentSlug, selectableDepartments]
  );

  const { morningSlots, afternoonSlots } = useMemo(() => {
    const morning = slots.filter((s) => {
      const l = s.toLowerCase();
      if (l.includes("am")) return true;
      if (l.includes("pm")) return false;
      const hour = parseInt(s.split(":")[0], 10);
      return hour < 12;
    });
    const afternoon = slots.filter((s) => !morning.includes(s));
    return { morningSlots: morning, afternoonSlots: afternoon };
  }, [slots]);

  const [mounted] = useState(() => typeof window !== "undefined");

  const update = useCallback((name: keyof AppointmentFormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [name]: value }));
  }, []);

  // Idempotency key (not PII — keep 24h lifecycle as before)
  useEffect(() => {
    if (mounted) {
      import("@/app/lib/cryptoStorage").then((m) => {
        m.getAndDecrypt("pch_appointment_idempotency").then((savedKey) => {
          if (savedKey) {
            setIdempotencyKey(typeof savedKey === "string" ? savedKey : String(savedKey));
          } else {
            const newKey = crypto.randomUUID();
            setIdempotencyKey(newKey);
            m.encryptAndSave("pch_appointment_idempotency", newKey);
          }
        });
      });
    }
  }, [mounted, success]);

  // On mount: check for a non-expired draft but DO NOT auto-populate.
  // Instead surface a banner letting the user choose.
  useEffect(() => {
    import("@/app/lib/cryptoStorage").then((m) => {
      Promise.all([
        m.getAndDecrypt("pch_appointment_draft"),
        m.getAndDecrypt("pch_appointment_dept"),
      ]).then(([savedForm, savedDept]) => {
        // cryptoStorage.getAndDecrypt already enforces its own 24h TTL and
        // returns null for expired data. We additionally enforce the shorter
        // 30-min TTL by re-reading the raw timestamp from localStorage.
        const raw = typeof window !== "undefined" ? localStorage.getItem("pch_appointment_draft") : null;
        if (!raw || !savedForm) return;
        try {
          const parsed = JSON.parse(raw) as { iv: string; ciphertext: string };
          if (!parsed.iv) return; // malformed
        } catch {
          return;
        }
        // Timestamp is inside the encrypted payload; cryptoStorage decoded it.
        // We trust getAndDecrypt's 24h check. Now we apply our own 30-min check
        // via the stored timestamp inside the decrypted payload (not available
        // directly). We work around this: save a plain "draft_ts" companion key.
        const tsRaw = localStorage.getItem("pch_appointment_draft_ts");
        const ts = tsRaw ? Number(tsRaw) : null;
        if (ts !== null && Date.now() - ts > DRAFT_TTL_MS) {
          localStorage.removeItem("pch_appointment_draft");
          localStorage.removeItem("pch_appointment_dept");
          localStorage.removeItem("pch_appointment_draft_ts");
          return;
        }
        // Draft is valid — offer it via banner
        const draftForm = { ...emptyForm, ...(savedForm as Partial<AppointmentFormState>) };
        setPendingDraft({
          form: draftForm,
          dept: typeof savedDept === "string" ? savedDept : departmentSlug,
        });
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    setForm(pendingDraft.form);
    setDepartmentSlug(pendingDraft.dept);
    setPendingDraft(null);
  }, [pendingDraft]);

  const discardDraft = useCallback(() => {
    localStorage.removeItem("pch_appointment_draft");
    localStorage.removeItem("pch_appointment_dept");
    localStorage.removeItem("pch_appointment_draft_ts");
    setPendingDraft(null);
  }, []);

  const clearForm = useCallback(() => {
    setForm(emptyForm);
    setStep(1);
    localStorage.removeItem("pch_appointment_draft");
    localStorage.removeItem("pch_appointment_dept");
    localStorage.removeItem("pch_appointment_draft_ts");
    setPendingDraft(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on every change; write companion timestamp for 30-min TTL check.
  useEffect(() => {
    if (mounted) {
      import("@/app/lib/cryptoStorage").then((m) => {
        m.encryptAndSave("pch_appointment_draft", {
          patientName: form.patientName,
          phone: form.phone,
          email: form.email,
          requestedDate: form.requestedDate,
          requestedTime: form.requestedTime,
          concern: form.concern,
          consent: form.consent,
        });
        localStorage.setItem("pch_appointment_draft_ts", String(Date.now()));
      });
    }
  }, [form, mounted]);

  useEffect(() => {
    if (mounted) {
      import("@/app/lib/cryptoStorage").then((m) => {
        m.encryptAndSave("pch_appointment_dept", departmentSlug);
      });
    }
  }, [departmentSlug, mounted]);

  const isEmergency = departmentSlug === "emergency-medicine";
  const isUntimed = department && !department.timing;

  useEffect(() => {
    if (isUntimed) {
      if (form.requestedTime !== "Manual Allocation") {
        const timer = setTimeout(() => {
          update("requestedTime", "Manual Allocation");
        }, 0);
        return () => clearTimeout(timer);
      }
    } else if (form.requestedTime === "Manual Allocation") {
      const timer = setTimeout(() => {
        update("requestedTime", "");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isUntimed, form.requestedTime, update]);

  useEffect(() => {
    let cancelled = false;
    if (!departmentSlug || isEmergency || !form.requestedDate) return;
    fetch(`/api/department-slots?departmentSlug=${encodeURIComponent(departmentSlug)}&date=${encodeURIComponent(form.requestedDate)}`)
      .then((response) => response.json())
      .then((data: unknown) => {
        const d = data as SlotsResponse;
        if (cancelled) return;
        if (d.error) {
          setSlotError(d.error);
          setSlots([]);
        } else {
          setSlotError("");
          setSlots(d.slots || []);
        }
      })
      .catch(() => {
        if (!cancelled) setSlotError("Please call the hospital desk to confirm timing for this department.");
      });
    return () => {
      cancelled = true;
    };
  }, [departmentSlug, isEmergency, form.requestedDate]);

  function chooseDepartment(slug: string) {
    setSlots([]);
    setSlotError("");
    setForm((current) => ({ ...current, requestedTime: "" }));
    setStep(1);
    setDepartmentSlug(slug);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setSuccess(false);

    fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType: "booking_intent", path: window.location.pathname }),
    }).catch(() => {});

    try {
      const data = await postJson("/api/appointments", {
        ...form,
        departmentSlug,
        turnstileToken,
        idempotencyKey,
      });
      setSuccess(true);

      fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType: "booking_success", path: window.location.pathname }),
      }).catch(() => {});

      setMessage(`${data.message || "Your appointment request has been registered securely."} Reference ID: ${data.requestId || ""}`);
      setStep(1);
      setForm(emptyForm);
      setTurnstileToken("");
      setTurnstileNonce((n) => n + 1);
      // Clear draft on successful submit
      localStorage.removeItem("pch_appointment_draft");
      localStorage.removeItem("pch_appointment_dept");
      localStorage.removeItem("pch_appointment_draft_ts");
      localStorage.removeItem("pch_appointment_idempotency");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit appointment request.");
      setTurnstileToken("");
      setTurnstileNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  if (isEmergency) {
    return (
      <div className="flow-card emergency-block-card" style={{ borderColor: "#dc2626", borderLeftWidth: 4 }}>
        <div className="emergency-alert-banner" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#dc2626" }}>
            <AlertCircle size={32} />
            <h2 style={{ margin: 0 }}>Emergency Care Required / आपातकालीन देखभाल</h2>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.5 }}>
            For a life-threatening emergency, call <strong>112</strong> or go to the nearest emergency department immediately. / किसी आपातकालीन स्थिति में तुरंत 112 पर कॉल करें या निकटतम आपातकालीन विभाग में जाएं।
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 15 }}>
          <a href="tel:112" className="button primary call-button" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#dc2626", color: "white" }}>
            <PhoneCall size={20} /> Dial India Emergency: 112
          </a>
          <a href={hospital.phoneHref} className="button secondary call-button" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <PhoneCall size={20} /> Call Emergency Desk: {hospital.phone}
          </a>
          <a href={hospital.mapsUrl} target="_blank" rel="noopener noreferrer" className="button secondary map-button" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            Get Directions to Hospital / दिशा-निर्देश प्राप्त करें
          </a>
        </div>
        <button type="button" className="button subtle" style={{ marginTop: 15 }} onClick={() => chooseDepartment(selectableDepartments[0]?.slug || "")}>
          Choose another department / दूसरा विभाग चुनें
        </button>
      </div>
    );
  }

  return (
    <form className="flow-card appointment-flow" onSubmit={submit}>
      {pendingDraft ? (
        <DraftBanner onRestore={restoreDraft} onDiscard={discardDraft} />
      ) : null}

      <div className="flow-steps" aria-label="Appointment request steps">
        {[1, 2, 3].map((item) => {
          const stepNames = ["Department", "Patient Details", "Confirm"];
          return (
            <button
              type="button"
              className={step === item ? "active" : ""}
              key={item}
              onClick={() => setStep(item)}
              aria-label={`Step ${item}: ${stepNames[item - 1]}${step === item ? " (current)" : ""}`}
              aria-current={step === item ? "step" : undefined}
            >
              {item}
            </button>
          );
        })}
      </div>

      {step === 1 ? (
        <div className="form-section">
          <label>
            Department
            <select value={departmentSlug} onChange={(event) => chooseDepartment(event.target.value)} required>
              {selectableDepartments.map((item) => (
                <option value={item.slug} key={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {department ? <p className="field-hint">{department.hindi} · {department.summary}</p> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
            <label style={{ width: "100%" }}>
              Preferred date
              <input type="date" value={form.requestedDate} min={todayIso()} onChange={(event) => update("requestedDate", event.target.value)} required style={{ width: "100%" }} />
            </label>
            
            <div style={{ width: "100%" }}>
              <span style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "var(--text)", marginBottom: "8px" }}>
                Preferred time slot
              </span>
              {isUntimed ? (
                <div className="manual-allocation-notice">
                  <input type="text" value="Timing Confirmed by Desk" disabled className="disabled-input" style={{ width: "100%", padding: "8px 12px", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)" }} />
                  <p className="field-hint" style={{ marginTop: 4, fontSize: 12 }}>Our coordination desk will confirm your consultation timing window.</p>
                </div>
              ) : (
                <div className="space-y-4 w-full mt-2">
                  {morningSlots.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-amber-600 font-semibold text-xs mb-2">
                        <Sunrise size={14} />
                        <span>Morning Slots</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {morningSlots.map((slot) => {
                          const isSelected = form.requestedTime === slot;
                          const hasSelectedSomething = form.requestedTime !== "";
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => update("requestedTime", slot)}
                              className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all duration-300 transform cursor-pointer focus:outline-none ${
                                isSelected
                                  ? "bg-teal-50 border-teal-600 text-teal-850 scale-105 shadow-sm font-bold"
                                  : hasSelectedSomething
                                  ? "bg-white border-slate-200 text-slate-700 opacity-50 hover:opacity-100"
                                  : "bg-white border-slate-200 text-slate-700 hover:border-teal-500 hover:bg-slate-50"
                              }`}
                            >
                              {slot}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {afternoonSlots.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center gap-1.5 text-orange-605 font-semibold text-xs mb-2">
                        <Sun size={14} />
                        <span>Afternoon Slots</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {afternoonSlots.map((slot) => {
                          const isSelected = form.requestedTime === slot;
                          const hasSelectedSomething = form.requestedTime !== "";
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => update("requestedTime", slot)}
                              className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all duration-300 transform cursor-pointer focus:outline-none ${
                                isSelected
                                  ? "bg-teal-50 border-teal-600 text-teal-855 scale-105 shadow-sm font-bold"
                                  : hasSelectedSomething
                                  ? "bg-white border-slate-200 text-slate-700 opacity-50 hover:opacity-100"
                                  : "bg-white border-slate-200 text-slate-700 hover:border-teal-500 hover:bg-slate-50"
                              }`}
                            >
                              {slot}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {slotError ? <p className="field-hint warning">{slotError}</p> : null}
          <button className="button primary mt-4" type="button" onClick={() => setStep(2)} disabled={!departmentSlug || !form.requestedTime}>
            Continue
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="form-section">
          <input className="honeypot" value={form.company} onChange={(event) => update("company", event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <div className="two-fields">
            <label>
              Patient name
              <input value={form.patientName} onChange={(event) => update("patientName", event.target.value)} required />
            </label>
            <label>
              Mobile number
              <input value={form.phone} onChange={(event) => update("phone", event.target.value)} inputMode="tel" required />
            </label>
          </div>
          <label>
            Email
            <input value={form.email} onChange={(event) => update("email", event.target.value)} type="email" required />
          </label>
          <label>
            Concern / reason for visit
            <textarea value={form.concern} onChange={(event) => update("concern", event.target.value)} rows={4} required />
          </label>
          <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
            <button
              className="button primary"
              type="button"
              onClick={() => setStep(3)}
              disabled={!form.patientName.trim() || !form.phone.trim() || !form.email.trim() || !form.concern.trim()}
            >
              Continue
            </button>
            <button
              type="button"
              className="button subtle"
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
              onClick={clearForm}
            >
              <Trash2 size={14} aria-hidden="true" /> Clear form
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="form-section">
          <div className="summary-box">
            <strong>{department?.name}</strong>
            <span>{form.requestedDate} · {form.requestedTime}</span>
            <p>Hospital staff will call to confirm final availability.</p>
          </div>
          <TurnstileBox key={turnstileNonce} siteKey={turnstileSiteKey} onToken={handleTurnstileToken} />
          <label className="checkbox-field">
            <input type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} required />
            <span>{consentText}</span>
          </label>
          <p className="field-hint warning">{emergencyNotice}</p>
          <div style={{ display: "flex", gap: "10px", marginTop: "4px", flexWrap: "wrap" }}>
            <button className="button primary full" disabled={busy || !form.consent || (turnstileSiteKey ? !turnstileToken : false)} type="submit" style={{ flex: 1 }}>
              <Send size={18} aria-hidden="true" /> {busy ? "Processing your request securely..." : "Submit Request"}
            </button>
            <button
              type="button"
              className="button subtle"
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
              onClick={clearForm}
            >
              <Trash2 size={14} aria-hidden="true" /> Clear
            </button>
          </div>
          {!busy && (!form.consent || (turnstileSiteKey && !turnstileToken)) ? (
            <p role="status" aria-live="polite" style={{ fontSize: "12px", color: "#dc2626", marginTop: "6px" }}>
              {!form.consent ? "Please accept the consent checkbox to continue." : "Please complete the verification above."}
            </p>
          ) : null}
        </div>
      ) : null}

      <FieldMessage message={message} success={success} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// FeedbackForm
// ---------------------------------------------------------------------------

export function FeedbackForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  type FeedbackFormState = {
    patientName: string;
    phone: string;
    rating: string;
    message: string;
    consent: boolean;
    company: string;
  };

  const emptyForm: FeedbackFormState = {
    patientName: "",
    phone: "",
    rating: "5",
    message: "",
    consent: false,
    company: "",
  };

  const [form, setForm] = useState<FeedbackFormState>(emptyForm);
  const [pendingDraft, setPendingDraft] = useState<FeedbackFormState | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);
  const [publicConsent, setPublicConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [mounted] = useState(() => typeof window !== "undefined");

  const update = useCallback((name: keyof FeedbackFormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [name]: value }));
  }, []);

  useEffect(() => {
    if (mounted) {
      import("@/app/lib/cryptoStorage").then((m) => {
        m.getAndDecrypt("pch_feedback_idempotency").then((savedKey) => {
          if (savedKey) {
            setIdempotencyKey(typeof savedKey === "string" ? savedKey : String(savedKey));
          } else {
            const newKey = crypto.randomUUID();
            setIdempotencyKey(newKey);
            m.encryptAndSave("pch_feedback_idempotency", newKey);
          }
        });
      });
    }
  }, [mounted, success]);

  // On mount: check for a non-expired draft, offer banner — do not auto-fill.
  useEffect(() => {
    import("@/app/lib/cryptoStorage").then((m) => {
      m.getAndDecrypt("pch_feedback_draft").then((saved) => {
        if (!saved) return;
        const raw = typeof window !== "undefined" ? localStorage.getItem("pch_feedback_draft") : null;
        if (!raw) return;
        const tsRaw = localStorage.getItem("pch_feedback_draft_ts");
        const ts = tsRaw ? Number(tsRaw) : null;
        if (ts !== null && Date.now() - ts > DRAFT_TTL_MS) {
          localStorage.removeItem("pch_feedback_draft");
          localStorage.removeItem("pch_feedback_draft_ts");
          return;
        }
        setPendingDraft({ ...emptyForm, ...(saved as Partial<FeedbackFormState>) });
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    setForm(pendingDraft);
    setPendingDraft(null);
  }, [pendingDraft]);

  const discardDraft = useCallback(() => {
    localStorage.removeItem("pch_feedback_draft");
    localStorage.removeItem("pch_feedback_draft_ts");
    setPendingDraft(null);
  }, []);

  const clearForm = useCallback(() => {
    setForm(emptyForm);
    setPublicConsent(false);
    localStorage.removeItem("pch_feedback_draft");
    localStorage.removeItem("pch_feedback_draft_ts");
    setPendingDraft(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save with 30-min companion timestamp.
  useEffect(() => {
    if (mounted) {
      import("@/app/lib/cryptoStorage").then((m) => {
        m.encryptAndSave("pch_feedback_draft", {
          patientName: form.patientName,
          phone: form.phone,
          rating: form.rating,
          message: form.message,
          consent: form.consent,
        });
        localStorage.setItem("pch_feedback_draft_ts", String(Date.now()));
      });
    }
  }, [form, mounted]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setSuccess(false);
    try {
      const data = await postJson("/api/feedback", {
        ...form,
        rating: Number(form.rating),
        turnstileToken,
        idempotencyKey,
      });
      setSuccess(true);
      setMessage(String(data.message || "Feedback submitted for review."));
      setForm(emptyForm);
      setPublicConsent(false);
      setTurnstileToken("");
      setTurnstileNonce((n) => n + 1);
      // Clear draft on successful submit
      localStorage.removeItem("pch_feedback_draft");
      localStorage.removeItem("pch_feedback_draft_ts");
      localStorage.removeItem("pch_feedback_idempotency");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit feedback.");
      setTurnstileToken("");
      setTurnstileNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flow-card" onSubmit={submit}>
      {pendingDraft ? (
        <DraftBanner onRestore={restoreDraft} onDiscard={discardDraft} />
      ) : null}
      <input className="honeypot" value={form.company} onChange={(event) => update("company", event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="two-fields">
        <label>
          Patient name
          <input value={form.patientName} onChange={(event) => update("patientName", event.target.value)} required />
        </label>
        <label>
          Mobile number
          <input value={form.phone} onChange={(event) => update("phone", event.target.value)} inputMode="tel" required />
        </label>
      </div>
      <label>
        Rating
        <select value={form.rating} onChange={(event) => update("rating", event.target.value)}>
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Good</option>
          <option value="3">3 - Average</option>
          <option value="2">2 - Needs attention</option>
          <option value="1">1 - Poor</option>
        </select>
      </label>
      <label>
        Feedback
        <textarea rows={5} value={form.message} onChange={(event) => update("message", event.target.value)} required />
      </label>
      <TurnstileBox key={turnstileNonce} siteKey={turnstileSiteKey} onToken={handleTurnstileToken} />
      <label className="checkbox-field">
        <input type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} required />
        <span>I consent to the hospital reviewing this feedback and contacting me regarding my concerns.</span>
      </label>
      <label className="checkbox-field" style={{ marginTop: "10px" }}>
        <input type="checkbox" checked={publicConsent} onChange={(event) => setPublicConsent(event.target.checked)} />
        <span>I separately consent to the publication of this feedback on the hospital&apos;s website or social-media pages, either with my name or anonymously as selected by me. I understand that I may withdraw this consent.</span>
      </label>
      <div style={{ display: "flex", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
        <button className="button primary full" type="submit" disabled={busy || !form.consent || (turnstileSiteKey ? !turnstileToken : false)} style={{ flex: 1 }}>
          <Send size={18} aria-hidden="true" /> {busy ? "Processing your request securely..." : "Submit Feedback"}
        </button>
        <button
          type="button"
          className="button subtle"
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
          onClick={clearForm}
        >
          <Trash2 size={14} aria-hidden="true" /> Clear
        </button>
      </div>
      {!busy && (!form.consent || (turnstileSiteKey && !turnstileToken)) ? (
        <p role="status" aria-live="polite" style={{ fontSize: "12px", color: "#dc2626", marginTop: "6px" }}>
          {!form.consent ? "Please accept the consent checkbox to continue." : "Please complete the verification above."}
        </p>
      ) : null}
      <FieldMessage message={message} success={success} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// ContactForm
// ---------------------------------------------------------------------------

export function ContactForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  type ContactFormState = {
    name: string;
    phone: string;
    email: string;
    subject: string;
    message: string;
    company: string;
  };

  const emptyForm: ContactFormState = { name: "", phone: "", email: "", subject: "", message: "", company: "" };

  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const [pendingDraft, setPendingDraft] = useState<ContactFormState | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [success, setSuccess] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [mounted] = useState(() => typeof window !== "undefined");

  const update = useCallback((name: keyof ContactFormState, value: string) => {
    setForm((current) => ({ ...current, [name]: value }));
  }, []);

  useEffect(() => {
    if (mounted) {
      import("@/app/lib/cryptoStorage").then((m) => {
        m.getAndDecrypt("pch_contact_idempotency").then((savedKey) => {
          if (savedKey) {
            setIdempotencyKey(typeof savedKey === "string" ? savedKey : String(savedKey));
          } else {
            const newKey = crypto.randomUUID();
            setIdempotencyKey(newKey);
            m.encryptAndSave("pch_contact_idempotency", newKey);
          }
        });
      });
    }
  }, [mounted, success]);

  // On mount: check for a non-expired draft, offer banner — do not auto-fill.
  useEffect(() => {
    import("@/app/lib/cryptoStorage").then((m) => {
      m.getAndDecrypt("pch_contact_draft").then((saved) => {
        if (!saved) return;
        const raw = typeof window !== "undefined" ? localStorage.getItem("pch_contact_draft") : null;
        if (!raw) return;
        const tsRaw = localStorage.getItem("pch_contact_draft_ts");
        const ts = tsRaw ? Number(tsRaw) : null;
        if (ts !== null && Date.now() - ts > DRAFT_TTL_MS) {
          localStorage.removeItem("pch_contact_draft");
          localStorage.removeItem("pch_contact_draft_ts");
          return;
        }
        setPendingDraft({ ...emptyForm, ...(saved as Partial<ContactFormState>) });
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    setForm(pendingDraft);
    setPendingDraft(null);
  }, [pendingDraft]);

  const discardDraft = useCallback(() => {
    localStorage.removeItem("pch_contact_draft");
    localStorage.removeItem("pch_contact_draft_ts");
    setPendingDraft(null);
  }, []);

  const clearForm = useCallback(() => {
    setForm(emptyForm);
    localStorage.removeItem("pch_contact_draft");
    localStorage.removeItem("pch_contact_draft_ts");
    setPendingDraft(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save with 30-min companion timestamp.
  useEffect(() => {
    if (mounted) {
      import("@/app/lib/cryptoStorage").then((m) => {
        m.encryptAndSave("pch_contact_draft", form);
        localStorage.setItem("pch_contact_draft_ts", String(Date.now()));
      });
    }
  }, [form, mounted]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setSuccess(false);
    try {
      const data = await postJson("/api/contact", { ...form, turnstileToken, idempotencyKey });
      setSuccess(true);
      setNotice(String(data.message || "Message received."));
      setForm(emptyForm);
      setTurnstileToken("");
      setTurnstileNonce((n) => n + 1);
      // Clear draft on successful submit
      localStorage.removeItem("pch_contact_draft");
      localStorage.removeItem("pch_contact_draft_ts");
      localStorage.removeItem("pch_contact_idempotency");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not send message.");
      setTurnstileToken("");
      setTurnstileNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flow-card" onSubmit={submit}>
      {pendingDraft ? (
        <DraftBanner onRestore={restoreDraft} onDiscard={discardDraft} />
      ) : null}
      <input className="honeypot" value={form.company} onChange={(event) => update("company", event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="two-fields">
        <label>
          Name
          <input value={form.name} onChange={(event) => update("name", event.target.value)} required />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(event) => update("phone", event.target.value)} inputMode="tel" />
        </label>
      </div>
      <label>
        Email
        <input value={form.email} onChange={(event) => update("email", event.target.value)} type="email" required />
      </label>
      <label>
        Subject
        <input value={form.subject} onChange={(event) => update("subject", event.target.value)} />
      </label>
      <label>
        Message
        <textarea rows={5} value={form.message} onChange={(event) => update("message", event.target.value)} required />
      </label>
      <TurnstileBox key={turnstileNonce} siteKey={turnstileSiteKey} onToken={handleTurnstileToken} />
      <div style={{ display: "flex", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
        <button className="button primary full" type="submit" disabled={busy || (turnstileSiteKey ? !turnstileToken : false)} style={{ flex: 1 }}>
          <MessageCircle size={18} aria-hidden="true" /> {busy ? "Processing your request securely..." : "Send Message"}
        </button>
        <button
          type="button"
          className="button subtle"
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
          onClick={clearForm}
        >
          <Trash2 size={14} aria-hidden="true" /> Clear
        </button>
      </div>
      {!busy && turnstileSiteKey && !turnstileToken ? (
        <p role="status" aria-live="polite" style={{ fontSize: "12px", color: "#dc2626", marginTop: "6px" }}>
          Please complete the verification above.
        </p>
      ) : null}
      <p style={{ fontSize: "11px", color: "#64748b", marginTop: "12px", lineHeight: "1.4", textAlign: "center" }}>
        By submitting this form, you consent to Protone Care Hospital using the information provided to respond to your enquiry in accordance with its <a href="/privacy-policy" style={{ textDecoration: "underline", color: "var(--navy)" }}>Privacy Policy</a>. Do not use this form for emergencies or to send detailed medical records.
      </p>
      <p className="field-hint" style={{ marginTop: "8px" }}>For emergencies, call <a href={hospital.phoneHref}>{hospital.phone}</a>.</p>
      <FieldMessage message={notice} success={success} />
    </form>
  );
}
