import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Building2, FlaskConical, HeartPulse, ShieldCheck, Stethoscope } from "lucide-react";
import {
  departments,
  facilityGroups,
  facilities,
  hospital,
  SITE_URL,
  tpaPanels,
} from "@/app/lib/data";
import { ArrowLink, EmergencyBand, InfoBadge, PageShell, PrimaryActions, SectionHeader, TimingNote } from "@/app/components/SiteShell";
import { HeroCarousel } from "@/app/components/HeroCarousel";

export const metadata: Metadata = {
  title: "Protone Care Hospital | 24x7 Emergency & Multispeciality Care",
  description:
    "Protone Care Hospital in Sector 11, Gurugram offers 24x7 emergency, OPD/IPD, ICU, NICU, operation theatre, diagnostics, and department-based appointment requests.",
  alternates: { canonical: SITE_URL },
};

export default function Home() {
  const featuredDepartments = departments.slice(0, 8);
  const isCarouselEnabled = process.env.HERO_CAROUSEL_ENABLED === "true";
  const schema = {
    "@context": "https://schema.org",
    "@type": "Hospital",
    name: hospital.name,
    url: SITE_URL,
    image: `${SITE_URL}${hospital.wideImage}`,
    telephone: `+91${hospital.phone}`,
    email: hospital.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: "1/23 Laxmi Garden, Sector 11",
      addressLocality: "Gurugram",
      addressRegion: "Haryana",
      postalCode: "122001",
      addressCountry: "IN",
    },
    medicalSpecialty: departments.map((department) => department.name),
  };

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="hero-home" style={isCarouselEnabled ? { backgroundImage: "none" } : undefined}>
        {isCarouselEnabled ? <HeroCarousel /> : null}
        <div className="container">
          <div className="hero-copy">
            <span className="eyebrow">{hospital.tagline}</span>
            <h1>Protone Care Hospital</h1>
            <p>
              A modern multispeciality hospital in Sector 11, Gurugram with emergency care, OPD/IPD, diagnostics, critical care, and department-based appointment requests.
            </p>
            <PrimaryActions />
            <div className="hero-metrics" aria-label="Hospital service highlights">
              <div><span>Emergency</span><strong>24x7 confirmed</strong></div>
              <div><span>Appointment</span><strong>Department-only request</strong></div>
              <div><span>Insurance</span><strong>{tpaPanels.length} TPA panels</strong></div>
            </div>
          </div>
        </div>
      </section>

      <EmergencyBand />

      <section className="section">
        <div className="container">
          <SectionHeader
            eyebrow="Hospital services"
            title="Care pathways built around emergency, OPD, diagnostics, and recovery"
            body="The public website is structured around the way patients actually need help: urgent care, department consultation, diagnostics, insurance support, and follow-up contact."
          />
          <div className="quick-grid">
            <article className="quick-card">
              <HeartPulse size={26} aria-hidden="true" />
              <h3>Emergency & Critical Care</h3>
              <p>24x7 emergency support with ICU, NICU, and HDU capabilities.</p>
              <ArrowLink href="/contact">Reach emergency desk</ArrowLink>
            </article>
            <article className="quick-card">
              <Stethoscope size={26} aria-hidden="true" />
              <h3>Department OPD</h3>
              <p>Request preferred department slots in 15-minute intervals. Final confirmation is handled by staff.</p>
              <ArrowLink href="/appointment">Request appointment</ArrowLink>
            </article>
            <article className="quick-card">
              <FlaskConical size={26} aria-hidden="true" />
              <h3>Diagnostics & Support</h3>
              <p>Advanced lab, digital X-ray, ultrasound, pharmacy, dental, and health checkup support.</p>
              <ArrowLink href="/departments">View departments</ArrowLink>
            </article>
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <SectionHeader
            eyebrow="Departments"
            title="Our Medical Specialities & Services"
            body="Please select your required medical department below. Select your preferred timing window to request an OPD consultation slot."
          />
          <div className="department-grid">
            {featuredDepartments.map((department) => (
              <article className="department-card" key={department.slug}>
                <span className="hindi-label">{department.hindi}</span>
                <h3>{department.name}</h3>
                <p>{department.summary}</p>
                {department.timing ? <InfoBadge>{department.timing.label}</InfoBadge> : <InfoBadge>Call for availability</InfoBadge>}
                <ArrowLink href={`/departments/${department.slug}`}>Department details</ArrowLink>
              </article>
            ))}
          </div>
          <div className="action-row">
            <Link href="/departments" className="button subtle">View all departments</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Facilities" title="Hospital facilities grouped for quick patient decisions" />
          <div className="facility-grid">
            {facilityGroups.map((group) => (
              <article className="facility-card" key={group.title}>
                <Building2 size={24} aria-hidden="true" />
                <h3>{group.title}</h3>
                <ul>
                  {group.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
            ))}
          </div>
          <div className="safety-note" style={{ marginTop: 18 }}>
            <ShieldCheck size={20} aria-hidden="true" />
            <p>{facilities.join(" · ")}</p>
          </div>
        </div>
      </section>

      <section className="section deep">
        <div className="container">
          <SectionHeader
            eyebrow="OPD timings"
            title="Confirmed OPD windows with live admin-editable slots"
            body="Public slot options are generated from approved department timings in 15-minute intervals."
          />
          <div className="quick-grid">
            {departments.filter((item) => item.timing).map((department) => (
              <article className="quick-card" key={department.slug}>
                <Activity size={25} aria-hidden="true" />
                <h3>{department.name}</h3>
                <p>{department.timing?.days} · {department.timing?.label}</p>
                <ArrowLink href={`/appointment?dept=${department.slug}`}>Request slot</ArrowLink>
              </article>
            ))}
          </div>
          <div style={{ marginTop: 18 }}>
            <TimingNote />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
