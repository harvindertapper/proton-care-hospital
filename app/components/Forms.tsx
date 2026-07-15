"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, LockKeyhole, MessageCircle, PhoneCall, Send, Sunrise, Sun } from "lucide-react";
import type { Department } from "@/app/lib/data";
import { consentText, emergencyNotice, hospital } from "@/app/lib/data";
import { auth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "@/app/lib/firebaseClient";

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

function TurnstileBox({ siteKey, onToken }: { siteKey?: string; onToken: (token: string) => void }) {
  useEffect(() => {
    if (!siteKey) {
      onToken("preview-turnstile");
      return;
    }

    const callbackName = "pchTurnstile";
    (window as unknown as Record<string, (token: string) => void>)[callbackName] = onToken;
    const existing = document.querySelector<HTMLScriptElement>("script[data-pch-turnstile]");
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.dataset.pchTurnstile = "true";
      document.head.appendChild(script);
    }
    return () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };
  }, [siteKey, onToken]);

  if (!siteKey) {
    return (
      <div className="turnstile-preview">
        <LockKeyhole size={18} aria-hidden="true" />
        <span>Security verification active.</span>
      </div>
    );
  }

  return <div className="cf-turnstile" data-sitekey={siteKey} data-callback="pchTurnstile" />;
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

export function AppointmentForm({
  departments,
  initialDepartment,
  turnstileSiteKey,
}: {
  departments: Department[];
  initialDepartment?: string;
  turnstileSiteKey?: string;
}) {
  const selectableDepartments = departments;
  const [step, setStep] = useState(1);
  const [departmentSlug, setDepartmentSlug] = useState(initialDepartment || selectableDepartments[0]?.slug || "");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotError, setSlotError] = useState("");
  const [form, setForm] = useState({
    patientName: "",
    phone: "",
    email: "",
    requestedDate: todayIso(),
    requestedTime: "",
    concern: "",
    otpCode: "",
    consent: false,
    company: "",
  });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [firebaseIdToken, setFirebaseIdToken] = useState("");
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

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) {
      const savedKey = localStorage.getItem("pch_appointment_idempotency");
      if (savedKey) {
        setIdempotencyKey(savedKey);
      } else {
        const newKey = crypto.randomUUID();
        setIdempotencyKey(newKey);
        localStorage.setItem("pch_appointment_idempotency", newKey);
      }
    }
  }, [mounted, success]);

  useEffect(() => {
    setMounted(true);
    const savedForm = localStorage.getItem("pch_appointment_draft");
    if (savedForm) {
      try {
        const parsed = JSON.parse(savedForm);
        setForm((current) => ({ ...current, ...parsed, otpCode: "" }));
      } catch {}
    }
    const savedDept = localStorage.getItem("pch_appointment_dept");
    if (savedDept) {
      setDepartmentSlug(savedDept);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(
        "pch_appointment_draft",
        JSON.stringify({
          patientName: form.patientName,
          phone: form.phone,
          email: form.email,
          requestedDate: form.requestedDate,
          requestedTime: form.requestedTime,
          concern: form.concern,
          consent: form.consent,
        })
      );
    }
  }, [form, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("pch_appointment_dept", departmentSlug);
    }
  }, [departmentSlug, mounted]);

  const isEmergency = departmentSlug === "emergency-medicine";
  const isUntimed = department && !department.timing;

  useEffect(() => {
    if (isUntimed) {
      update("requestedTime", "Manual Allocation");
    } else if (form.requestedTime === "Manual Allocation") {
      update("requestedTime", "");
    }
  }, [isUntimed]);

  useEffect(() => {
    let cancelled = false;
    if (!departmentSlug || isEmergency) return;
    fetch(`/api/department-slots?departmentSlug=${encodeURIComponent(departmentSlug)}`)
      .then((response) => response.json())
      .then((data: SlotsResponse) => {
        if (cancelled) return;
        if (data.error) setSlotError(data.error);
        setSlots(data.slots || []);
      })
      .catch(() => {
        if (!cancelled) setSlotError("Please call the hospital desk to confirm timing for this department.");
      });
    return () => {
      cancelled = true;
    };
  }, [departmentSlug, isEmergency]);

  function chooseDepartment(slug: string) {
    setSlots([]);
    setSlotError("");
    setForm((current) => ({ ...current, requestedTime: "", otpCode: "" }));
    setOtpSent(false);
    setOtpVerified(false);
    setStep(1);
    setDepartmentSlug(slug);
  }

  function update(name: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function sendOtp() {
    setBusy(true);
    setMessage("");
    try {
      if (!(window as any).appointmentRecaptchaVerifier) {
        (window as any).appointmentRecaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
        });
      }
      const digits = form.phone.replace(/\D/g, "");
      const formattedPhone = digits.length === 10 ? `+91${digits}` : `+${digits}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, (window as any).appointmentRecaptchaVerifier);
      setConfirmationResult(result);
      setOtpSent(true);
      setMessage("OTP sent to your mobile number.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send OTP. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setMessage("");
    try {
      if (!confirmationResult) throw new Error("No active OTP request.");
      const userCredential = await confirmationResult.confirm(form.otpCode);
      const idToken = await userCredential.user.getIdToken();
      setFirebaseIdToken(idToken);
      setOtpVerified(true);
      setStep(3);
      setMessage("Mobile number verified.");
    } catch (error) {
      setMessage("OTP verification failed. Please check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setSuccess(false);
    try {
      const data = await postJson("/api/appointments", {
        ...form,
        departmentSlug,
        turnstileToken,
        idempotencyKey,
        firebaseIdToken,
      });
      setSuccess(true);
      setMessage(`${data.message || "Your appointment request has been registered securely."} Reference ID: ${data.requestId || ""}`);
      setStep(1);
      setOtpSent(false);
      setOtpVerified(false);
      setForm({
        patientName: "",
        phone: "",
        email: "",
        requestedDate: todayIso(),
        requestedTime: "",
        concern: "",
        otpCode: "",
        consent: false,
        company: "",
      });
      localStorage.removeItem("pch_appointment_draft");
      localStorage.removeItem("pch_appointment_dept");
      localStorage.removeItem("pch_appointment_idempotency");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit appointment request.");
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
            For life-threatening conditions or urgent medical emergencies, please do not wait for an online appointment request. Call or visit our hospital directly. / आपातकालीन स्थिति में ऑनलाइन अपॉइंटमेंट की प्रतीक्षा न करें, सीधे संपर्क करें।
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 15 }}>
          <a href={hospital.phoneHref} className="button primary call-button" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#dc2626", color: "white" }}>
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
      <div className="flow-steps" aria-label="Appointment request steps">
        {[1, 2, 3].map((item) => (
          <button type="button" className={step === item ? "active" : ""} key={item} onClick={() => setStep(item)}>
            {item}
          </button>
        ))}
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
          <div className="otp-row">
            <button type="button" className="button secondary" onClick={sendOtp} disabled={busy || !form.phone}>
              <PhoneCall size={18} aria-hidden="true" /> Send OTP
            </button>
            <label>
              OTP
              <input value={form.otpCode} onChange={(event) => update("otpCode", event.target.value)} inputMode="numeric" maxLength={6} />
            </label>
            <button type="button" className="button subtle" onClick={verifyOtp} disabled={busy || !otpSent || !form.otpCode}>
              Verify
            </button>
          </div>
          <button className="button primary" type="button" onClick={() => setStep(3)} disabled={!otpVerified}>
            Continue
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="form-section">
          <div className="summary-box">
            <strong>{department?.name}</strong>
            <span>{form.requestedDate} · {form.requestedTime}</span>
            <p>Hospital staff will call to confirm final availability.</p>
          </div>
          <TurnstileBox siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
          <label className="checkbox-field">
            <input type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} required />
            <span>{consentText}</span>
          </label>
          <p className="field-hint warning">{emergencyNotice}</p>
          <button className="button primary full" disabled={busy || !form.consent || !turnstileToken} type="submit">
            <Send size={18} aria-hidden="true" /> {busy ? "Processing your request securely..." : "Submit Request"}
          </button>
        </div>
      ) : null}

      <FieldMessage message={message} success={success || otpVerified} />
    </form>
  );
}

export function FeedbackForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [form, setForm] = useState({
    patientName: "",
    phone: "",
    rating: "5",
    message: "",
    otpCode: "",
    consent: false,
    company: "",
  });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [firebaseIdToken, setFirebaseIdToken] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) {
      const savedKey = localStorage.getItem("pch_feedback_idempotency");
      if (savedKey) {
        setIdempotencyKey(savedKey);
      } else {
        const newKey = crypto.randomUUID();
        setIdempotencyKey(newKey);
        localStorage.setItem("pch_feedback_idempotency", newKey);
      }
    }
  }, [mounted, success]);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("pch_feedback_draft");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm((current) => ({ ...current, ...parsed, otpCode: "" }));
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(
        "pch_feedback_draft",
        JSON.stringify({
          patientName: form.patientName,
          phone: form.phone,
          rating: form.rating,
          message: form.message,
          consent: form.consent,
        })
      );
    }
  }, [form, mounted]);

  function update(name: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function sendOtp() {
    setBusy(true);
    setMessage("");
    try {
      if (!(window as any).feedbackRecaptchaVerifier) {
        (window as any).feedbackRecaptchaVerifier = new RecaptchaVerifier(auth, "feedback-recaptcha-container", {
          size: "invisible",
        });
      }
      const digits = form.phone.replace(/\D/g, "");
      const formattedPhone = digits.length === 10 ? `+91${digits}` : `+${digits}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, (window as any).feedbackRecaptchaVerifier);
      setConfirmationResult(result);
      setOtpSent(true);
      setMessage("OTP sent to your mobile number.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send OTP. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setMessage("");
    try {
      if (!confirmationResult) throw new Error("No active OTP request.");
      const userCredential = await confirmationResult.confirm(form.otpCode);
      const idToken = await userCredential.user.getIdToken();
      setFirebaseIdToken(idToken);
      setOtpVerified(true);
      setMessage("Mobile number verified.");
    } catch (error) {
      setMessage("OTP verification failed. Please check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

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
        firebaseIdToken,
      });
      setSuccess(true);
      setMessage(String(data.message || "Feedback submitted for review."));
      setForm({ patientName: "", phone: "", rating: "5", message: "", otpCode: "", consent: false, company: "" });
      setOtpSent(false);
      setOtpVerified(false);
      localStorage.removeItem("pch_feedback_draft");
      localStorage.removeItem("pch_feedback_idempotency");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flow-card" onSubmit={submit}>
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
      <div className="otp-row">
        <button type="button" className="button secondary" onClick={sendOtp} disabled={busy || !form.phone}>
          <PhoneCall size={18} aria-hidden="true" /> Send OTP
        </button>
        <label>
          OTP
          <input value={form.otpCode} onChange={(event) => update("otpCode", event.target.value)} inputMode="numeric" maxLength={6} />
        </label>
        <button type="button" className="button subtle" onClick={verifyOtp} disabled={busy || !otpSent || !form.otpCode}>
          Verify
        </button>
      </div>
      <div id="feedback-recaptcha-container"></div>
      <TurnstileBox siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
      <label className="checkbox-field">
        <input type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} required />
        <span>I consent to Protone Care Hospital reviewing this feedback and contacting me if follow-up is needed. Public display requires hospital approval.</span>
      </label>
      <button className="button primary full" type="submit" disabled={busy || !otpVerified || !form.consent || !turnstileToken}>
        <Send size={18} aria-hidden="true" /> {busy ? "Processing your request securely..." : "Submit Feedback"}
      </button>
      <FieldMessage message={message} success={success || otpVerified} />
    </form>
  );
}

export function ContactForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", subject: "", message: "", company: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [success, setSuccess] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) {
      const savedKey = localStorage.getItem("pch_contact_idempotency");
      if (savedKey) {
        setIdempotencyKey(savedKey);
      } else {
        const newKey = crypto.randomUUID();
        setIdempotencyKey(newKey);
        localStorage.setItem("pch_contact_idempotency", newKey);
      }
    }
  }, [mounted, success]);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("pch_contact_draft");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm((current) => ({ ...current, ...parsed }));
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("pch_contact_draft", JSON.stringify(form));
    }
  }, [form, mounted]);

  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setSuccess(false);
    try {
      const data = await postJson("/api/contact", { ...form, turnstileToken, idempotencyKey });
      setSuccess(true);
      setNotice(String(data.message || "Message received."));
      setForm({ name: "", phone: "", email: "", subject: "", message: "", company: "" });
      setTurnstileToken("");
      localStorage.removeItem("pch_contact_draft");
      localStorage.removeItem("pch_contact_idempotency");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flow-card" onSubmit={submit}>
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
      <TurnstileBox siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
      <button className="button primary full" type="submit" disabled={busy || (turnstileSiteKey ? !turnstileToken : false)}>
        <MessageCircle size={18} aria-hidden="true" /> {busy ? "Processing your request securely..." : "Send Message"}
      </button>
      <p className="field-hint">For emergencies, call <a href={hospital.phoneHref}>{hospital.phone}</a>.</p>
      <FieldMessage message={notice} success={success} />
    </form>
  );
}
