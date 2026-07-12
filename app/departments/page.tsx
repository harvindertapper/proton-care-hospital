import type { Metadata } from "next";
import { departments, hospital, SITE_URL } from "@/app/lib/data";
import { ArrowLink, PageHero, PageShell, PrimaryActions, SectionHeader, TimingNote } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Departments",
  description: "Confirmed departments and specialities at Protone Care Hospital with Hindi labels and OPD timing notes.",
  alternates: { canonical: `${SITE_URL}/departments` },
};

export default function DepartmentsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Departments"
        title="Specialities with department-based appointment requests"
        body={`Choose a department and preferred 15-minute slot. ${hospital.name} confirms final appointment availability by phone.`}
      >
        <PrimaryActions />
      </PageHero>
      <section className="section">
        <div className="container">
          <SectionHeader
            eyebrow="Confirmed list"
            title="All departments and specialities"
            body="Hindi labels are included from the client-confirmed source. Timings shown only where confirmed."
          />
          <div className="department-grid">
            {departments.map((department) => (
              <article className="department-card" key={department.slug}>
                <span className="hindi-label">{department.hindi}</span>
                <h3>{department.name}</h3>
                <p>{department.summary}</p>
                <p><strong>{department.timing ? department.timing.label : "Call for OPD availability"}</strong></p>
                <ArrowLink href={`/departments/${department.slug}`}>Open department</ArrowLink>
              </article>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <TimingNote />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
