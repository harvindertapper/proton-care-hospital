import type { Metadata } from "next";
import { Building2, HeartHandshake, MapPin, ShieldPlus } from "lucide-react";
import { facilityGroups, hospital, SITE_URL } from "@/app/lib/data";
import { EmergencyBand, PageHero, PageShell, PrimaryActions, SectionHeader } from "@/app/components/SiteShell";

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
      <section className="section">
        <div className="container flow-layout">
          <div>
            <SectionHeader
              eyebrow="Compassion | Care | Cure"
              title="Designed for clear access to hospital care"
              body="This new website keeps patient actions direct: call emergency, request a department slot, contact the desk, check insurance support, or send feedback after phone verification."
            />
            <div className="quick-grid">
              <article className="quick-card">
                <ShieldPlus size={26} aria-hidden="true" />
                <h3>24x7 Emergency</h3>
                <p>Emergency support is confirmed. Online requests should not be used for emergencies.</p>
              </article>
              <article className="quick-card">
                <Building2 size={26} aria-hidden="true" />
                <h3>OPD/IPD Facility</h3>
                <p>Department-based OPD requests and inpatient support are presented with clear contact paths.</p>
              </article>
              <article className="quick-card">
                <HeartHandshake size={26} aria-hidden="true" />
                <h3>Patient Support</h3>
                <p>Cashless assistance, feedback, careers, blogs, and testimonials are managed through approved admin workflows.</p>
              </article>
            </div>
          </div>
          <aside className="contact-card">
            <h3>Hospital location</h3>
            <a href={hospital.mapsUrl}><MapPin size={18} aria-hidden="true" /> {hospital.address}</a>
            <a href={hospital.phoneHref}>Call {hospital.phone}</a>
            <a href={hospital.whatsappHref}>WhatsApp {hospital.phone}</a>
            <a href={hospital.emailHref}>{hospital.email}</a>
          </aside>
        </div>
      </section>
      <section className="section alt">
        <div className="container">
          <SectionHeader eyebrow="Facilities" title="Confirmed facility groups" />
          <div className="facility-grid">
            {facilityGroups.map((group) => (
              <article className="facility-card" key={group.title}>
                <h3>{group.title}</h3>
                <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
