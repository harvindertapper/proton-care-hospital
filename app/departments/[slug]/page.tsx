import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { CalendarDays, Stethoscope } from "lucide-react";
import { departmentBySlug, departments, doctorsForDepartment, hospital, SITE_URL } from "@/app/lib/data";
import { PageHero, PageShell, PrimaryActions, SectionHeader, TimingNote } from "@/app/components/SiteShell";

export function generateStaticParams() {
  return departments.map((department) => ({ slug: department.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const department = departmentBySlug(slug);
  if (!department) return {};
  return {
    title: department.name,
    description: `${department.name} at Protone Care Hospital, Sector 11 Gurugram. Request preferred OPD timing by department only.`,
    alternates: { canonical: `${SITE_URL}/departments/${department.slug}` },
  };
}

export default async function DepartmentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const department = departmentBySlug(slug);
  if (!department) notFound();
  const departmentDoctors = doctorsForDepartment(department.slug);

  return (
    <PageShell>
      <PageHero
        eyebrow={department.hindi}
        title={department.name}
        body={department.summary}
      >
        <PrimaryActions departmentSlug={department.slug} />
      </PageHero>
      <section className="section">
        <div className="container flow-layout">
          <div>
            <SectionHeader
              eyebrow="Care information"
              title="Department overview"
              body={
                department.slug === "emergency-medicine"
                  ? "Emergency care does not require an online appointment. Call the emergency desk or visit the hospital directly. Patients are triaged according to clinical urgency."
                  : department.slug === "clinical-biochemistry" || department.slug === "clinical-pathology"
                  ? "Contact the laboratory desk for test availability, sample requirements and reporting timelines."
                  : "Request an outpatient consultation with this department."
              }
            />
            {department.image && (
              <div className="relative w-full h-80 rounded-2xl overflow-hidden mb-8 border border-slate-100 shadow-sm">
                <Image
                  src={department.image}
                  alt={department.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}
            <div className="quick-grid">
              <article className="quick-card">
                <CalendarDays size={25} aria-hidden="true" />
                <h3>{department.slug === "emergency-medicine" ? "Emergency Support" : "OPD Timing"}</h3>
                <p>
                  {department.slug === "emergency-medicine"
                    ? "24x7 emergency medical assessment and stabilisation. Admission or transfer to critical care is clinically indicated and subject to bed availability."
                    : department.timing
                    ? `${department.timing.days} · ${department.timing.label}`
                    : "Please call the hospital desk to confirm current availability."}
                </p>
              </article>
              <article className="quick-card">
                <Stethoscope size={25} aria-hidden="true" />
                <h3>Clinical Consultants</h3>
                <p>
                  {departmentDoctors.length
                    ? `This department currently has ${departmentDoctors.length} listed consultants. Individual schedules and consultant availability are subject to confirmation.`
                    : "Consultant availability is confirmed upon scheduling."}
                </p>
              </article>
              <article className="quick-card">
                <h3>Hospital confirmation</h3>
                <p>The Protone Care Hospital coordination desk will confirm final appointment details by phone.</p>
              </article>
            </div>
          </div>
          {department.slug === "emergency-medicine" ? (
            <aside className="contact-card" style={{ background: "#fff5f5", borderColor: "#feb2b2" }}>
              <h3 style={{ color: "#9b2c2c" }}>Emergency Response</h3>
              <p style={{ fontSize: 12, color: "#9b2c2c", marginBottom: 12 }}>Emergency care does not require an online appointment. Patients are triaged by clinical urgency.</p>
              <a href={hospital.phoneHref} className="button danger" style={{ background: "#e53e3e", color: "white", padding: "10px 14px", borderRadius: 8, display: "block", textAlign: "center", textDecoration: "none", fontWeight: "bold" }}>Call Emergency: {hospital.phone}</a>
            </aside>
          ) : (
            <aside className="contact-card">
              <h3>Request this department</h3>
              <a href={`/appointment?dept=${department.slug}`}>Open appointment request</a>
              <a href={hospital.phoneHref}>Call {hospital.phone}</a>
              <a href={hospital.whatsappHref}>WhatsApp desk</a>
            </aside>
          )}
        </div>
      </section>
      <section className="section alt">
        <div className="container">
          <SectionHeader eyebrow="Timing note" title="Availability can change" />
          <TimingNote />
        </div>
      </section>
    </PageShell>
  );
}
