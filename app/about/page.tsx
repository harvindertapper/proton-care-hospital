import type { Metadata } from "next";
import { Building2, HeartHandshake, MapPin, ShieldPlus, ShieldCheck } from "lucide-react";
import { hospital, SITE_URL } from "@/app/lib/data";
import { EmergencyBand, PageHero, PageShell, PrimaryActions, SectionHeader, Breadcrumbs } from "@/app/components/SiteShell";
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
      <Breadcrumbs paths={[{ label: "About" }]} />

      <section className="section py-16 bg-white">
        <div className="container max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <SectionHeader
                eyebrow="Compassion | Care | Cure"
                title="Designed for clear access to hospital care"
                body="Protone Care Hospital is built on a simple foundation: direct clinical access. We provide Gurugram (Gurgaon) residents with department-based appointment requests, 24x7 emergency medical response, and structured patient stay facilities."
              />
              
              {/* Trust Badges & Clinical Metrics */}
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center">
                  <strong className="text-3xl font-extrabold text-teal-600 block mb-1">1,000+</strong>
                  <span className="text-sm text-slate-600 font-medium block">Unique Patients Served</span>
                  <small className="text-xs text-slate-500 block mt-1">As of July 2026, based on hospital records.</small>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center">
                  <strong className="text-3xl font-extrabold text-teal-600 block mb-1">15+</strong>
                  <span className="text-sm text-slate-600 font-medium block">Medical Specialties</span>
                  <small className="text-xs text-slate-500 block mt-1">Covering outpatient (OPD) and inpatient (IPD) clinical services.</small>
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
                    <p className="text-slate-600 text-sm">Our cashless insurance assistance and patient-support services are intended to make the check-in process clearer and more convenient.</p>
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
                  Cashless treatment assistance is available for the insurers and TPAs currently listed. Cashless approval is subject to policy terms, exclusions, medical necessity, documentation and insurer/TPA authorisation. Processing times are estimates and cannot be guaranteed.
                </p>
                <ul className="text-xs text-slate-750 space-y-2 font-medium">
                  <li className="flex items-center gap-2">✓ Cashless TPA Desk Active</li>
                  <li className="flex items-center gap-2">✓ Pre-Auth Assistance Available</li>
                  <li className="flex items-center gap-2">✓ Post-discharge claim documentation support</li>
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

      <section className="section py-16 bg-white">
        <div className="container max-w-7xl mx-auto px-4">
          <SectionHeader
            eyebrow="Leadership"
            title="Guided by experienced leadership"
            body="Protone Care Hospital is led by a dedicated team committed to compassionate, quality-driven healthcare for Gurugram."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
            <article className="group p-5 bg-white border border-slate-100 rounded-3xl shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between">
              <div>
                <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden shadow-md mb-5 bg-slate-50 border border-slate-100/50">
                  <img
                    src="/assets/leadership/sunil-sharma.jpeg"
                    alt="Sunil Sharma, Chief Executive Officer"
                    width={400}
                    height={500}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                <h3 className="font-bold text-slate-800 text-xl mb-1 group-hover:text-teal-600 transition-colors duration-205">Sunil Sharma</h3>
                <p className="text-teal-600 text-sm font-semibold mb-3">Chief Executive Officer (CEO)</p>
                <p className="text-slate-600 text-sm leading-relaxed">As Chief Executive Officer, Sunil Sharma leads the hospital&apos;s overall vision, operations, and growth — focused on making quality, patient-first healthcare accessible across Gurugram.</p>
              </div>
            </article>
            <article className="group p-5 bg-white border border-slate-100 rounded-3xl shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between">
              <div>
                <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden shadow-md mb-5 bg-slate-50 border border-slate-100/50">
                  <img
                    src="/assets/leadership/dr-devender-suhag.jpeg"
                    alt="Dr Devender Suhag, Medical Director"
                    width={400}
                    height={500}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                <h3 className="font-bold text-slate-800 text-xl mb-1 group-hover:text-teal-600 transition-colors duration-205">Dr Devender Suhag</h3>
                <p className="text-teal-600 text-sm font-semibold mb-3">Medical Director</p>
                <p className="text-slate-600 text-sm leading-relaxed">As Medical Director, Dr Devender Suhag guides the hospital&apos;s clinical strategy, medical quality, and standards of patient care across all departments.</p>
              </div>
            </article>
            <article className="group p-5 bg-white border border-slate-100 rounded-3xl shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between">
              <div>
                <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden shadow-md mb-5 bg-slate-50 border border-slate-100/50">
                  <img
                    src="/assets/leadership/dr-rajeev-kumar.jpeg"
                    alt="Dr Rajeev Kumar, Medical Superintendent"
                    width={400}
                    height={500}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                <h3 className="font-bold text-slate-800 text-xl mb-1 group-hover:text-teal-600 transition-colors duration-205">Dr Rajeev Kumar</h3>
                <p className="text-teal-600 text-sm font-semibold mb-3">Medical Superintendent</p>
                <p className="text-slate-600 text-sm leading-relaxed">As Medical Superintendent, Dr Rajeev Kumar oversees day-to-day clinical operations and inter-department coordination to keep hospital services running smoothly.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section bg-slate-50 py-16">
        <div className="container max-w-7xl mx-auto px-4">
          <SectionHeader eyebrow="Clinical Infrastructure" title="Advanced Medical Infrastructure & Facilities" />
          <FacilitiesDirectory />
        </div>
      </section>
    </PageShell>
  );
}
