import type { Metadata } from "next";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { departments, emergencyNotice, hospital, SITE_URL } from "@/app/lib/data";
import { AppointmentForm } from "@/app/components/Forms";
import { PageHero, PageShell, SectionHeader } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Request Appointment",
  description: "Request a department-based appointment at Protone Care Hospital with SMS OTP verification and 15-minute preferred slot selection.",
  alternates: { canonical: `${SITE_URL}/appointment` },
};

export default async function AppointmentPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const params = await searchParams;
  const initialDepartment = departments.some((item) => item.slug === params.dept) ? params.dept : undefined;

  return (
    <PageShell>
      <PageHero
        eyebrow="Appointment Request"
        title="Select a department and preferred 15-minute slot"
        body="This is a request workflow. Protone Care Hospital staff will confirm final availability by phone or message."
      />
      <section className="section">
        <div className="container flow-layout">
          <div>
            <SectionHeader
              eyebrow="Secure patient request"
              title="Department-only appointment flow"
              body="Patients choose department, date, preferred time, verify mobile number with OTP, and provide consent. Doctor selection is intentionally not part of the public flow."
            />
            <AppointmentForm
              departments={departments}
              initialDepartment={initialDepartment}
              turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            />
          </div>
          <aside className="contact-card">
            <h3>Need help?</h3>
            <a href={hospital.phoneHref}>Call {hospital.phone}</a>
            <a href={hospital.landlineHref}>Landline {hospital.landline}</a>
            <a href={hospital.whatsappHref}>WhatsApp appointment desk</a>
            <a href={hospital.mapsUrl}>Open directions</a>
          </aside>
        </div>
      </section>
      <section className="section alt">
        <div className="container policy-grid">
          <div className="policy-card">
            <ShieldCheck size={24} aria-hidden="true" />
            <h3>Privacy-first request</h3>
            <p>Only minimum appointment details are collected. No Aadhaar, reports, prescriptions, payments, or medical-record uploads are requested here.</p>
          </div>
          <div className="policy-card">
            <LockKeyhole size={24} aria-hidden="true" />
            <h3>Rate-limited and verified</h3>
            <p>OTP, appointment submission, and verification endpoints are rate-limited by IP and phone purpose.</p>
          </div>
          <div className="policy-card">
            <h3>Emergency notice</h3>
            <p>{emergencyNotice}</p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
