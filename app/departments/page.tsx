import type { Metadata } from "next";
import { departments, SITE_URL } from "@/app/lib/data";
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
                <div style={{ fontSize: 13, marginTop: 12, marginBottom: 12 }}>
                  {department.slug === "emergency-medicine" ? (
                    <span style={{ color: "#e11d48", fontWeight: 650, display: "block", lineHeight: 1.4 }}>
                      Emergency services are available 24/7 and do not require an online appointment. Critical-care admission is subject to clinical assessment and bed availability.
                    </span>
                  ) : department.slug === "clinical-biochemistry" || department.slug === "clinical-pathology" ? (
                    <span style={{ color: "var(--navy)", fontWeight: 600, display: "block", lineHeight: 1.4 }}>
                      Contact the laboratory desk for test availability, sample requirements and reporting timelines.
                    </span>
                  ) : (
                    <strong style={{ display: "block" }}>
                      {department.timing ? department.timing.label : "Call for OPD availability"}
                    </strong>
                  )}
                </div>
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
