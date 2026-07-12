import type { Metadata } from "next";
import { departments, SITE_URL } from "@/app/lib/data";
import { DoctorDirectory } from "@/app/components/Directories";
import { PageHero, PageShell, PrimaryActions, SectionHeader } from "@/app/components/SiteShell";
import { getPublicDoctors } from "@/app/lib/public-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Doctors",
  description: "Search and filter Protone Care Hospital doctor profiles by department and speciality. Placeholder cards are used until approved photos are available.",
  alternates: { canonical: `${SITE_URL}/doctors` },
};

export default async function DoctorsPage() {
  const doctors = await getPublicDoctors();
  return (
    <PageShell>
      <PageHero
        eyebrow="Doctors"
        title="Doctor profiles with approved source information"
        body="Profiles use the confirmed list and approved photos where available. No bios or achievements are invented."
      >
        <PrimaryActions />
      </PageHero>
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
