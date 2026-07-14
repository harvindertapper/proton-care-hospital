import type { Metadata } from "next";
import { departments, SITE_URL } from "@/app/lib/data";
import { DoctorDirectory } from "@/app/components/Directories";
import { PageHero, PageShell, PrimaryActions, SectionHeader, Breadcrumbs } from "@/app/components/SiteShell";
import { getPublicDoctors } from "@/app/lib/public-data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Doctors",
  description: "Consult with our team of medical practitioners, specialists, and senior clinical consultants at Protone Care Hospital, Gurugram.",
  alternates: { canonical: `${SITE_URL}/doctors` },
};

export default async function DoctorsPage() {
  const doctors = await getPublicDoctors();
  return (
    <PageShell>
      <PageHero
        eyebrow="Doctors"
        title="Our Senior Medical Consultants & Specialists"
        body="Meet our team of highly qualified clinical experts, surgeons, and physicians dedicated to delivering compassionate care at Gurugram."
      >
        <PrimaryActions />
      </PageHero>
      <Breadcrumbs paths={[{ label: "Doctors" }]} />
      <section className="section">
        <div className="container">
          <SectionHeader
            eyebrow="Find a doctor"
            title="Search by department, speciality, or qualification"
            body="Appointment requests remain department-only even when opened from a doctor card."
          />
          <DoctorDirectory doctors={doctors} departments={departments} />
        </div>
      </section>
    </PageShell>
  );
}
