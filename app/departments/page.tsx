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
        title="Specialities & OPD Consultation Schedules"
        body="Select a department and your preferred time window. The Protone Care Hospital coordination desk will confirm the final appointment details by phone."
      >
        <PrimaryActions />
      </PageHero>
      <section className="section">
        <div className="container">
          <SectionHeader
            eyebrow="Clinical Excellence"
            title="All medical departments & specialities"
            body="Access specialized healthcare across clinical departments. Select a department to request an appointment."
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
