import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
              body="Schedule your OPD consultation directly under our specialized department."
            />
            <div className="quick-grid">
              <article className="quick-card">
                <CalendarDays size={25} aria-hidden="true" />
                <h3>OPD Timing</h3>
                <p>{department.timing ? `${department.timing.days} · ${department.timing.label}` : "Please call the hospital desk to confirm current availability."}</p>
              </article>
              <article className="quick-card">
                <Stethoscope size={25} aria-hidden="true" />
                <h3>Clinical Consultants</h3>
                <p>{departmentDoctors.length ? `Consult with our ${departmentDoctors.length} resident department specialist(s).` : "Resident doctor details are confirmed upon scheduling."}</p>
              </article>
              <article className="quick-card">
                <h3>Hospital confirmation</h3>
                <p>{hospital.name} coordination desk will confirm final appointment timing manually by call or message.</p>
              </article>
            </div>
          </div>
          <aside className="contact-card">
            <h3>Request this department</h3>
            <a href={`/appointment?dept=${department.slug}`}>Open appointment request</a>
            <a href={hospital.phoneHref}>Call {hospital.phone}</a>
            <a href={hospital.whatsappHref}>WhatsApp desk</a>
          </aside>
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
