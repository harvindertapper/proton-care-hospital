import type { Metadata } from "next";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { departments, emergencyNotice, hospital, SITE_URL } from "@/app/lib/data";
import { AppointmentForm } from "@/app/components/Forms";
import { PageHero, PageShell, SectionHeader, Breadcrumbs } from "@/app/components/SiteShell";
import { BookingFaqs } from "@/app/components/BookingFaqs";

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
      <Breadcrumbs paths={[{ label: "Appointment" }]} />

      <section className="section py-16 bg-white">
        <div className="container max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form Column */}
            <div className="lg:col-span-2 space-y-6">
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

            {/* Sidebar Columns (Faqs & Info) */}
            <div className="space-y-6 lg:col-span-1">
              <BookingFaqs />

              <aside className="p-6 bg-slate-50 border border-slate-100 rounded-2xl space-y-4 shadow-sm">
                <h3 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-2" style={{ margin: 0 }}>Need help?</h3>
                <div className="flex flex-col gap-3">
                  <a href={hospital.phoneHref} className="text-slate-700 hover:text-teal-600 text-sm font-semibold text-decoration-none">
                    Call: {hospital.phone}
                  </a>
                  <a href={hospital.landlineHref} className="text-slate-700 hover:text-teal-600 text-sm text-decoration-none">
                    Landline: {hospital.landline}
                  </a>
                  <a href={hospital.whatsappHref} className="text-slate-700 hover:text-teal-600 text-sm font-semibold text-decoration-none">
                    WhatsApp appointment desk
                  </a>
                  <a href={hospital.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-slate-700 hover:text-teal-600 text-sm text-decoration-none">
                    Open directions
                  </a>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt bg-slate-50 py-12">
        <div className="container max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm">
              <ShieldCheck size={24} className="text-teal-600 mb-3" aria-hidden="true" />
              <h3 className="font-semibold text-slate-800 text-lg mb-2">Privacy-first request</h3>
              <p className="text-slate-650 text-sm">Only minimum appointment details are collected. No Aadhaar, reports, prescriptions, payments, or medical-record uploads are requested here.</p>
            </div>
            <div className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm">
              <LockKeyhole size={24} className="text-teal-600 mb-3" aria-hidden="true" />
              <h3 className="font-semibold text-slate-800 text-lg mb-2">Rate-limited and verified</h3>
              <p className="text-slate-655 text-sm">OTP, appointment submission, and verification endpoints are rate-limited by IP and phone purpose.</p>
            </div>
            <div className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm">
              <h3 className="font-semibold text-slate-800 text-lg mb-2">Emergency notice</h3>
              <p className="text-slate-660 text-sm">{emergencyNotice}</p>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
