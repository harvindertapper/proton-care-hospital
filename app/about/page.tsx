import type { Metadata } from "next";
import { Building2, HeartHandshake, MapPin, ShieldPlus, ShieldCheck } from "lucide-react";
import { hospital, SITE_URL } from "@/app/lib/data";
import { EmergencyBand, PageHero, PageShell, PrimaryActions, SectionHeader } from "@/app/components/SiteShell";
import { FacilitiesDirectory } from "@/app/components/Directories";

export const metadata: Metadata = {
  title: "About",
  description: "About Protone Care Hospital, Sector 11 Gurugram, with 24x7 emergency, OPD/IPD, diagnostics, ICU, NICU, and patient support facilities.",
  alternates: { canonical: `${SITE_URL}/about` },
};

export default function AboutPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="About Protone"
        title="A patient-first hospital for Sector 11, Gurugram"
        body="Protone Care Hospital brings emergency, OPD/IPD, diagnostics, and speciality support into one accessible hospital experience."
      >
        <PrimaryActions />
      </PageHero>
      <EmergencyBand />

      <section className="section py-16 bg-white">
        <div className="container max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <SectionHeader
                eyebrow="Compassion | Care | Cure"
                title="Designed for clear access to hospital care"
                body="Protone Care Hospital is built on a simple foundation: direct clinical access. We provide Gurugram residents with verified OPD slots, 24x7 emergency medical response, and structured patient stay facilities."
              />
              
              {/* Trust Badges & Clinical Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center">
                  <strong className="text-3xl font-extrabold text-teal-600 block mb-1">10,000+</strong>
                  <span className="text-sm text-slate-600 font-medium">Patients Treated</span>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center">
                  <strong className="text-3xl font-extrabold text-teal-600 block mb-1">15+</strong>
                  <span className="text-sm text-slate-600 font-medium">Medical Specialties</span>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center col-span-2 sm:col-span-1">
                  <strong className="text-3xl font-extrabold text-teal-600 block mb-1">100%</strong>
                  <span className="text-sm text-slate-600 font-medium">NABH Accreditations</span>
                </div>
              </div>

              {/* Quick cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                <article className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between">
                  <div>
                    <ShieldPlus className="text-teal-600 mb-3" size={26} aria-hidden="true" />
                    <h3 className="font-semibold text-slate-800 text-lg mb-2">24x7 Emergency</h3>
                    <p className="text-slate-600 text-sm">Emergency support is confirmed. Online requests should not be used for emergencies.</p>
                  </div>
                </article>
                <article className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between">
                  <div>
                    <Building2 className="text-teal-600 mb-3" size={26} aria-hidden="true" />
                    <h3 className="font-semibold text-slate-800 text-lg mb-2">OPD/IPD Facility</h3>
                    <p className="text-slate-600 text-sm">Department-based OPD requests and inpatient support are presented with clear contact paths.</p>
                  </div>
                </article>
                <article className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between">
                  <div>
                    <HeartHandshake className="text-teal-600 mb-3" size={26} aria-hidden="true" />
                    <h3 className="font-semibold text-slate-800 text-lg mb-2">Patient Support</h3>
                    <p className="text-slate-600 text-sm">Cashless assistance, feedback, careers, blogs, and testimonials are managed through approved admin workflows.</p>
                  </div>
                </article>
              </div>
            </div>

            {/* Sidebar with Location & TPA Cashless Checklists */}
            <div className="space-y-6">
              <aside className="p-6 bg-slate-50 border border-slate-100 rounded-2xl space-y-4 shadow-sm">
                <h3 className="font-bold text-slate-800 text-lg border-b border-slate-200 pb-2">Hospital Location</h3>
                <div className="flex flex-col gap-3">
                  <a href={hospital.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-slate-700 hover:text-teal-600 text-sm flex items-start gap-2 text-decoration-none">
                    <MapPin size={18} className="text-teal-600 shrink-0 mt-0.5" aria-hidden="true" /> 
                    <span>{hospital.address}</span>
                  </a>
                  <a href={hospital.phoneHref} className="text-slate-700 hover:text-teal-600 text-sm font-semibold text-decoration-none">
                    Call: {hospital.phone}
                  </a>
                  <a href={hospital.whatsappHref} className="text-slate-700 hover:text-teal-600 text-sm font-semibold text-decoration-none">
                    WhatsApp: {hospital.phone}
                  </a>
                  <a href={hospital.emailHref} className="text-slate-700 hover:text-teal-600 text-sm text-decoration-none">
                    {hospital.email}
                  </a>
                </div>
              </aside>

              {/* Cashless TPA Banner & Checklist */}
              <aside className="p-6 bg-teal-50 border border-teal-100 rounded-2xl space-y-4 shadow-sm">
                <div className="flex items-center gap-2 text-teal-800">
                  <ShieldCheck size={24} className="text-teal-600" />
                  <h3 className="font-bold text-lg">Cashless Insurance</h3>
                </div>
                <p className="text-slate-700 text-sm">
                  We support cashless claim approvals for all major TPAs and public insurance panels.
                </p>
                <ul className="text-xs text-slate-750 space-y-2 font-medium">
                  <li className="flex items-center gap-2">✓ Cashless TPA Desk Active</li>
                  <li className="flex items-center gap-2">✓ Pre-Auth assistance in 2 Hours</li>
                  <li className="flex items-center gap-2">✓ Post-discharge claim support</li>
                </ul>
                <div className="pt-2">
                  <a
                    href="/tpa-insurance"
                    className="inline-flex items-center justify-center w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold transition-colors text-decoration-none"
                  >
                    View Approved TPA Panels
                  </a>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-slate-50 py-16">
        <div className="container max-w-7xl mx-auto px-4">
          <SectionHeader eyebrow="Clinical Infrastructure" title="Internal Medical Assets & Facilities" />
          <FacilitiesDirectory />
        </div>
      </section>
    </PageShell>
  );
}
